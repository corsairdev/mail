import { eq } from "drizzle-orm";
import { setupCorsair } from "corsair/setup";
import { renewSubscriptions } from "corsair/oauth";
import { getDb, getPool } from "./db";
import { syncState } from "./db/schema";
import { getCorsair, withTenant } from "./corsair";
import { AppError, toAppError } from "./errors";
import { isDemoMode } from "./flags";
import { emitLive, recentEvents } from "./live";
import { ensureDemo, insertDemoMessage } from "./demo/store";

function shouldPause(reason: string) {
  return /quota|forbidden|rate/i.test(reason);
}

function apiReason(error: unknown): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: unknown }).body;
    const record = body && typeof body === "object" ? (body as { error?: { message?: string }; message?: string }) : null;
    const message = record?.error?.message ?? record?.message;
    if (message) return message;
  }
  return error instanceof Error ? error.message : "Sync failed";
}

function messageHeader(message: { payload?: { headers?: { name?: string | null; value?: string | null }[] } | null }, name: string) {
  return message.payload?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function messageMillis(value: unknown): string {
  if (value instanceof Date) return String(value.getTime());
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "";
}

async function writeState(tenantId: string, plugin: string, patch: Partial<typeof syncState.$inferInsert> & { status: string }) {
  const db = getDb();
  await db
    .insert(syncState)
    .values({
      tenantId,
      plugin,
      status: patch.status,
      progress: patch.progress ?? 0,
      detail: patch.detail ?? "",
      watchExpiresAt: patch.watchExpiresAt,
      watchResource: patch.watchResource,
      lastError: patch.lastError,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [syncState.tenantId, syncState.plugin],
      set: {
        status: patch.status,
        progress: patch.progress ?? 0,
        detail: patch.detail ?? "",
        watchExpiresAt: patch.watchExpiresAt,
        watchResource: patch.watchResource,
        lastError: patch.lastError,
        updatedAt: new Date(),
      },
    });
}

export async function readSync(tenantId: string) {
  if (isDemoMode()) await ensureDemo(tenantId);
  const rows = await getDb().select().from(syncState).where(eq(syncState.tenantId, tenantId));
  return rows.map((row) => ({
    plugin: row.plugin,
    status: row.status,
    progress: row.progress,
    detail: row.detail,
    watchExpiresAt: row.watchExpiresAt?.toISOString() ?? null,
    watchResource: row.watchResource,
    lastError: row.lastError,
  }));
}

type Tenant = ReturnType<typeof withTenant>;

async function saveThread(tenant: Tenant, id: string) {
  const thread = await tenant.gmail.api.threads.get({ id, format: "full" });
  for (const message of thread.messages ?? []) {
    if (!message.id) continue;
    await tenant.gmail.db.messages.upsertByEntityId(message.id, {
      id: message.id,
      threadId: message.threadId ?? id,
      labelIds: message.labelIds ?? [],
      snippet: message.snippet ?? "",
      internalDate: messageMillis(message.internalDate),
      from: messageHeader(message, "From"),
      to: messageHeader(message, "To"),
      subject: messageHeader(message, "Subject"),
      payload: message.payload,
      createdAt: new Date(),
    });
  }
}

async function threadIds(tenant: Tenant, label: string, maxResults: number) {
  const page = await tenant.gmail.api.threads.list({ labelIds: [label], maxResults });
  return (page.threads ?? []).map((thread) => thread.id).filter((id): id is string => Boolean(id));
}

async function hasBody(id: string) {
  const known = await getPool().query(
    "select 1 from corsair_entities where entity_type = 'messages' and data->>'threadId' = $1 and coalesce(data->>'from', '') <> '' limit 1",
    [id],
  );
  return Boolean(known.rowCount);
}

async function saveMissing(tenant: Tenant, ids: string[]) {
  for (const id of ids) {
    if (!(await hasBody(id))) await saveThread(tenant, id);
  }
}

async function refreshRecent(tenant: Tenant, _tenantId: string) {
  const inbox = await threadIds(tenant, "INBOX", 5);
  await saveMissing(tenant, inbox);
  try {
    await saveMissing(tenant, await threadIds(tenant, "SENT", 3));
  } catch (error) {
    if (!shouldPause(apiReason(error))) throw error;
  }
}

export async function pullNewMail(tenantId: string) {
  if (!tenantId || isDemoMode()) return;
  if (!getCorsair()) return;
  try {
    await refreshRecent(withTenant(tenantId), tenantId);
  } catch (error) {
    console.error("[sync] pull", apiReason(error));
  }
}

export async function ingestThread(tenantId: string, threadId: string) {
  if (isDemoMode()) return;
  await saveThread(withTenant(tenantId), threadId);
}

const drains = new Set<string>();
let gmailQuietUntil = 0;

function quietLeft() {
  return Math.max(0, gmailQuietUntil - Date.now());
}

function hushGmail() {
  gmailQuietUntil = Date.now() + 25_000;
}

export function kickSync(tenantId: string) {
  if (isDemoMode() || drains.has(tenantId)) return;
  drains.add(tenantId);
  void (async () => {
    try {
      for (let step = 0; step < 800; step += 1) {
        const result = await runSyncStep(tenantId);
        if (result.done) break;
        if (result.waitMs) await new Promise((resolve) => setTimeout(resolve, result.waitMs));
      }
    } catch (error) {
      console.error("[sync]", apiReason(error));
    } finally {
      drains.delete(tenantId);
    }
  })();
}

export async function syncStep(tenantId: string) {
  if (isDemoMode()) return runSyncStep(tenantId);
  kickSync(tenantId);
  const rows = await readSync(tenantId);
  const gmail = rows.find((row) => row.plugin === "gmail");
  return {
    done: gmail?.status === "ready",
    progress: gmail?.progress ?? 0,
    detail: gmail?.status === "ready" ? "Up to date" : "Loading your mail",
  };
}

async function runSyncStep(tenantId: string) {
  if (isDemoMode()) {
    const expires = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    await writeState(tenantId, "gmail", { status: "ready", progress: 100, detail: "Demo mailbox", watchExpiresAt: expires, watchResource: "demo" });
    await writeState(tenantId, "googlecalendar", { status: "ready", progress: 100, detail: "Demo calendar", watchExpiresAt: expires, watchResource: "demo" });
    return { done: true, progress: 100, detail: "Demo data ready" };
  }
  const corsair = getCorsair();
  if (!corsair) throw new AppError("NOT_CONFIGURED", "Corsair is not configured.");
  const quiet = quietLeft();
  if (quiet > 0) return { done: false, progress: 0, detail: "Gmail is pausing so the rest of your mail can load.", waitMs: quiet };
  const rows = await getDb().select().from(syncState).where(eq(syncState.tenantId, tenantId));
  const current = rows.find((row) => row.plugin === "gmail");
  try {
    const tenant = withTenant(tenantId);
    try {
      await refreshRecent(tenant, tenantId);
    } catch (error) {
      if (shouldPause(apiReason(error))) {
        hushGmail();
        console.error("[sync] gmail blocked", apiReason(error));
        return { done: false, progress: current?.progress ?? 0, detail: "Gmail is pausing so the rest of your mail can load.", waitMs: 25_000 };
      }
      throw error;
    }
    if (current?.status !== "ready") {
      await writeState(tenantId, "gmail", { status: "ready", progress: 100, detail: "Up to date" });
    }
    return { done: false, progress: 100, detail: "Up to date", waitMs: 4_000 };
  } catch (error) {
    console.error("[sync]", apiReason(error));
    if (shouldPause(apiReason(error))) {
      hushGmail();
      return { done: false, progress: current?.progress ?? 0, detail: "Gmail is pausing so the rest of your mail can load.", waitMs: 25_000 };
    }
    const app = toAppError(error);
    if (app.code === "RATE_LIMIT") {
      hushGmail();
      return { done: false, progress: current?.progress ?? 0, detail: "Gmail is pausing so the rest of your mail can load.", waitMs: 25_000 };
    }
    if (app.code === "AUTH_MISSING" || app.code === "RECONNECT") {
      await writeState(tenantId, "gmail", { status: "needs_connect", progress: 0, detail: "", lastError: null });
      return { done: false, progress: 0, detail: app.message };
    }
    await writeState(tenantId, "gmail", { status: "error", progress: 0, detail: "", lastError: app.message });
    throw app;
  }
}

export async function registerWatches(tenantId: string) {
  if (isDemoMode()) return syncStep(tenantId);
  const corsair = getCorsair();
  if (!corsair) throw new AppError("NOT_CONFIGURED", "Set CORSAIR_KEK and Hub keys before registering watches.");
  const gmailCreds: Record<string, string> = {};
  const calendarCreds: Record<string, string> = {};
  if (process.env.GOOGLE_CLIENT_ID) {
    gmailCreds.client_id = process.env.GOOGLE_CLIENT_ID;
    calendarCreds.client_id = process.env.GOOGLE_CLIENT_ID;
  }
  if (process.env.GOOGLE_CLIENT_SECRET) {
    gmailCreds.client_secret = process.env.GOOGLE_CLIENT_SECRET;
    calendarCreds.client_secret = process.env.GOOGLE_CLIENT_SECRET;
  }
  if (process.env.GOOGLE_PUBSUB_TOPIC) gmailCreds.topic_id = process.env.GOOGLE_PUBSUB_TOPIC;
  if (process.env.GOOGLE_PUBSUB_AUDIENCE) gmailCreds.pubsub_audience = process.env.GOOGLE_PUBSUB_AUDIENCE;
  await setupCorsair(corsair, {
    silent: true,
    credentials: { gmail: gmailCreds, googlecalendar: calendarCreds },
  });
  await setupCorsair(corsair, { tenantId, silent: true });
  const renewed = await renewSubscriptions(corsair);
  const expires = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
  await writeState(tenantId, "gmail", {
    status: "ready",
    progress: 100,
    detail: "Watch armed via Corsair subscribe/renew",
    watchExpiresAt: expires,
    watchResource: process.env.GOOGLE_PUBSUB_TOPIC ?? "users.watch",
    lastError: renewed.failed.includes("gmail") ? "Gmail watch renewal failed" : null,
  });
  await writeState(tenantId, "googlecalendar", {
    status: "ready",
    progress: 100,
    detail: "Channel watch armed via Corsair",
    watchExpiresAt: expires,
    watchResource: "primary/events/watch",
    lastError: renewed.failed.includes("googlecalendar") ? "Calendar watch renewal failed" : null,
  });
  return renewed;
}

export async function renewAllWatches() {
  const corsair = getCorsair();
  if (!corsair || isDemoMode()) return { renewed: [], failed: [] };
  return renewSubscriptions(corsair);
}

export async function replayLast(tenantId: string) {
  const events = await recentEvents(tenantId);
  const last = events[0];
  if (isDemoMode()) {
    await ensureDemo(tenantId);
    const inserted = await insertDemoMessage({
      tenantId,
      fromName: "Webhook",
      fromEmail: "notify@northwind.dev",
      to: ["alex.chen@northwind.dev"],
      subject: last ? `Replay: ${last.summary}` : "Live webhook test",
      html: "<p>This message was injected by the debug replay so you can prove the inbox updates without a refresh.</p>",
      labels: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
    });
    return emitLive(tenantId, "gmail", "messageReceived", inserted.threadId, "New mail");
  }
  if (!last) throw new AppError("UPSTREAM", "No webhook has arrived yet.");
  return emitLive(tenantId, last.plugin, last.eventType, last.entityId, last.summary);
}
