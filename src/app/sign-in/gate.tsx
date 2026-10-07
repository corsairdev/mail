"use client";

import { useQuery } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConnectionStatus } from "@/lib/corsair-client";
import { useTRPC } from "@/trpc/react";

const authClient = createAuthClient();
const RETURN_PATH = "/sign-in?connect=mailbox";

async function installMailbox(): Promise<"ok" | "refresh"> {
  const response = await fetch("/api/google-connect", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; refresh?: boolean; error?: string } | null;
  if (body?.refresh) return "refresh";
  if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not connect Google.");
  return "ok";
}

export function SignInGate() {
  const trpc = useTRPC();
  const router = useRouter();
  const requested = useSearchParams().get("connect");
  const session = useQuery(trpc.session.queryOptions());
  const tenantId = session.data?.user.id;
  const status = useConnectionStatus(tenantId ? { tenantId } : undefined);
  const started = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gmail = status.data?.gmail;
  const calendar = status.data?.googlecalendar;
  const both = gmail === "connected" && calendar === "connected";

  useEffect(() => {
    if (session.data?.demo || (session.data?.signedIn && both)) router.replace("/mail");
  }, [both, router, session.data?.demo, session.data?.signedIn]);

  useEffect(() => {
    if (started.current || !tenantId || requested !== "mailbox") return;
    started.current = true;
    void installMailbox()
      .then((result) => {
        if (result === "ok") router.replace("/mail");
      })
      .catch((cause: unknown) => {
        started.current = false;
        setError(cause instanceof Error ? cause.message : "Could not connect Google.");
      });
  }, [requested, router, tenantId]);

  async function openConnect() {
    setError(null);
    setPending(true);
    try {
      if (!tenantId) {
        await authClient.signIn.social({ provider: "google", callbackURL: RETURN_PATH });
        return;
      }
      const result = await installMailbox();
      if (result === "refresh") {
        await authClient.signIn.social({ provider: "google", callbackURL: RETURN_PATH });
        return;
      }
      router.replace("/mail");
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : "Could not connect Google.");
    }
  }

  if (session.isPending || (tenantId && status.loading && !status.data)) {
    return <p className="mt-8 text-sm text-[#5f6368]">Loading…</p>;
  }

  if (session.data && !session.data.authEnabled && !session.data.demo) {
    return <p className="mt-8 text-sm">Google sign-in is not configured.</p>;
  }

  if (!session.data?.signedIn) {
    return (
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={openConnect}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-5 text-[15px] font-medium text-[#1f1f1f] shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition hover:bg-[#f8f9fa] hover:shadow-[0_1px_3px_rgba(0,0,0,0.4)] disabled:opacity-60"
        >
          <GoogleMark />
          {pending ? "Opening Google…" : "Continue with Google"}
        </button>
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
      <p className="truncate text-center text-xs text-[#5f6368]">{session.data.user.email}</p>
      <ConsentButton label="Gmail" state={gmail} disabled={pending || gmail === "connected"} onClick={openConnect} />
      <ConsentButton
        label="Google Calendar"
        state={calendar}
        disabled={pending || calendar === "connected"}
        onClick={openConnect}
      />
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5 shrink-0">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.065 0-9.627-3.322-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

function ConsentButton({
  label,
  state,
  disabled,
  onClick,
}: {
  label: string;
  state?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const connected = state === "connected";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 items-center justify-between rounded-full bg-[#c2e7ff] px-5 text-[15px] font-medium text-[#001d35] disabled:opacity-60"
    >
      <span>{label}</span>
      <span className="text-sm font-normal">{connected ? "Connected" : "Connect"}</span>
    </button>
  );
}
