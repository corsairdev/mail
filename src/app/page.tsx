import { redirect } from "next/navigation";
import { readGoogleConnections } from "@/server/corsair";
import { ensureReady } from "@/server/db";
import { resolveSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureReady();
  const session = await resolveSession();
  if (!session.tenantId || session.demo) redirect(session.tenantId ? "/mail" : "/sign-in");
  const links = await readGoogleConnections(session.tenantId);
  redirect(links.gmail && links.calendar ? "/mail" : "/sign-in");
}
