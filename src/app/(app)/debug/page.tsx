import { notFound } from "next/navigation";
import { DebugClient } from "@/components/debug-client";

export const dynamic = "force-dynamic";

export default function DebugPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG !== "true") notFound();
  return <DebugClient />;
}
