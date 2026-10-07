"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function DebugClient() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const events = useQuery(trpc.sync.recent.queryOptions());
  const state = useQuery(trpc.sync.state.queryOptions());
  const session = useQuery(trpc.session.queryOptions());
  const replay = useMutation(trpc.sync.replay.mutationOptions({
    onSuccess: () => {
      toast("Replayed");
      void queryClient.invalidateQueries(trpc.sync.recent.queryFilter());
      void queryClient.invalidateQueries(trpc.mail.list.queryFilter());
    },
    onError: (error) => toast.error(error.message),
  }));

  return (
    <div className="space-y-4 p-6" data-testid="debug">
      <div className="flex items-center justify-between">
        <h1 className="text-xl">Webhook debug</h1>
        <Button data-testid="replay" onClick={() => replay.mutate()} disabled={replay.isPending}>Replay last event</Button>
      </div>
      <p className="text-sm text-muted-foreground">Tenant {session.data?.user.id} · {session.data?.demo ? "demo" : "live"}</p>
      <section>
        <h2 className="mb-2 font-medium">Watches</h2>
        <ul className="space-y-1 text-sm">
          {(state.data ?? []).map((row) => (
            <li key={row.plugin}>{row.plugin}: {row.status} · expires {row.watchExpiresAt ?? "n/a"} · {row.watchResource ?? ""} {row.lastError ? `· ${row.lastError}` : ""}</li>
          ))}
          {state.data?.length === 0 ? <li>No watch recorded yet. Use Settings → Register watches.</li> : null}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-medium">Recent events</h2>
        <ul className="space-y-1 font-mono text-xs">
          {(events.data ?? []).map((event) => (
            <li key={event.id}>#{event.id} {event.plugin} {event.eventType} {event.summary} {event.entityId ?? ""}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
