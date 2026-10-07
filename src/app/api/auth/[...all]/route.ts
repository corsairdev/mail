import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";

const missing = () => NextResponse.json({ error: "Google sign-in is not configured" }, { status: 404 });

export async function GET(request: Request) {
  const auth = getAuth();
  if (!auth) return missing();
  return toNextJsHandler(auth).GET(request);
}

export async function POST(request: Request) {
  const auth = getAuth();
  if (!auth) return missing();
  return toNextJsHandler(auth).POST(request);
}
