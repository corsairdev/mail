import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { readGoogleConnections } from "@/server/corsair";
import { ensureReady } from "@/server/db";
import { resolveSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureReady();
  const session = await resolveSession();
  if (!session.tenantId) redirect("/sign-in");
  if (!session.demo) {
    const links = await readGoogleConnections(session.tenantId);
    if (!links.gmail || !links.calendar) redirect("/sign-in");
  }
  return <AppShell>{children}</AppShell>;
}
