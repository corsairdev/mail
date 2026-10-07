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

  return (
    <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
      {session.data?.signedIn ? (
        <p className="truncate text-center text-xs text-[#5f6368]">{session.data.user.email}</p>
      ) : null}
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
