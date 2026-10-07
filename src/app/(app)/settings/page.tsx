"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const session = useQuery(trpc.session.queryOptions());
  const update = useMutation(trpc.settings.update.mutationOptions({ onSuccess: () => toast.success("Saved") }));
  const sync = useMutation(trpc.sync.step.mutationOptions({ onSuccess: (result) => toast(result.detail) }));
  const watches = useMutation(trpc.sync.registerWatches.mutationOptions({
    onSuccess: () => toast.success("Watch registration requested"),
    onError: (error) => toast.error(error.message),
  }));
  const [zone, setZone] = useState("");

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl">Settings</h1>
      <p className="text-sm text-muted-foreground">{settings.data?.email}</p>
      <div className="space-y-2">
        <Label htmlFor="tz">Timezone</Label>
        <Input id="tz" defaultValue={settings.data?.timezone} onChange={(event) => setZone(event.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="images" checked={settings.data?.blockRemoteImages ?? false} onCheckedChange={(checked) => update.mutate({ blockRemoteImages: checked })} />
        <Label htmlFor="images">Block remote images</Label>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => update.mutate({ timezone: zone || settings.data?.timezone })}>Save timezone</Button>
        <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>Sync now</Button>
        <Button variant="outline" onClick={() => watches.mutate()} disabled={watches.isPending}>Register watches</Button>
      </div>
      {session.data?.demo ? <p className="text-sm text-muted-foreground">Demo mode is on. Set DEMO_MODE=false to use a live Google account.</p> : null}
      {!session.data?.authEnabled && !session.data?.demo ? <p className="text-sm">Google sign-in is not configured.</p> : null}
    </div>
  );
}
