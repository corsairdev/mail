export type TimedEvent = {
  id: string;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: string[] | null;
};

function parseRule(rules: string[]): { freq: string; interval: number; count: number; until?: Date; byday?: string[] } | null {
  const line = rules.find((rule) => rule.startsWith("RRULE:")) ?? rules[0];
  if (!line) return null;
  const body = line.replace(/^RRULE:/, "");
  const parts = Object.fromEntries(body.split(";").map((part) => part.split("=") as [string, string]));
  const freq = parts.FREQ;
  if (!freq) return null;
  return {
    freq,
    interval: Number(parts.INTERVAL ?? "1") || 1,
    count: Number(parts.COUNT ?? "52") || 52,
    until: parts.UNTIL ? new Date(parts.UNTIL) : undefined,
    byday: parts.BYDAY?.split(","),
  };
}

function addFreq(date: Date, freq: string, interval: number): Date {
  const next = new Date(date);
  if (freq === "DAILY") next.setDate(next.getDate() + interval);
  else if (freq === "WEEKLY") next.setDate(next.getDate() + 7 * interval);
  else if (freq === "MONTHLY") next.setMonth(next.getMonth() + interval);
  else if (freq === "YEARLY") next.setFullYear(next.getFullYear() + interval);
  else next.setDate(next.getDate() + 7 * interval);
  return next;
}

/** Expands a master event across a window. Instances already stored should be passed separately. */
export function expandRecurrence<T extends TimedEvent>(event: T, rangeStart: Date, rangeEnd: Date): T[] {
  if (!event.recurrence?.length || event.allDay && !event.start) return [event];
  const rule = parseRule(event.recurrence);
  if (!rule) return [event];
  const start = new Date(event.start);
  const end = new Date(event.end);
  const duration = end.getTime() - start.getTime();
  const copies: T[] = [];
  let cursor = start;
  for (let index = 0; index < Math.min(rule.count, 120); index += 1) {
    if (rule.until && cursor > rule.until) break;
    const occursEnd = new Date(cursor.getTime() + duration);
    if (occursEnd >= rangeStart && cursor <= rangeEnd) {
      copies.push({
        ...event,
        id: index === 0 ? event.id : `${event.id}_${cursor.toISOString()}`,
        start: cursor.toISOString(),
        end: occursEnd.toISOString(),
      });
    }
    if (cursor > rangeEnd) break;
    cursor = addFreq(cursor, rule.freq, rule.interval);
  }
  return copies.length ? copies : [event];
}
