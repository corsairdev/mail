"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type Proposal = {
  summary: string;
  start: string;
  end: string;
  timeZone: string;
  attendees: string[];
  meet: boolean;
  description: string;
};

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    setAnswer("");
    setProposal(null);
    try {
      const response = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const json = await response.json() as { text?: string; proposal?: Proposal | null; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Command failed");
      setAnswer(json.text ?? "");
      setProposal(json.proposal ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump or ask">
      <CommandInput placeholder="Search or ask…" value={prompt} onValueChange={setPrompt} />
      <CommandList>
        <CommandEmpty>No matching command. Press Ask.</CommandEmpty>
        <CommandGroup heading="Go">
          <CommandItem onSelect={() => { router.push("/mail"); onOpenChange(false); }}>Inbox</CommandItem>
          <CommandItem onSelect={() => { router.push("/calendar"); onOpenChange(false); }}>Calendar</CommandItem>
          <CommandItem onSelect={() => { router.push("/settings"); onOpenChange(false); }}>Settings</CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="border-t p-2">
        <Button data-testid="command-ask" disabled={!prompt.trim() || busy} onClick={() => void ask()}>{busy ? "Thinking…" : "Ask"}</Button>
        {answer ? <p className="mt-2 text-sm" data-testid="command-answer">{answer}</p> : null}
        {proposal ? (
          <div className="mt-2 rounded-lg border p-2" data-testid="command-confirm">
            <p className="text-sm font-medium">{proposal.summary}</p>
            <p className="text-xs text-muted-foreground">{new Date(proposal.start).toLocaleString()} · {proposal.attendees.join(", ")}</p>
            <Button className="mt-2" size="sm" onClick={async () => {
              await queryClient.getMutationCache().build(queryClient, trpc.calendar.create.mutationOptions()).execute(proposal);
              toast.success("Event created");
              setProposal(null);
              onOpenChange(false);
            }}>Confirm and create</Button>
          </div>
        ) : null}
      </div>
    </CommandDialog>
  );
}
