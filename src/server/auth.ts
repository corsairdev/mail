import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import { account, session, user, verification } from "./db/schema";
import { appUrl, isAuthConfigured } from "./flags";

type AuthInstance = ReturnType<typeof betterAuth>;

let auth: AuthInstance | null = null;

export function getAuth() {
  if (!isAuthConfigured()) return null;
  auth ??= betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: appUrl(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        accessType: "offline",
        prompt: "consent",
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/calendar.freebusy",
        ],
      },
    },
  }) as AuthInstance;
  return auth;
}
