import { toNextJsHandler } from "corsair";
import { NextResponse } from "next/server";
import { getCorsair } from "@/server/corsair";

function handlers() {
  const corsair = getCorsair();
  if (!corsair) return null;
  return toNextJsHandler(corsair, { basePath: "/api/corsair" });
}

async function missing() {
  return NextResponse.json({ error: "Corsair is not configured" }, { status: 503 });
}

export async function GET(request: Request) {
  const route = handlers();
  if (!route) return missing();
  return route.GET(request);
}

export async function POST(request: Request) {
  const route = handlers();
  if (!route) return missing();
  return route.POST(request);
}

export async function OPTIONS(request: Request) {
  const route = handlers();
  if (!route) return missing();
  return route.OPTIONS(request);
}
