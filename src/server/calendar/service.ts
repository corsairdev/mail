import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { expandRecurrence } from "./recurrence";
import { getDb } from "../db";
import { demoEvents, userSettings } from "../db/schema";
import { getPool } from "../db";
import { withTenant } from "../corsair";
import { ensureDemo, loadDemoCalendars, loadDemoEvents } from "../demo/store";
import { AppError, asRecord, str, toAppError } from "../errors";
import { isDemoMode } from "../flags";
import { emitLive } from "../live";

export type Attendee = {
  email: string;
  displayName?: string;
  responseStatus: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
  organizer?: boolean;
};

export type CalendarInfo = {
  id: string;
  summary: string;
  color: string;
  primary: boolean;
  timeZone: string;
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  attendees: Attendee[];
  recurrence: string[] | null;
  hangoutLink: string | null;
  status: string;
  color: string;
};

const COLORS = ["#039be5", "#7986cb", "#33b679", "#8e24aa", "#e67c73", "#f6bf26", "#f4511e", "#616161", "#3f51b5", "#0b8043", "#d50000"];

function colorFor(colorId: string | null, fallback: string): string {
  const index = Number(colorId);
  if (Number.isFinite(index) && index >= 1 && index <= COLORS.length) return COLORS[index - 1] ?? fallback;
  return fallback;
}

function asAttendees(value: unknown): Attendee[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const email = str(record.email);
    if (!email) return [];
    const status = str(record.responseStatus);
    const responseStatus: Attendee["responseStatus"] =
      status === "accepted" || status === "declined" || status === "tentative" ? status : "needsAction";
    return [{
      email,
      displayName: str(record.displayName) ?? undefined,
      responseStatus,
      self: record.self === true,
      organizer: record.organizer === true,
    }];
  });
}

function fromDemo(row: typeof demoEvents.$inferSelect, calendars: CalendarInfo[]): CalendarEvent {
  const calendar = calendars.find((item) => item.id === row.calendarId);
  return {
    id: row.id,
    calendarId: row.calendarId,
    summary: row.summary,
    description: row.description,
    location: row.location,
    start: row.allDay ? row.start : row.start,
    end: row.end,
    allDay: row.allDay,
    timeZone: row.timeZone,
    attendees: row.attendees,
    recurrence: row.recurrence,
    hangoutLink: row.hangoutLink,
    status: row.status,
    color: calendar?.color ?? colorFor(row.colorId, "#039be5"),
  };
}

function fromApi(value: unknown, calendarId: string, color: string): CalendarEvent | null {
  const record = asRecord(asRecord(value).data ?? value);
  const id = str(record.id);
  if (!id || record.status === "cancelled") return null;
  const start = asRecord(record.start);
  const end = asRecord(record.end);
  const allDay = Boolean(str(start.date) && !str(start.dateTime));
  const startValue = str(start.dateTime) ?? str(start.date);
  const endValue = str(end.dateTime) ?? str(end.date);
  if (!startValue || !endValue) return null;
  const recurrence = Array.isArray(record.recurrence) ? record.recurrence.filter((item): item is string => typeof item === "string") : null;
  return {
    id,
    calendarId: str(record.calendarId) ?? calendarId,
    summary: str(record.summary) ?? "(no title)",
    description: str(record.description) ?? "",
    location: str(record.location) ?? "",
    start: startValue,
    end: endValue,
    allDay,
    timeZone: str(start.timeZone) ?? "UTC",
    attendees: asAttendees(record.attendees),
    recurrence,
    hangoutLink: str(record.hangoutLink),
    status: str(record.status) ?? "confirmed",
    color: colorFor(str(record.colorId), color),
  };
}

export async function listCalendars(tenantId: string): Promise<CalendarInfo[]> {
  if (isDemoMode()) {
    await ensureDemo(tenantId);
    const rows = await loadDemoCalendars(tenantId);
    return rows.map((row) => ({
      id: row.id.endsWith(":primary") ? "primary" : row.id.endsWith(":team") ? "team" : row.id,
      summary: row.summary,
      color: row.color,
      primary: row.primary,
      timeZone: row.timeZone,
    }));
  }
  return [{ id: "primary", summary: "Primary", color: "#039be5", primary: true, timeZone: "UTC" }];
}

