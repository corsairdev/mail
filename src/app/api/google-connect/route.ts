import { NextResponse } from "next/server";
import { installGoogleMailbox } from "@/server/corsair";
import { resolveSession } from "@/server/session";
import { kickSync, registerWatches } from "@/server/sync";

export async function POST() {
  const session = await resolveSession();
  if (!session.tenantId || session.demo) {
    return NextResponse.json({ error: "Sign in before connecting Google." }, { status: 401 });
  }
  try {
    const result = await installGoogleMailbox(session.tenantId);
    if (result === "refresh") return NextResponse.json({ refresh: true });
    kickSync(session.tenantId);
    await registerWatches(session.tenantId).catch((cause: unknown) => {
      console.error("[connect] watch", cause instanceof Error ? cause.message : "failed");
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect Google.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
