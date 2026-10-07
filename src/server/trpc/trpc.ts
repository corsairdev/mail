import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { ensureReady } from "../db";
import { toTrpcError } from "../errors";
import { resolveSession, type SessionUser } from "../session";
import { isDemoMode } from "../flags";
import { primeGoogleCredentials } from "../corsair";

export type Context = {
  demo: boolean;
  authEnabled: boolean;
  user: SessionUser;
  tenantId: string | null;
};

export async function createContext(): Promise<Context> {
  await ensureReady();
  if (!isDemoMode()) await primeGoogleCredentials();
  return resolveSession();
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        appCode: error.cause && typeof error.cause === "object" && "appCode" in error.cause ? String(error.cause.appCode) : null,
        connectUrl: error.cause && typeof error.cause === "object" && "connectUrl" in error.cause && typeof error.cause.connectUrl === "string" ? error.cause.connectUrl : null,
        zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure.use(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    throw toTrpcError(error);
  }
});

export const tenantProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to continue." });
  }
  return next({ ctx: { ...ctx, tenantId: ctx.tenantId } });
});
