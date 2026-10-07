import { AsyncLocalStorage } from "node:async_hooks";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { getDb } from "./db";
import { webhookEvents } from "./db/schema";
import { asRecord, str } from "./errors";

export const webhookAls = new AsyncLocalStorage<{ tenantId: string }>();

export type LiveEvent = {
  id: number;
  tenantId: string;
  plugin: "gmail" | "googlecalendar" | string;
  eventType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
};

function redact(result: unknown, plugin: string): Omit<LiveEvent, "id" | "tenantId" | "createdAt"> {
  const record = asRecord(result);
  const message = asRecord(record.message);
  const event = asRecord(record.event);
  const eventType = str(record.type) ?? "changed";
  const entityId =
    str(message.id) ??
    str(message.threadId) ??
    str(event.id) ??
    str(record.eventId) ??
    str(record.historyId);
  const summary =
    plugin === "gmail"
      ? eventType === "messageReceived"
        ? "New mail"
        : eventType === "messageDeleted"
          ? "Message deleted"
          : "Mailbox updated"
      : eventType === "eventDeleted"
        ? "Event deleted"
        : "Calendar updated";
  return { plugin, eventType, entityId, summary };
}

export async function emitLive(
  tenantId: string,
  plugin: string,
  eventType: string,
  entityId: string | null,
  summary: string,
): Promise<LiveEvent> {
  const [row] = await getDb()
    .insert(webhookEvents)
    .values({ tenantId, plugin, eventType, entityId, summary })
    .returning();
  if (!row) throw new Error("Could not record event");
  return toLive(row);
}

export async function recordWebhook(plugin: string, result: unknown, tenantFromHook?: string): Promise<void> {
  const tenantId = [tenantFromHook, webhookAls.getStore()?.tenantId].find(
    (id) => Boolean(id) && id !== "unknown" && id !== "default",
  );
  if (!tenantId) return;
  const redacted = redact(result, plugin);
  await getDb().insert(webhookEvents).values({
    tenantId,
    plugin: redacted.plugin,
    eventType: redacted.eventType,
    entityId: redacted.entityId,
    summary: redacted.summary,
  });
}

export async function listEventsSince(tenantId: string, cursor: number): Promise<LiveEvent[]> {
  const rows = await getDb()
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.tenantId, tenantId), gt(webhookEvents.id, cursor)))
    .orderBy(asc(webhookEvents.id))
    .limit(50);
  return rows.map(toLive);
}

export async function recentEvents(tenantId: string): Promise<LiveEvent[]> {
  const rows = await getDb()
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.tenantId, tenantId))
    .orderBy(desc(webhookEvents.id))
    .limit(40);
  return rows.map(toLive);
}

function toLive(row: typeof webhookEvents.$inferSelect): LiveEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    plugin: row.plugin,
    eventType: row.eventType,
    entityId: row.entityId,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}
