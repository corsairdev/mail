"use client";

import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-xl">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{error.message || "The page failed. Your mailbox is unchanged."}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
