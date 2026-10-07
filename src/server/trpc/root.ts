import { z } from "zod";
import { tracked } from "@trpc/server";
import { createTRPCRouter, publicProcedure, tenantProcedure } from "./trpc";
import {
  archiveThread,
  deleteDraft,
  getThread,
  listContacts,
  listDrafts,
  listLabels,
  listThreads,
  saveDraft,
  sendMail,
  setRead,
  setStar,
  trashThread,
} from "../mail/service";
import { createEvent, deleteEvent, listCalendars, listEvents, rsvp, simulateGuestRsvp, updateEvent } from "../calendar/service";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { aiSummaries, userSettings } from "../db/schema";
import { listEventsSince, recentEvents } from "../live";
import { readSync, registerWatches, replayLast, syncStep } from "../sync";
import { DEMO_EMAIL, DEMO_NAME } from "../flags";

const folder = z.enum(["inbox", "starred", "sent", "drafts", "trash", "spam", "label"]);
const email = z.string().email();
const eventInput = z.object({
  summary: z.string().min(1).max(300),
  description: z.string().max(8000).optional(),
  location: z.string().max(500).optional(),
  start: z.string().min(8),
  end: z.string().min(8),
  allDay: z.boolean().optional(),
  timeZone: z.string().min(1).max(80),
  attendees: z.array(email).max(50).optional(),
  meet: z.boolean().optional(),
  calendarId: z.string().max(200).optional(),
});

