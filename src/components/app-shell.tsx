"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Calendar, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar as MiniCalendar } from "@/components/ui/calendar";
import { CommandPalette } from "@/components/ai/command-palette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const inbox = pathname.startsWith("/mail");
  const calendar = pathname.startsWith("/calendar");
  const trpc = useTRPC();
  const session = useQuery(trpc.session.queryOptions());
  const list = useQuery(trpc.mail.list.queryOptions({ folder: "inbox", limit: 1 }));
  const { theme, setTheme } = useTheme();
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const [chord, setChord] = useState(false);
  const dateParam = useSearchParams().get("date");
  const selectedDay = useMemo(() => parseCalendarDay(dateParam) ?? new Date(), [dateParam]);
  const [miniMonth, setMiniMonth] = useState(selectedDay);
  useEffect(() => { setMiniMonth(selectedDay); }, [selectedDay]);

  useEffect(() => {
    const unread = list.data?.unread ?? 0;
    document.title = unread ? `(${unread}) Inbox` : "Inbox";
  }, [list.data?.unread]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
        return;
      }
      if (typing) return;
      if (event.key === "?") setHelp(true);
      if (chord) {
        if (event.key === "i") router.push("/mail");
        if (event.key === "s") router.push("/mail?folder=starred");
        if (event.key === "t") router.push("/mail?folder=sent");
        if (event.key === "c") router.push("/calendar");
        setChord(false);
        return;
      }
      if (event.key === "g") setChord(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chord, router]);

  return (
    <div className="flex h-dvh flex-col">
      {inbox || calendar ? null : (
      <header className="flex h-14 items-center gap-2 border-b px-3">
        <a href="/mail" className="flex items-center gap-2 font-medium"><img src="/corsair.png" alt="" width={20} height={20} className="size-5" /> mail</a>
        <nav className="ml-4 flex gap-1">
          <Button variant="ghost" onClick={() => router.push("/mail")}>Mail</Button>
          <Button variant="ghost" onClick={() => router.push("/calendar")}><Calendar className="size-4" /> Calendar</Button>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {session.data?.demo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900" data-testid="connection-state">Demo mailbox</span> : <span data-testid="connection-state" className="text-xs text-muted-foreground">{session.data?.user.email}</span>}
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
          <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => router.push("/settings")}><Settings className="size-4" /></Button>
        </div>
      </header>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">{children}</div>
        {inbox || calendar ? null : (
        <aside className="hidden w-64 shrink-0 border-l p-3 lg:block">
          <MiniCalendar
            mode="single"
            required
            selected={selectedDay}
            month={miniMonth}
            onMonthChange={setMiniMonth}
            onSelect={(date) => {
              if (!date) return;
              router.push(`/calendar?date=${format(date, "yyyy-MM-dd")}`);
            }}
          />
        </aside>
        )}
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
          <ul className="space-y-1 text-sm">
            {[
              ["c", "Compose"],
              ["j / k", "Move"],
              ["Enter", "Open"],
              ["e", "Archive"],
              ["#", "Trash"],
              ["r", "Reply"],
              ["/", "Search"],
              ["g then i", "Inbox"],
              ["g then s", "Starred"],
              ["g then c", "Calendar"],
              ["⌘K", "Command palette"],
              ["?", "This dialog"],
            ].map(([key, label]) => <li key={key} className="flex justify-between"><span>{label}</span><kbd className="rounded bg-muted px-1.5">{key}</kbd></li>)}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parseCalendarDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function notifyError(message: string) {
  toast.error(message);
}
