import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureReady } from "@/server/db";
import { resolveSession } from "@/server/session";
import { proposeFromThread, runCommand, streamDraft, streamSummary } from "@/server/ai/run";

async function tenantId() {
  await ensureReady();
  const session = await resolveSession();
  return session.tenantId;
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const tenant = await tenantId();
  if (!tenant) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { action } = await context.params;
  const json: unknown = await request.json().catch(() => null);
  try {
    if (action === "summarize") {
      const input = z.object({ threadId: z.string().min(1) }).parse(json);
      return streamSummary(tenant, input.threadId);
    }
    if (action === "draft") {
      const input = z.object({
        threadId: z.string().min(1),
        tone: z.enum(["friendly", "brief", "formal"]).default("friendly"),
        instruction: z.string().max(1000).optional(),
      }).parse(json);
      return streamDraft(tenant, input.threadId, input.tone, input.instruction);
    }
    if (action === "schedule") {
      const input = z.object({ threadId: z.string().min(1) }).parse(json);
      return NextResponse.json(await proposeFromThread(tenant, input.threadId));
    }
    if (action === "command") {
      const input = z.object({ prompt: z.string().min(1).max(2000), timeZone: z.string().default("UTC") }).parse(json);
      return NextResponse.json(await runCommand(tenant, input.prompt, input.timeZone));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