export const appRouter = createTRPCRouter({
  session: publicProcedure.query(({ ctx }) => ({
    demo: ctx.demo,
    authEnabled: ctx.authEnabled,
    signedIn: Boolean(ctx.tenantId),
    user: ctx.user,
  })),
  mail: createTRPCRouter({
    list: tenantProcedure
      .input(z.object({
        folder,
        labelId: z.string().max(120).optional(),
        category: z.enum(["primary", "social", "promotions"]).optional(),
        query: z.string().max(500).optional(),
        cursor: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(2000).default(80),
      }))
      .query(({ ctx, input }) => listThreads({ tenantId: ctx.tenantId, ...input })),
    thread: tenantProcedure.input(z.object({ id: z.string().min(1).max(200) })).query(({ ctx, input }) => getThread(ctx.tenantId, input.id)),
    labels: tenantProcedure.query(({ ctx }) => listLabels(ctx.tenantId)),
    contacts: tenantProcedure.query(({ ctx }) => listContacts(ctx.tenantId)),
    drafts: tenantProcedure.query(({ ctx }) => listDrafts(ctx.tenantId)),
    archive: tenantProcedure.input(z.object({ threadId: z.string().min(1) })).mutation(({ ctx, input }) => archiveThread(ctx.tenantId, input.threadId)),
    trash: tenantProcedure.input(z.object({ threadId: z.string().min(1) })).mutation(({ ctx, input }) => trashThread(ctx.tenantId, input.threadId)),
    star: tenantProcedure.input(z.object({ threadId: z.string().min(1), starred: z.boolean() })).mutation(({ ctx, input }) => setStar(ctx.tenantId, input.threadId, input.starred)),
    read: tenantProcedure.input(z.object({ threadId: z.string().min(1), read: z.boolean() })).mutation(({ ctx, input }) => setRead(ctx.tenantId, input.threadId, input.read)),
    send: tenantProcedure
      .input(z.object({
        to: z.array(email).min(1).max(50),
        cc: z.array(email).max(50).default([]),
        bcc: z.array(email).max(50).default([]),
        subject: z.string().max(300),
        html: z.string().max(200_000),
        threadId: z.string().max(200).optional(),
        replyToMessageId: z.string().max(500).optional(),
        references: z.string().max(4000).optional(),
        attachments: z.array(z.object({
          filename: z.string().min(1).max(200),
          mimeType: z.string().min(1).max(120),
          contentBase64: z.string().max(8_000_000),
        })).max(8).optional(),
        draftId: z.string().max(80).optional(),
      }))
      .mutation(({ ctx, input }) => sendMail({ tenantId: ctx.tenantId, ...input })),
    saveDraft: tenantProcedure
      .input(z.object({
        id: z.string().max(80).optional(),
        mode: z.enum(["compose", "reply", "reply-all", "forward"]),
        threadId: z.string().max(200).optional(),
        to: z.array(z.string().email()).max(50),
        cc: z.array(z.string().email()).max(50),
        bcc: z.array(z.string().email()).max(50),
        subject: z.string().max(300),
        bodyHtml: z.string().max(200_000),
      }))
      .mutation(({ ctx, input }) => saveDraft({ tenantId: ctx.tenantId, ...input })),
    deleteDraft: tenantProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) => deleteDraft(ctx.tenantId, input.id)),
  }),
  calendar: createTRPCRouter({
    calendars: tenantProcedure.query(({ ctx }) => listCalendars(ctx.tenantId)),
    events: tenantProcedure
      .input(z.object({ timeMin: z.string(), timeMax: z.string() }))
      .query(({ ctx, input }) => listEvents(ctx.tenantId, input.timeMin, input.timeMax)),
    create: tenantProcedure.input(eventInput).mutation(({ ctx, input }) => createEvent(ctx.tenantId, input)),
    update: tenantProcedure.input(eventInput.extend({ id: z.string().min(1) })).mutation(({ ctx, input }) => updateEvent(ctx.tenantId, input.id, input)),
    delete: tenantProcedure.input(z.object({ id: z.string().min(1), calendarId: z.string().optional() })).mutation(({ ctx, input }) => deleteEvent(ctx.tenantId, input.id, input.calendarId)),
    rsvp: tenantProcedure
      .input(z.object({
        id: z.string().min(1),
        calendarId: z.string().optional(),
        response: z.enum(["accepted", "declined", "tentative", "needsAction"]),
      }))
      .mutation(({ ctx, input }) => rsvp(ctx.tenantId, input.id, input.response, input.calendarId)),
    simulateGuest: tenantProcedure
      .input(z.object({ id: z.string().min(1), response: z.enum(["accepted", "declined", "tentative"]) }))
      .mutation(({ ctx, input }) => simulateGuestRsvp(ctx.tenantId, input.id, input.response)),
  }),
  settings: createTRPCRouter({
    get: tenantProcedure.query(async ({ ctx }) => {
      const [row] = await getDb().select().from(userSettings).where(eq(userSettings.tenantId, ctx.tenantId)).limit(1);
      return {
        email: row?.email ?? (ctx.user.email || DEMO_EMAIL),
        displayName: row?.displayName ?? (ctx.user.name || DEMO_NAME),
        timezone: row?.timezone ?? "",
        blockRemoteImages: row?.blockRemoteImages ?? false,
        demo: ctx.demo,
        authEnabled: ctx.authEnabled,
      };
    }),
    update: tenantProcedure
      .input(z.object({
        timezone: z.string().min(1).max(80).optional(),
        blockRemoteImages: z.boolean().optional(),
        displayName: z.string().min(1).max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [existing] = await db.select().from(userSettings).where(eq(userSettings.tenantId, ctx.tenantId)).limit(1);
        await db
          .insert(userSettings)
          .values({
            tenantId: ctx.tenantId,
            email: existing?.email ?? (ctx.user.email || DEMO_EMAIL),
            displayName: input.displayName ?? existing?.displayName ?? (ctx.user.name || DEMO_NAME),
            timezone: input.timezone ?? existing?.timezone ?? "UTC",
            blockRemoteImages: input.blockRemoteImages ?? existing?.blockRemoteImages ?? false,
          })
          .onConflictDoUpdate({
            target: userSettings.tenantId,
            set: {
              displayName: input.displayName ?? existing?.displayName ?? (ctx.user.name || DEMO_NAME),
              timezone: input.timezone ?? existing?.timezone ?? "UTC",
              blockRemoteImages: input.blockRemoteImages ?? existing?.blockRemoteImages ?? false,
            },
          });
        return { ok: true };
      }),
  }),
  ai: createTRPCRouter({
    cachedSummary: tenantProcedure
      .input(z.object({ threadId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const rows = await getDb().select().from(aiSummaries).where(eq(aiSummaries.threadId, input.threadId));
        const match = rows.find((item) => item.tenantId === ctx.tenantId && item.kind === "summary");
        return { content: match?.content ?? null };
      }),
  }),
  sync: createTRPCRouter({
    state: tenantProcedure.query(({ ctx }) => readSync(ctx.tenantId)),
    step: tenantProcedure.mutation(({ ctx }) => syncStep(ctx.tenantId)),
    registerWatches: tenantProcedure.mutation(({ ctx }) => registerWatches(ctx.tenantId)),
    events: tenantProcedure.input(z.object({ cursor: z.number().int().min(0).default(0) })).query(({ ctx, input }) => listEventsSince(ctx.tenantId, input.cursor)),
    recent: tenantProcedure.query(({ ctx }) => recentEvents(ctx.tenantId)),
    replay: tenantProcedure.mutation(({ ctx }) => replayLast(ctx.tenantId)),
    onEvent: tenantProcedure
      .input(z.object({ lastEventId: z.number().int().min(0).optional() }).optional())
      .subscription(async function* ({ ctx, input, signal }) {
        let cursor = input?.lastEventId ?? 0;
        while (!signal?.aborted) {
          const events = await listEventsSince(ctx.tenantId, cursor);
          for (const event of events) {
            cursor = event.id;
            yield tracked(String(event.id), event);
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
