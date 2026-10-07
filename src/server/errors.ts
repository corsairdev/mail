import { AuthMissingError, ReconnectRequiredError } from "corsair";
import { TRPCError } from "@trpc/server";

export type AppCode =
  | "AUTH_MISSING"
  | "RECONNECT"
  | "RATE_LIMIT"
  | "NOT_CONFIGURED"
  | "UPSTREAM";

export class AppError extends Error {
  readonly code: AppCode;
  readonly connectUrl: string | null;

  constructor(code: AppCode, message: string, connectUrl: string | null = null) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.connectUrl = connectUrl;
  }
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { error?: { message?: string } } }).body;
    if (body?.error?.message) return body.error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof AuthMissingError) {
    return new AppError(
      "AUTH_MISSING",
      "Connect Google to continue.",
      error.connectUrl,
    );
  }
  if (error instanceof ReconnectRequiredError) {
    return new AppError(
      "RECONNECT",
      "Google needs to be reconnected.",
      error.connectUrl,
    );
  }
  const message = errorText(error);
  if (/429|rate limit|rate_limited|quota exceeded/i.test(message)) {
    return new AppError("RATE_LIMIT", "Google is rate limiting requests. Wait a moment and try again.");
  }
  if (/account not found for tenant|not connected/i.test(message)) {
    return new AppError("AUTH_MISSING", "Connect Google to continue.");
  }
  return new AppError("UPSTREAM", message);
}

export function toTrpcError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const app = toAppError(error);
  const code =
    app.code === "AUTH_MISSING" || app.code === "RECONNECT"
      ? "PRECONDITION_FAILED"
      : app.code === "RATE_LIMIT"
        ? "TOO_MANY_REQUESTS"
        : app.code === "NOT_CONFIGURED"
          ? "PRECONDITION_FAILED"
          : "INTERNAL_SERVER_ERROR";
  return new TRPCError({
    code,
    message: app.message,
    cause: { appCode: app.code, connectUrl: app.connectUrl },
  });
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
