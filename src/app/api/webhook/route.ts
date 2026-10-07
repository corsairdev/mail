import { processWebhook } from "corsair";
import { NextResponse } from "next/server";
import { getCorsair } from "@/server/corsair";
import { webhookAls } from "@/server/live";

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
  const tenantId = new URL(request.url).searchParams.get("tenantId") ?? undefined;
  try {
    const result = await webhookAls.run({ tenantId: tenantId ?? "" }, () =>
      processWebhook(corsair, headers, body, tenantId ? { tenantId } : undefined),
    );
    if (tenantId) {
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
