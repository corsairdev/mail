import { NextResponse } from "next/server";
import { ensureReady } from "@/server/db";
import { renewAllWatches } from "@/server/sync";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureReady();
  const result = await renewAllWatches();
  return NextResponse.json(result);
}
