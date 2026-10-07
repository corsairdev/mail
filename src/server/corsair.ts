import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createCorsair } from "corsair";
import { gmail } from "@corsair-dev/gmail";
import { googlecalendar } from "@corsair-dev/googlecalendar";
import { getDb, getPool } from "./db";
import { account } from "./db/schema";
import { appUrl } from "./flags";
import { recordWebhook } from "./live";

const rateLimit = {
  RATE_LIMIT_ERROR: {
    match: (error: Error) => /429|rate limit|rate_limited/i.test(error.message),
    handler: async () => ({
      maxRetries: 3,
      retryStrategy: "exponential_backoff_jitter" as const,
    }),
  },
};

function build() {
  const apiKey = process.env.CORSAIR_API_KEY;
  const signingSecret = process.env.CORSAIR_SIGNING_SECRET;
  return createCorsair({
    multiTenancy: true,
    database: getPool(),
    kek: process.env.CORSAIR_KEK ?? "",
    ...(apiKey && signingSecret
      ? { hub: { projectApiKey: apiKey, signingSecret, redirectURL: `${appUrl()}/sign-in` } }
      : {}),
    permissions: {
      timeout: "30m",
      onTimeout: "deny",
      mode: "asynchronous",
    },
    errorHandlers: rateLimit,
    plugins: [
      gmail({
        permissions: { mode: "open" },
        errorHandlers: rateLimit,
        webhookHooks: {
          messageChanged: {
            after: async (ctx, result) => {
              await recordWebhook("gmail", result.data ?? result, ctx.tenantId);
              const event = result.data;
              const threadId = event?.message?.threadId ?? event?.message?.id;
              if (!ctx.tenantId || !threadId || event?.type === "messageDeleted") return;
              const { ingestThread } = await import("./sync");
              await ingestThread(ctx.tenantId, threadId);
            },
          },
        },
      }),
      googlecalendar({
        permissions: { mode: "open" },
        errorHandlers: rateLimit,
        webhookHooks: {
          onEventChanged: {
            after: async (ctx, result) => {
              await recordWebhook("googlecalendar", result, ctx.tenantId);
            },
          },
        },
      }),
    ],
  });
}

export type CorsairApp = ReturnType<typeof build>;

let corsair: CorsairApp | null = null;

export function getCorsair(): CorsairApp | null {
  if (!process.env.CORSAIR_KEK || !process.env.DATABASE_URL) return null;
  corsair ??= build();
  return corsair;
}

export function requireCorsair(): CorsairApp {
  const instance = getCorsair();
  if (!instance) {
    throw new Error("Corsair is not configured. Set CORSAIR_KEK, DATABASE_URL, and Hub keys.");
  }
  return instance;
}

export function withTenant(tenantId: string) {
  return requireCorsair().withTenant(tenantId);
}

export async function readGoogleConnections(tenantId: string): Promise<{ gmail: boolean; calendar: boolean }> {
  const corsair = getCorsair();
  if (!corsair) return { gmail: false, calendar: false };
  try {
    const { getConnectStatusForTenant } = await import("corsair/hub");
    const status = await getConnectStatusForTenant(corsair, tenantId, {
      pluginIds: ["gmail", "googlecalendar"],
    });
    const connected = (plugin: string) => status.plugins.some((entry) => entry.plugin === plugin && entry.connected);
    return { gmail: connected("gmail"), calendar: connected("googlecalendar") };
  } catch {
    return { gmail: false, calendar: false };
  }
}

let primed: Promise<void> | null = null;

export function primeGoogleCredentials(): Promise<void> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return Promise.resolve();
  primed ??= (async () => {
    const corsair = getCorsair();
    if (!corsair) return;
    const { setupCorsair } = await import("corsair/setup");
    await setupCorsair(corsair, {
      silent: true,
      credentials: {
        gmail: {
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          ...(process.env.GOOGLE_PUBSUB_TOPIC ? { topic_id: process.env.GOOGLE_PUBSUB_TOPIC } : {}),
          ...(process.env.GOOGLE_PUBSUB_AUDIENCE ? { pubsub_audience: process.env.GOOGLE_PUBSUB_AUDIENCE } : {}),
        },
        googlecalendar: {
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        },
      },
    });
  })().catch((error: unknown) => {
    primed = null;
    console.error("[corsair] credential setup failed:", error instanceof Error ? error.message : "unknown");
  });
  return primed;
}

export async function installGoogleMailbox(tenantId: string): Promise<"ok" | "refresh"> {
  await primeGoogleCredentials();
  const [row] = await getDb()
    .select()
    .from(account)
    .where(and(eq(account.userId, tenantId), eq(account.providerId, "google")))
    .limit(1);
  const accessToken = row?.accessToken;
  const refreshToken = row?.refreshToken;
  if (!accessToken || !refreshToken) return "refresh";

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileResponse.ok) return "refresh";
  const profile = (await profileResponse.json()) as { emailAddress?: string; historyId?: string };
  if (!profile.emailAddress || !profile.historyId) return "refresh";

  const { setupCorsair } = await import("corsair/setup");
  await setupCorsair(requireCorsair(), { tenantId, silent: true });
  const tenant = withTenant(tenantId);
  const expiresAt = String(
    Math.floor((row.accessTokenExpiresAt?.getTime() ?? Date.now() + 3_600_000) / 1000),
  );
  for (const plugin of ["gmail", "googlecalendar"] as const) {
    await tenant[plugin].keys.set_access_token(accessToken);
    await tenant[plugin].keys.set_refresh_token(refreshToken);
    await tenant[plugin].keys.set_expires_at(expiresAt);
    if (row.scope) await tenant[plugin].keys.set_scope(row.scope);
  }
  await tenant.gmail.keys.set_email_address(profile.emailAddress);
  await tenant.gmail.keys.set_last_history_id(profile.historyId);
  const calendarKeys = tenant.googlecalendar.keys as typeof tenant.googlecalendar.keys & {
    get_channel_id: () => Promise<string | null>;
    set_channel_id: (value: string) => Promise<void>;
  };
  if (!(await calendarKeys.get_channel_id())) await calendarKeys.set_channel_id(randomUUID());
  return "ok";
}
