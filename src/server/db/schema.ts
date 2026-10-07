import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const drafts = pgTable("drafts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  mode: text("mode").notNull(),
  threadId: text("thread_id"),
  to: jsonb("to").$type<string[]>().notNull(),
  cc: jsonb("cc").$type<string[]>().notNull(),
  bcc: jsonb("bcc").$type<string[]>().notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const aiSummaries = pgTable(
  "ai_summaries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    threadId: text("thread_id").notNull(),
    kind: text("kind").notNull(),
    tone: text("tone"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("ai_summaries_thread_kind").on(table.tenantId, table.threadId, table.kind, table.tone)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  plugin: text("plugin").notNull(),
  eventType: text("event_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  tenantId: text("tenant_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull(),
  blockRemoteImages: boolean("block_remote_images").notNull().default(true),
});

export const syncState = pgTable(
  "sync_state",
  {
    tenantId: text("tenant_id").notNull(),
    plugin: text("plugin").notNull(),
    status: text("status").notNull(),
    progress: integer("progress").notNull().default(0),
    detail: text("detail").notNull().default(""),
    watchExpiresAt: timestamp("watch_expires_at", { withTimezone: true }),
    watchResource: text("watch_resource"),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.plugin] })],
);

export const demoMessages = pgTable("demo_messages", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  threadId: text("thread_id").notNull(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  toEmails: jsonb("to_emails").$type<string[]>().notNull(),
  ccEmails: jsonb("cc_emails").$type<string[]>().notNull(),
  subject: text("subject").notNull(),
  snippet: text("snippet").notNull(),
  bodyHtml: text("body_html").notNull(),
  labelIds: jsonb("label_ids").$type<string[]>().notNull(),
  internalDate: timestamp("internal_date", { withTimezone: true }).notNull(),
  attachments: jsonb("attachments").$type<DemoAttachment[]>().notNull(),
  messageIdHeader: text("message_id_header").notNull(),
});

export const demoLabels = pgTable("demo_labels", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  labelId: text("label_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  unreadThreads: integer("unread_threads").notNull().default(0),
});

export const demoCalendars = pgTable("demo_calendars", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  summary: text("summary").notNull(),
  color: text("color").notNull(),
  timeZone: text("time_zone").notNull(),
  primary: boolean("primary").notNull().default(false),
});

export const demoEvents = pgTable("demo_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  calendarId: text("calendar_id").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default(""),
  start: text("start").notNull(),
  end: text("end").notNull(),
  allDay: boolean("all_day").notNull().default(false),
  timeZone: text("time_zone").notNull(),
  attendees: jsonb("attendees").$type<DemoAttendee[]>().notNull(),
  recurrence: jsonb("recurrence").$type<string[] | null>(),
  hangoutLink: text("hangout_link"),
  status: text("status").notNull().default("confirmed"),
  colorId: text("color_id"),
});

export type DemoAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  contentBase64: string;
};

export type DemoAttendee = {
  email: string;
  displayName?: string;
  responseStatus: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
  organizer?: boolean;
};