export async function listEvents(tenantId: string, timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const calendars = await listCalendars(tenantId);
  const rangeStart = new Date(timeMin);
  const rangeEnd = new Date(timeMax);
  let events: CalendarEvent[] = [];
  if (isDemoMode()) {
    events = (await loadDemoEvents(tenantId)).map((row) => fromDemo(row, calendars));
  } else {
    try {
      const result = await getPool().query<{ data: unknown }>(
        `select e.data
         from corsair_entities e
         join corsair_accounts a on a.id = e.account_id
         join corsair_integrations i on i.id = a.integration_id
         where a.tenant_id = $1 and i.name = 'googlecalendar' and e.entity_type = 'events'`,
        [tenantId],
      );
      events = result.rows
        .map((row) => fromApi(row.data, "primary", "#039be5"))
        .filter((event): event is CalendarEvent => event !== null);
    } catch (error) {
      throw toAppError(error);
    }
  }
  const instanceIds = new Set(events.filter((event) => event.id.includes("_")).map((event) => event.id.split("_")[0]));
  const expanded = events.flatMap((event) => {
    if (event.recurrence?.length && !instanceIds.has(event.id)) {
      return expandRecurrence(event, rangeStart, rangeEnd);
    }
    return [event];
  });
  return expanded.filter((event) => {
    const start = new Date(event.allDay ? `${event.start}T00:00:00` : event.start);
    const end = new Date(event.allDay ? `${event.end}T00:00:00` : event.end);
    return end >= rangeStart && start <= rangeEnd;
  });
}

type EventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  timeZone: string;
  attendees?: string[];
  meet?: boolean;
  calendarId?: string;
};

