import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import {
  demoCalendars,
  demoEvents,
  demoLabels,
  demoMessages,
  userSettings,
  type DemoAttachment,
  type DemoAttendee,
} from "../db/schema";
import { DEMO_EMAIL, DEMO_NAME } from "../flags";

export async function ensureDemo(tenantId: string, email = DEMO_EMAIL, name = DEMO_NAME) {
  const db = getDb();
  const existing = await db.select({ id: demoMessages.id }).from(demoMessages).where(eq(demoMessages.tenantId, tenantId)).limit(1);
  await db
    .insert(userSettings)
    .values({
      tenantId,
      email,
      displayName: name,
      timezone: "America/Los_Angeles",
      blockRemoteImages: true,
    })
    .onConflictDoNothing();
  if (existing.length > 0) return;

  const now = new Date();
  const at = (days: number, hours: number, minutes = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };
  const isoDate = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const labels = [
    ["INBOX", "Inbox", "system"],
    ["STARRED", "Starred", "system"],
    ["SENT", "Sent", "system"],
    ["DRAFT", "Drafts", "system"],
    ["TRASH", "Trash", "system"],
    ["SPAM", "Spam", "system"],
    ["UNREAD", "Unread", "system"],
    ["CATEGORY_PERSONAL", "Primary", "system"],
    ["CATEGORY_SOCIAL", "Social", "system"],
    ["CATEGORY_PROMOTIONS", "Promotions", "system"],
    ["Label_customers", "Customers", "user"],
    ["Label_design", "Design", "user"],
  ] as const;
  await db.insert(demoLabels).values(
    labels.map(([labelId, labelName, type]) => ({
      id: `${tenantId}:${labelId}`,
      tenantId,
      labelId,
      name: labelName,
      type,
      unreadThreads: 0,
    })),
  );

  const spec: Array<{
    filename?: string;
    fromName: string;
    fromEmail: string;
    to: string[];
    cc?: string[];
    subject: string;
    snippet: string;
    html: string;
    labels: string[];
    when: Date;
    thread?: string;
    attachment?: DemoAttachment;
  }> = [
    {
      fromName: "Maya Patel",
      fromEmail: "maya@acme.dev",
      to: [email],
      subject: "Move Thursday's sync?",
      snippet: "Can we move Thursday's sync to Friday? 30 minutes is plenty.",
      html: `<p>Hey Alex,</p><p>Thursday's sync is colliding with a customer call. Could we move it to <strong>Friday at 10:00</strong>? Thirty minutes is enough — I'll send a Meet link if you can make it.</p><p>Maya</p>`,
      labels: ["INBOX", "UNREAD", "CATEGORY_PERSONAL", "Label_customers"],
      when: at(0, 8, 12),
    },
    {
      fromName: "Sam Ortiz",
      fromEmail: "sam@northwind.dev",
      to: [email],
      cc: ["maya@acme.dev"],
      subject: "Q4 launch checklist",
      snippet: "Three blockers before we ship the onboarding rewrite.",
      html: `<p>Alex — three things before Thursday:</p><ul><li>Empty states for the new inbox</li><li>Webhook retry copy</li><li>Calendar invite actually emails guests</li></ul><p>I'll be in the office after 10.</p>`,
      labels: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
      when: at(0, 7, 40),
    },
    {
      fromName: "Priya Shah",
      fromEmail: "priya@figma.example",
      to: [email],
      subject: "Design review notes",
      snippet: "Attached the redlines from this morning's critique.",
      html: `<p>Notes from critique are attached. The compose window should sit bottom-right and the unread row stays bold.</p><p>Priya</p>`,
      labels: ["INBOX", "CATEGORY_PERSONAL", "Label_design"],
      when: at(-1, 16, 5),
      attachment: {
        filename: "critique.txt",
        mimeType: "text/plain",
        size: 48,
        contentBase64: Buffer.from("Compose sits bottom-right. Unread stays bold.\n").toString("base64"),
      },
    },
    {
      fromName: "Jordan Lee",
      fromEmail: "jordan@lumen.vc",
      to: [email],
      subject: "Intro from Lumen",
      snippet: "Loved the demo narrative. Free for 25 minutes next week?",
      html: `<p>Alex,</p><p>Loved the narrative — especially live mail showing up without a refresh. I can do 25 minutes next Tuesday.</p><p>Jordan Lee<br/>Lumen</p>`,
      labels: ["INBOX", "STARRED", "CATEGORY_PERSONAL", "Label_customers"],
      when: at(-1, 11, 15),
    },
    {
      fromName: "GitHub",
      fromEmail: "noreply@github.com",
      to: [email],
      subject: "northwind/inboxly had a new star",
      snippet: "kaiser starred northwind/inboxly",
      html: `<p>kaiser starred <strong>northwind/inboxly</strong>.</p>`,
      labels: ["INBOX", "CATEGORY_SOCIAL"],
      when: at(-2, 9, 2),
    },
    {
      fromName: "Linear Digest",
      fromEmail: "digest@linear.app",
      to: [email],
      subject: "Your week in Linear",
      snippet: "4 issues closed, 2 still waiting on design.",
      html: `<p>You closed 4 issues. Two are still waiting on design.</p>`,
      labels: ["INBOX", "CATEGORY_SOCIAL", "UNREAD"],
      when: at(-2, 6, 0),
    },
    {
      fromName: "Notion",
      fromEmail: "team@notion.so",
      to: [email],
      subject: "Upgrade for unlimited AI",
      snippet: "Teams on the Plus plan get meeting notes included.",
      html: `<p>Upgrade today.</p><img src="https://example.com/tracking.png" alt="" width="1" height="1"/>`,
      labels: ["INBOX", "CATEGORY_PROMOTIONS"],
      when: at(-3, 13, 0),
    },
    {
      fromName: "Figma",
      fromEmail: "news@figma.com",
      to: [email],
      subject: "Config 2026 recap",
      snippet: "Slides and recordings are up.",
      html: `<p>Watch the recap when you have a minute.</p>`,
      labels: ["INBOX", "CATEGORY_PROMOTIONS", "UNREAD"],
      when: at(-4, 10, 0),
    },
    {
      fromName: name,
      fromEmail: email,
      to: ["sam@northwind.dev"],
      subject: "Re: Q4 launch checklist",
      snippet: "I'll take the invite path. You own empty states.",
      html: `<p>I'll take the invite path. You own empty states. Let's review Friday.</p>`,
      labels: ["SENT", "CATEGORY_PERSONAL"],
      when: at(-1, 18, 20),
    },
    {
      fromName: "Unknown prize",
      fromEmail: "winner@lottery.example",
      to: [email],
      subject: "You have been selected",
      snippet: "Claim your reward before midnight.",
      html: `<p>This is spam.</p>`,
      labels: ["SPAM", "CATEGORY_PROMOTIONS"],
      when: at(-5, 4, 0),
    },
    {
      fromName: "Old vendor",
      fromEmail: "billing@oldvendor.example",
      to: [email],
      subject: "Invoice 1044",
      snippet: "Past due notice.",
      html: `<p>Please ignore — already paid.</p>`,
      labels: ["TRASH"],
      when: at(-8, 12, 0),
    },
  ];

  await db.insert(demoMessages).values(
    spec.map((item, index) => ({
      id: `msg_${index + 1}`,
      tenantId,
      threadId: `thr_${index + 1}`,
      fromName: item.fromName,
      fromEmail: item.fromEmail,
      toEmails: item.to,
      ccEmails: item.cc ?? [],
      subject: item.subject,
      snippet: item.snippet,
      bodyHtml: item.html,
      labelIds: item.labels,
      internalDate: item.when,
      attachments: item.attachment ? [item.attachment] : [],
      messageIdHeader: `<msg_${index + 1}@northwind.dev>`,
    })),
  );

  await db.insert(demoCalendars).values([
    {
      id: `${tenantId}:primary`,
      tenantId,
      summary: "Alex Chen",
      color: "#039be5",
      timeZone: "America/Los_Angeles",
      primary: true,
    },
    {
      id: `${tenantId}:team`,
      tenantId,
      summary: "Northwind",
      color: "#33b679",
      timeZone: "America/Los_Angeles",
      primary: false,
    },
  ]);

  const monday = new Date(now);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - ((day + 6) % 7));
  monday.setHours(10, 0, 0, 0);
  const mondayEnd = new Date(monday);
  mondayEnd.setMinutes(30);

  const attendees = (emails: Array<[string, DemoAttendee["responseStatus"], boolean?]>): DemoAttendee[] =>
    emails.map(([address, responseStatus, self]) => ({
      email: address,
      displayName: address.split("@")[0],
      responseStatus,
      self: Boolean(self),
      organizer: Boolean(self),
    }));

  await db.insert(demoEvents).values([
    {
      id: "evt_sync",
      tenantId,
      calendarId: "primary",
      summary: "Weekly product sync",
      description: "Standup with the launch crew.",
      location: "Google Meet",
      start: monday.toISOString(),
      end: mondayEnd.toISOString(),
      allDay: false,
      timeZone: "America/Los_Angeles",
      attendees: attendees([
        [email, "accepted", true],
        ["sam@northwind.dev", "accepted"],
        ["maya@acme.dev", "needsAction"],
      ]),
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=12"],
      hangoutLink: "https://meet.google.com/demo-weekly-sync",
      status: "confirmed",
      colorId: "1",
    },
    {
      id: "evt_focus",
      tenantId,
      calendarId: "primary",
      summary: "Focus block",
      description: "",
      location: "",
      start: at(0, 13).toISOString(),
      end: at(0, 15).toISOString(),
      allDay: false,
      timeZone: "America/Los_Angeles",
      attendees: attendees([[email, "accepted", true]]),
      recurrence: null,
      hangoutLink: null,
      status: "confirmed",
      colorId: "9",
    },
    {
      id: "evt_maya",
      tenantId,
      calendarId: "primary",
      summary: "Call with Maya",
      description: "30 minutes on the Thursday sync.",
      location: "",
      start: at(1, 10).toISOString(),
      end: at(1, 10, 30).toISOString(),
      allDay: false,
      timeZone: "America/Los_Angeles",
      attendees: attendees([
        [email, "accepted", true],
        ["maya@acme.dev", "needsAction"],
      ]),
      recurrence: null,
      hangoutLink: "https://meet.google.com/demo-maya",
      status: "confirmed",
      colorId: "1",
    },
    {
      id: "evt_offsite",
      tenantId,
      calendarId: "team",
      summary: "Team offsite",
      description: "All day in the studio.",
      location: "Studio 4",
      start: `${isoDate(3)}`,
      end: `${isoDate(4)}`,
      allDay: true,
      timeZone: "America/Los_Angeles",
      attendees: attendees([
        [email, "accepted", true],
        ["sam@northwind.dev", "tentative"],
      ]),
      recurrence: null,
      hangoutLink: null,
      status: "confirmed",
      colorId: "2",
    },
  ]);
}

