"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Draft = {
  id?: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  attendees: string;
  meet: boolean;
  calendarId?: string;
};

function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function minutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

function parseCalendarDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function plainText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function CalendarApp() {
  const trpc = useTRPC();
  const router = useRouter();
  const dateParam = useSearchParams().get("date");
  const queryClient = useQueryClient();
  const session = useQuery(trpc.session.queryOptions());
  const settings = useQuery(trpc.settings.get.queryOptions());
  const timeZone = settings.data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [cursor, setCursor] = useState(() => parseCalendarDay(dateParam) ?? new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef<string | null>(null);
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drag, setDrag] = useState<{ day: string; start: number; end: number } | null>(null);
  const weekStart = startOfWeek(cursor, { weekStartsOn: 0 });
  const days = view === "day" ? [cursor] : Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const rangeStart = view === "month" ? addDays(startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1), { weekStartsOn: 0 }), 0) : days[0] ?? cursor;
  const rangeEnd = view === "month" ? addDays(rangeStart, 42) : addDays(days[days.length - 1] ?? cursor, 1);
  const events = useQuery(trpc.calendar.events.queryOptions({ timeMin: rangeStart.toISOString(), timeMax: rangeEnd.toISOString() }));
  const calendars = useQuery(trpc.calendar.calendars.queryOptions());
  const create = useMutation(trpc.calendar.create.mutationOptions({
    onSuccess: () => { toast.success(session.data?.demo ? "Event saved" : "Invite sent"); setDraft(null); void queryClient.invalidateQueries(trpc.calendar.events.queryFilter()); },
    onError: (error) => toast.error(error.message),
  }));
  const update = useMutation(trpc.calendar.update.mutationOptions({
    onSuccess: () => { setDraft(null); void queryClient.invalidateQueries(trpc.calendar.events.queryFilter()); },
    onError: (error) => toast.error(error.message),
  }));
  const remove = useMutation(trpc.calendar.delete.mutationOptions({
    onSuccess: () => void queryClient.invalidateQueries(trpc.calendar.events.queryFilter()),
    onError: (error) => toast.error(error.message),
  }));
  const rsvp = useMutation(trpc.calendar.rsvp.mutationOptions({
    onSuccess: () => void queryClient.invalidateQueries(trpc.calendar.events.queryFilter()),
    onError: (error) => toast.error(error.message),
  }));
  const simulate = useMutation(trpc.calendar.simulateGuest.mutationOptions({
    onSuccess: () => { toast("Guest response updated"); void queryClient.invalidateQueries(trpc.calendar.events.queryFilter()); },
  }));

  const nowKey = dayKey(new Date(), timeZone);
  const nowMinutes = minutes(new Date(), timeZone);
  const selectedKey = dayKey(cursor, timeZone);

  useEffect(() => {
    const next = parseCalendarDay(dateParam);
    if (next) setCursor(next);
  }, [dateParam]);

  useEffect(() => {
    if (view === "month" || placed.current === view) return;
    placed.current = view;
    const start = dayKey(startOfWeek(cursor, { weekStartsOn: 0 }), timeZone);
    const end = dayKey(addDays(startOfWeek(cursor, { weekStartsOn: 0 }), view === "day" ? 0 : 6), timeZone);
    const visible = nowKey >= start && nowKey <= end;
    const hour = visible ? Math.max(nowMinutes / 60 - 1, 0) : 8;
    scroller.current?.scrollTo({ top: hour * 48 });
  }, [view, nowKey, nowMinutes, timeZone, cursor]);

  function go(date: Date) {
    setCursor(date);
    router.replace(`/calendar?date=${format(date, "yyyy-MM-dd")}`, { scroll: false });
  }
  const monthCells = Array.from({ length: 42 }, (_, index) => addDays(rangeStart, index));

  function openDraft(start: Date, end: Date) {
    setDraft({
      summary: "",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      location: "",
      description: "",
      attendees: "",
      meet: true,
    });
  }

  function save() {
    if (!draft?.summary.trim()) { toast.error("Add a title"); return; }
    const payload = {
      summary: draft.summary,
      description: draft.description,
      location: draft.location,
      start: draft.start,
      end: draft.end,
      allDay: draft.allDay,
      timeZone,
      attendees: draft.attendees.split(/[,\s]+/).filter((email) => email.includes("@")),
      meet: draft.meet,
      calendarId: draft.calendarId,
    };
    if (draft.id) update.mutate({ ...payload, id: draft.id });
    else create.mutate(payload);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f8fc] p-3 dark:bg-background" data-testid="calendar">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <Button data-testid="create-event" onClick={() => {
          const start = new Date();
          start.setMinutes(0, 0, 0);
          start.setHours(start.getHours() + 1);
          openDraft(start, new Date(start.getTime() + 30 * 60 * 1000));
        }}>Create</Button>
        <Button variant="outline" className="rounded-full" onClick={() => go(new Date())}>Today</Button>
        <Button variant="outline" className="rounded-full" onClick={() => go(addDays(cursor, view === "month" ? -30 : view === "week" ? -7 : -1))}><ChevronLeft />Back</Button>
        <Button variant="outline" className="rounded-full" onClick={() => go(addDays(cursor, view === "month" ? 30 : view === "week" ? 7 : 1))}>Next<ChevronRight /></Button>
        <h1 className="text-xl font-normal">{format(cursor, view === "day" ? "EEEE, MMM d" : "MMMM yyyy")}</h1>
        <div className="ml-auto flex gap-1">
          {(["day", "week", "month"] as const).map((item) => (
            <Button key={item} variant={view === item ? "default" : "outline"} onClick={() => setView(item)}>{item[0]?.toUpperCase()}{item.slice(1)}</Button>
          ))}
        </div>
      </header>
      <div className="mb-2 flex gap-3 text-xs">
        {(calendars.data ?? []).map((calendar) => (
          <span key={calendar.id} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: calendar.color }} />{calendar.summary}</span>
        ))}
      </div>
      {events.isLoading ? <p className="px-1 pb-2 text-xs text-[#5f6368]">Loading events…</p> : null}
      {events.error ? <p className="text-sm text-destructive">{events.error.message}</p> : null}
      {view === "month" ? (
        <div className="grid flex-1 grid-cols-7 overflow-hidden rounded-xl bg-background">
          {monthCells.map((day) => {
            const key = dayKey(day, timeZone);
            const items = (events.data ?? []).filter((event) => dayKey(new Date(event.allDay ? `${event.start}T12:00:00` : event.start), timeZone) === key);
            return (
              <button key={key + day.toISOString()} type="button" className={`min-h-24 border p-1 text-left ${key === selectedKey ? "bg-[#e8f0fe]" : ""}`} onClick={() => { go(day); setView("day"); }}>
                <span className={`text-xs ${key === nowKey ? "rounded-full bg-[#0b57d0] px-1.5 text-white" : key === selectedKey ? "font-semibold" : ""}`}>{format(day, "d")}</span>
                {items.slice(0, 3).map((event) => <p key={event.id} className="truncate text-xs" style={{ color: event.color }}>{event.summary}</p>)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-background">
          <div className="grid border-b" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            <div />
            {days.map((day) => (
              <div key={day.toISOString()} className="px-2 py-2 text-center text-xs">
                <div>{format(day, "EEE")}</div>
                <button type="button" className={`mx-auto mt-1 flex size-7 items-center justify-center rounded-full ${dayKey(day, timeZone) === nowKey ? "bg-[#0b57d0] text-white" : dayKey(day, timeZone) === selectedKey ? "bg-[#d3e3fd]" : "hover:bg-[#e8eaed]"}`} onClick={() => go(day)}>{format(day, "d")}</button>
              </div>
            ))}
          </div>
          <div className="grid border-b text-xs" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            <div className="px-1 py-1 text-muted-foreground">all-day</div>
            {days.map((day) => {
              const key = dayKey(day, timeZone);
              const items = (events.data ?? []).filter((event) => event.allDay && dayKey(new Date(`${event.start}T12:00:00`), timeZone) === key);
              return <div key={key} className="min-h-8 border-l p-1">{items.map((event) => <button key={event.id} type="button" className="block w-full truncate rounded px-1 text-left text-white" style={{ background: event.color }} onClick={() => setDraft(toDraft(event))}>{event.summary}</button>)}</div>;
            })}
          </div>
          <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
              <div>
                {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-12 pr-2 text-right text-[10px] text-muted-foreground">{hour === 0 ? "" : format(new Date(2026, 0, 1, hour), "h a")}</div>)}
              </div>
              {days.map((day) => {
                const key = dayKey(day, timeZone);
                const items = (events.data ?? []).filter((event) => !event.allDay && dayKey(new Date(event.start), timeZone) === key);
                return (
                  <div
                    key={key}
                    className="relative border-l"
                    onMouseDown={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const start = Math.max(0, Math.round(((event.clientY - rect.top) / 48) * 2) * 30);
                      setDrag({ day: key, start, end: start + 30 });
                    }}
                    onMouseMove={(event) => {
                      if (!drag || drag.day !== key) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const end = Math.max(drag.start + 30, Math.floor((event.clientY - rect.top) / 48 * 60 / 30) * 30);
                      setDrag({ ...drag, end });
                    }}
                    onMouseUp={() => {
                      if (!drag) return;
                      const [year, month, date] = drag.day.split("-").map(Number);
                      const start = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1, Math.floor(drag.start / 60), drag.start % 60);
                      const end = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1, Math.floor(drag.end / 60), drag.end % 60);
                      openDraft(start, end);
                      setDrag(null);
                    }}
                  >
                    {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-12 border-b border-dashed border-black/5" />)}
                    {key === nowKey ? <div className="absolute right-0 left-0 z-10 border-t-2 border-red-500" style={{ top: (nowMinutes / 60) * 48 }} /> : null}
                    {drag?.day === key ? <div className="absolute right-1 left-1 rounded bg-[#039be5]/30" style={{ top: (drag.start / 60) * 48, height: ((drag.end - drag.start) / 60) * 48 }} /> : null}
                    {items.map((event) => {
                      const start = minutes(new Date(event.start), timeZone);
                      const end = Math.max(start + 20, minutes(new Date(event.end), timeZone));
                      return (
                        <button key={event.id} type="button" data-testid="calendar-event" className="absolute right-1 left-1 overflow-hidden rounded px-1 text-left text-xs text-white" style={{ top: (start / 60) * 48, height: ((end - start) / 60) * 48, background: event.color }} onMouseDown={(event) => event.stopPropagation()} onClick={() => setDraft(toDraft(event))}>
                          <span className="font-medium">{event.summary}</span>
                          {event.hangoutLink ? <span className="block opacity-80">Meet</span> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <Input data-testid="event-title" aria-label="Title" placeholder="Add title" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
              <Input aria-label="Guests" placeholder="Guests, comma separated" value={draft.attendees} onChange={(event) => setDraft({ ...draft, attendees: event.target.value })} />
              <Input aria-label="Location" placeholder="Location" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
              <Textarea aria-label="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              <div className="flex items-center gap-2">
                <Switch checked={draft.meet} onCheckedChange={(checked) => setDraft({ ...draft, meet: checked })} id="meet" />
                <Label htmlFor="meet">Google Meet</Label>
              </div>
              {draft.id ? (
                <div className="flex flex-wrap gap-2">
                  {(["accepted", "tentative", "declined"] as const).map((response) => (
                    <Button key={response} size="sm" variant="outline" onClick={() => rsvp.mutate({ id: draft.id ?? "", response, calendarId: draft.calendarId })}>{response}</Button>
                  ))}
                  {session.data?.demo ? <Button size="sm" variant="outline" onClick={() => simulate.mutate({ id: draft.id ?? "", response: "accepted" })}>Simulate guest accepted</Button> : null}
                  <Button size="sm" variant="destructive" onClick={() => { remove.mutate({ id: draft.id ?? "", calendarId: draft.calendarId }); setDraft(null); }}>Delete</Button>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button data-testid="save-event" onClick={save} disabled={create.isPending || update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toDraft(event: { id: string; summary: string; start: string; end: string; allDay: boolean; location: string; description: string; attendees: { email: string }[]; hangoutLink: string | null; calendarId: string }): Draft {
  return {
    id: event.id,
    summary: event.summary,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    location: event.location,
    description: plainText(event.description),
    attendees: event.attendees.map((attendee) => attendee.email).join(", "),
    meet: Boolean(event.hangoutLink),
    calendarId: event.calendarId,
  };
}