function eventBody(input: EventInput) {
  const attendees = (input.attendees ?? []).map((email) => ({ email }));
  const base = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: input.allDay ? { date: input.start.slice(0, 10) } : { dateTime: input.start, timeZone: input.timeZone },
    end: input.allDay ? { date: input.end.slice(0, 10) } : { dateTime: input.end, timeZone: input.timeZone },
    attendees,
  };
  if (!input.meet) return base;
  return {
    ...base,
    conferenceData: {
      createRequest: {
        requestId: nanoid(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

export async function createEvent(tenantId: string, input: EventInput) {
  const calendarId = input.calendarId ?? "primary";
  if (isDemoMode()) {
    await ensureDemo(tenantId);
    const id = `evt_${nanoid(8)}`;
    const [settings] = await getDb().select().from(userSettings).where(eq(userSettings.tenantId, tenantId)).limit(1);
    const self = settings?.email;
    await getDb().insert(demoEvents).values({
      id,
      tenantId,
      calendarId,
      summary: input.summary,
      description: input.description ?? "",
      location: input.location ?? "",
      start: input.allDay ? input.start.slice(0, 10) : input.start,
      end: input.allDay ? input.end.slice(0, 10) : input.end,
      allDay: Boolean(input.allDay),
      timeZone: input.timeZone,
      attendees: [
        ...(self ? [{ email: self, displayName: settings?.displayName, responseStatus: "accepted" as const, self: true, organizer: true }] : []),
        ...(input.attendees ?? []).filter((email) => email !== self).map((email) => ({
          email,
          displayName: email.split("@")[0],
          responseStatus: "needsAction" as const,
        })),
      ],
      recurrence: null,
      hangoutLink: input.meet ? `https://meet.google.com/${id}` : null,
      status: "confirmed",
      colorId: "1",
    });
    await emitLive(tenantId, "googlecalendar", "eventCreated", id, "Calendar updated");
    return { id, hangoutLink: input.meet ? `https://meet.google.com/${id}` : null };
  }
  try {
    const created = await withTenant(tenantId).googlecalendar.api.events.create({
      calendarId,
      sendUpdates: input.attendees?.length ? "all" : "none",
      conferenceDataVersion: input.meet ? 1 : undefined,
      event: eventBody(input),
    });
    return { id: created.id ?? "", hangoutLink: created.hangoutLink ?? null };
  } catch (error) {
    throw toAppError(error);
  }
}

export async function updateEvent(tenantId: string, id: string, input: EventInput) {
  if (isDemoMode()) {
    await getDb()
      .update(demoEvents)
      .set({
        summary: input.summary,
        description: input.description ?? "",
        location: input.location ?? "",
        start: input.allDay ? input.start.slice(0, 10) : input.start,
        end: input.allDay ? input.end.slice(0, 10) : input.end,
        allDay: Boolean(input.allDay),
        timeZone: input.timeZone,
        hangoutLink: input.meet ? `https://meet.google.com/${id}` : null,
      })
      .where(and(eq(demoEvents.id, id), eq(demoEvents.tenantId, tenantId)));
    await emitLive(tenantId, "googlecalendar", "eventUpdated", id, "Calendar updated");
    return { id };
  }
  try {
    await withTenant(tenantId).googlecalendar.api.events.update({
      id,
      calendarId: input.calendarId ?? "primary",
      sendUpdates: input.attendees?.length ? "all" : "none",
      conferenceDataVersion: input.meet ? 1 : undefined,
      event: eventBody(input),
    });
    return { id };
  } catch (error) {
    throw toAppError(error);
  }
}

export async function deleteEvent(tenantId: string, id: string, calendarId = "primary") {
  if (isDemoMode()) {
    const masterId = id.includes("_") ? id.split("_")[0] ?? id : id;
    await getDb().delete(demoEvents).where(and(eq(demoEvents.tenantId, tenantId), eq(demoEvents.id, masterId)));
    await emitLive(tenantId, "googlecalendar", "eventDeleted", id, "Event deleted");
    return;
  }
  try {
    await withTenant(tenantId).googlecalendar.api.events.delete({ id, calendarId, sendUpdates: "all" });
  } catch (error) {
    throw toAppError(error);
  }
}

export async function rsvp(tenantId: string, id: string, response: Attendee["responseStatus"], calendarId = "primary") {
  if (isDemoMode()) {
    const [row] = await getDb().select().from(demoEvents).where(and(eq(demoEvents.id, id.split("_")[0] ?? id), eq(demoEvents.tenantId, tenantId))).limit(1);
    if (!row) throw new AppError("UPSTREAM", "Event not found");
    const attendees = row.attendees.map((attendee) => attendee.self ? { ...attendee, responseStatus: response } : attendee);
    await getDb().update(demoEvents).set({ attendees }).where(eq(demoEvents.id, row.id));
    await emitLive(tenantId, "googlecalendar", "eventUpdated", row.id, "RSVP updated");
    return;
  }
  try {
    const current = await withTenant(tenantId).googlecalendar.api.events.get({ id, calendarId });
    const attendees = (current.attendees ?? []).map((attendee) =>
      attendee.self ? { ...attendee, responseStatus: response } : attendee,
    );
    await withTenant(tenantId).googlecalendar.api.events.update({
      id,
      calendarId,
      sendUpdates: "all",
      event: { attendees },
    });
  } catch (error) {
    throw toAppError(error);
  }
}

export async function simulateGuestRsvp(tenantId: string, id: string, response: Attendee["responseStatus"]) {
  if (!isDemoMode()) throw new AppError("UPSTREAM", "Guest simulation is only available in demo mode.");
  const masterId = id.split("_")[0] ?? id;
  const [row] = await getDb().select().from(demoEvents).where(and(eq(demoEvents.id, masterId), eq(demoEvents.tenantId, tenantId))).limit(1);
  if (!row) throw new AppError("UPSTREAM", "Event not found");
  const attendees = row.attendees.map((attendee) => (attendee.self ? attendee : { ...attendee, responseStatus: response }));
  await getDb().update(demoEvents).set({ attendees }).where(eq(demoEvents.id, row.id));
  await emitLive(tenantId, "googlecalendar", "eventUpdated", row.id, "RSVP updated");
}
