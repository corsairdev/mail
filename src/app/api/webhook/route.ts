import { processWebhook } from "corsair";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCorsair } from "@/server/corsair";
import { getDb } from "@/server/db";
import { user } from "@/server/db/schema";
import { gmailPushAddress } from "@/server/gmail-push";
import { webhookAls } from "@/server/live";

async function tenantForPush(explicit: string | undefined, body: unknown) {
  const email = gmailPushAddress(body);
  if (email) {
    const [row] = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .limit(1);
    if (row) return row.id;
    return undefined;
  }
  return explicit;
}

export async function POST(request: Request) {
  console.info("[webhook] gmail push received");
  const corsair = getCorsair();
  if (!corsair) return NextResponse.json({ success: false }, { status: 503 });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = request.headers.get("content-type")?.includes("application/json")
    ? await request.json()
    : await request.text();
  const tenantId = await tenantForPush(new URL(request.url).searchParams.get("tenantId") ?? undefined, body);
  try {
    const result = await webhookAls.run({ tenantId: tenantId ?? "" }, () =>
      processWebhook(corsair, headers, body, tenantId ? { tenantId } : undefined),
    );
    const saved = !result.response || typeof result.response !== "object" || !("success" in result.response) || result.response.success !== false;
    if (tenantId && !saved) {
      const { pullNewMail } = await import("@/server/sync");
      await pullNewMail(tenantId);
    }
    return NextResponse.json(result.response ?? { success: true });
  } catch (error) {
    console.error("[webhook]", error instanceof Error ? error.message : "failed");
    if (tenantId) {
      const { pullNewMail } = await import("@/server/sync");
      await pullNewMail(tenantId).catch(() => undefined);
    }
    return NextResponse.json({ success: true });
  }
}