export async function insertDemoMessage(input: {
  tenantId: string;
  threadId?: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  labels: string[];
  attachments?: DemoAttachment[];
  inReplyTo?: string;
}) {
  const id = nanoid(10);
  const threadId = input.threadId ?? `thr_${id}`;
  const text = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  await getDb().insert(demoMessages).values({
    id: `msg_${id}`,
    tenantId: input.tenantId,
    threadId,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    toEmails: input.to,
    ccEmails: input.cc ?? [],
    subject: input.subject,
    snippet: text.slice(0, 140),
    bodyHtml: input.html,
    labelIds: input.labels,
    internalDate: new Date(),
    attachments: input.attachments ?? [],
    messageIdHeader: `<${id}@northwind.dev>`,
  });
  return { id: `msg_${id}`, threadId, messageIdHeader: `<${id}@northwind.dev>` };
}

export async function loadDemoMessages(tenantId: string) {
  return getDb().select().from(demoMessages).where(eq(demoMessages.tenantId, tenantId));
}

export async function loadDemoLabels(tenantId: string) {
  return getDb().select().from(demoLabels).where(eq(demoLabels.tenantId, tenantId));
}

export async function patchDemoThread(tenantId: string, threadId: string, mutate: (labels: string[]) => string[]) {
  const db = getDb();
  const rows = await db
    .select()
    .from(demoMessages)
    .where(and(eq(demoMessages.tenantId, tenantId), eq(demoMessages.threadId, threadId)));
  for (const row of rows) {
    await db.update(demoMessages).set({ labelIds: mutate(row.labelIds) }).where(eq(demoMessages.id, row.id));
  }
}

export async function loadDemoCalendars(tenantId: string) {
  return getDb().select().from(demoCalendars).where(eq(demoCalendars.tenantId, tenantId));
}

export async function loadDemoEvents(tenantId: string) {
  return getDb().select().from(demoEvents).where(eq(demoEvents.tenantId, tenantId));
}
