import { headers } from "next/headers";
import { getAuth } from "./auth";
import { DEMO_EMAIL, DEMO_NAME, DEMO_TENANT, isAuthConfigured, isDemoMode } from "./flags";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export async function resolveSession(): Promise<{
  demo: boolean;
  authEnabled: boolean;
  user: SessionUser;
  tenantId: string | null;
}> {
  const demo = isDemoMode();
  const authEnabled = isAuthConfigured();
  if (demo || !authEnabled) {
    return {
      demo,
      authEnabled,
      tenantId: DEMO_TENANT,
      user: { id: DEMO_TENANT, name: DEMO_NAME, email: DEMO_EMAIL, image: null },
    };
  }
  const auth = getAuth();
  const session = auth ? await auth.api.getSession({ headers: await headers() }) : null;
  if (!session) {
    return { demo: false, authEnabled: true, tenantId: null, user: { id: "", name: "", email: "", image: null } };
  }
  return {
    demo: false,
    authEnabled: true,
    tenantId: session.user.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
    },
  };
}
