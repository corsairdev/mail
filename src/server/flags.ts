export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.BETTER_AUTH_SECRET &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export const DEMO_EMAIL = "alex.chen@northwind.dev";
export const DEMO_NAME = "Alex Chen";
export const DEMO_TENANT = "demo";
