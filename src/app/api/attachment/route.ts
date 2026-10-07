import { NextResponse } from "next/server";
import { attachmentBytes } from "@/server/mail/service";
import { ensureReady } from "@/server/db";
import { resolveSession } from "@/server/session";

export async function GET(request: Request) {
  await ensureReady();
  const session = await resolveSession();
  if (!session.tenantId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");
  const filename = url.searchParams.get("filename");
  if (!messageId || !filename) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const file = await attachmentBytes(session.tenantId, messageId, filename);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
}
