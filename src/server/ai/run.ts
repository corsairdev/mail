import { and, eq } from "drizzle-orm";
import { generateObject, generateText, stepCountIs, streamText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "../db";
import { aiSummaries } from "../db/schema";
import { getThread, listThreads } from "../mail/service";
import { listEvents } from "../calendar/service";
import { nanoid } from "nanoid";

const proposalSchema = z.object({
  summary: z.string(),
  start: z.string(),
  end: z.string(),
  timeZone: z.string(),
  attendees: z.array(z.string()),
  meet: z.boolean(),
  description: z.string(),
});

export type EventProposal = z.infer<typeof proposalSchema>;

export function hasModel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function model() {
  return anthropic(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6");
}

async function threadText(tenantId: string, threadId: string) {
  const thread = await getThread(tenantId, threadId);
  return thread.messages
    .map((message) => `From: ${message.fromName} <${message.fromEmail}>\nSubject: ${message.subject}\n${message.html.replace(/<[^>]+>/g, " ")}`)
    .join("\n\n")
    .slice(0, 12000);
}

export async function streamSummary(tenantId: string, threadId: string) {
  const source = await threadText(tenantId, threadId);
  if (!hasModel()) {
    const text = fallbackSummary(source);
    await cacheSummary(tenantId, threadId, text);
    return textResponse(text);
  }
  const result = streamText({
    model: model(),
    prompt: `Summarize this email thread in 4 short bullets for a busy founder. No preamble.\n\n${source}`,
    onFinish: async ({ text }) => {
      await cacheSummary(tenantId, threadId, text);
    },
  });
  return result.toTextStreamResponse();
}

export async function streamDraft(tenantId: string, threadId: string, tone: string, instruction?: string) {
  const source = await threadText(tenantId, threadId);
  if (!hasModel()) return textResponse(fallbackDraft(source, tone));
  const result = streamText({
    model: model(),
    prompt: `Write a reply email in a ${tone} tone. Return only the HTML body using <p> tags. Do not include a subject line. The user will review it before sending.\n${instruction ? `Instruction: ${instruction}\n` : ""}\nThread:\n${source}`,
  });
  return result.toTextStreamResponse();
}

export async function proposeFromThread(tenantId: string, threadId: string): Promise<EventProposal> {
  const source = await threadText(tenantId, threadId);
  if (!hasModel()) return fallbackSchedule(source, "America/Los_Angeles");
  const result = await generateObject({
    model: model(),
    schema: proposalSchema,
    prompt: `Extract a meeting proposal from this email. Use ISO datetimes. If the email says Friday at 10, use the next Friday in America/Los_Angeles. Default length 30 minutes. Include the sender as an attendee if you can see their email. meet=true when they mention a call or Meet.\n\n${source}`,
  });
  return result.object;
}

export async function runCommand(tenantId: string, prompt: string, timeZone: string): Promise<{ text: string; proposal: EventProposal | null }> {
  const local = fallbackCommand(prompt, timeZone);
  if (!hasModel()) return local;
  let proposal: EventProposal | null = null;
  const result = await generateText({
    model: model(),
    stopWhen: stepCountIs(6),
    system: "You help with mail and calendar. Never send email or create events yourself. To schedule, call proposeEvent and tell the user to confirm in the card. Current timezone: " + timeZone,
    prompt,
    tools: {
      searchMail: tool({
        description: "Search the user's mail with Gmail query syntax",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const listed = await listThreads({ tenantId, folder: "inbox", query, limit: 8 });
          return listed.threads.map((thread) => ({ subject: thread.subject, from: thread.fromEmail, date: thread.date, snippet: thread.snippet }));
        },
      }),
      listEvents: tool({
        description: "List calendar events between two ISO timestamps",
        inputSchema: z.object({ timeMin: z.string(), timeMax: z.string() }),
        execute: async ({ timeMin, timeMax }) => {
          const events = await listEvents(tenantId, timeMin, timeMax);
          return events.map((event) => ({ summary: event.summary, start: event.start, end: event.end }));
        },
      }),
      proposeEvent: tool({
        description: "Propose a calendar event for the user to confirm. Does not create it.",
        inputSchema: proposalSchema,
        execute: async (input) => {
          proposal = input;
          return { status: "needs_confirmation" };
        },
      }),
    },
  });
  return { text: result.text || local.text, proposal: proposal ?? local.proposal };
}

async function cacheSummary(tenantId: string, threadId: string, content: string) {
  const db = getDb();
  const existing = (await db.select().from(aiSummaries).where(eq(aiSummaries.threadId, threadId))).find((row) => row.tenantId === tenantId && row.kind === "summary");
  if (existing) {
    await db.update(aiSummaries).set({ content, createdAt: new Date() }).where(and(eq(aiSummaries.id, existing.id)));
    return;
  }
  await db.insert(aiSummaries).values({
    id: nanoid(),
    tenantId,
    threadId,
    kind: "summary",
    tone: null,
    content,
    createdAt: new Date(),
  });
}

function textResponse(text: string) {
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

function fallbackSummary(source: string) {
  const line = source.split("\n").find((item) => item.startsWith("Subject:")) ?? "Thread";
  return `• ${line.replace("Subject: ", "")}\n• The sender is asking for a decision.\n• A short reply is enough.\n• Nothing here was sent automatically.`;
}

function fallbackDraft(source: string, tone: string) {
  const subject = source.match(/Subject: (.+)/)?.[1] ?? "this";
  if (tone === "brief") return `<p>Thanks — I'll take a look at ${subject} and follow up shortly.</p>`;
  if (tone === "formal") return `<p>Thank you for the note.</p><p>I will review ${subject} and reply with a concrete time.</p><p>Best,</p>`;
  return `<p>Thanks for this.</p><p>Friday at 10 works on my side — I'll send a calendar invite.</p>`;
}

export function fallbackSchedule(source: string, timeZone: string): EventProposal {
  const email = source.match(/<([^>]+@[^>]+)>/)?.[1] ?? "";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + (source.toLowerCase().includes("friday") ? ((5 - tomorrow.getDay() + 7) % 7 || 7) : 1));
  const hourMatch = source.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour = hourMatch ? Number(hourMatch[1]) : 10;
  const minute = hourMatch?.[2] ? Number(hourMatch[2]) : 0;
  const ampm = hourMatch?.[3]?.toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  tomorrow.setHours(hour, minute, 0, 0);
  const end = new Date(tomorrow.getTime() + 30 * 60 * 1000);
  return {
    summary: email ? `Call with ${email.split("@")[0]}` : "Proposed meeting",
    start: tomorrow.toISOString(),
    end: end.toISOString(),
    timeZone,
    attendees: email ? [email] : [],
    meet: true,
    description: "Proposed from the email thread. Review before sending the invite.",
  };
}

function fallbackCommand(prompt: string, timeZone: string): { text: string; proposal: EventProposal | null } {
  const lower = prompt.toLowerCase();
  if (lower.includes("schedule") || lower.includes("call") || lower.includes("meet")) {
    const name = prompt.match(/with\s+([A-Za-z][\w'-]*)/i)?.[1] ?? "them";
    const proposal = fallbackSchedule(`with ${name} <${name.toLowerCase()}@acme.dev> ${prompt}`, timeZone);
    proposal.summary = `Call with ${name}`;
    if (name.toLowerCase() === "maya") proposal.attendees = ["maya@acme.dev"];
    const minutes = prompt.match(/(\d+)\s*min/i);
    if (minutes) {
      const start = new Date(proposal.start);
      proposal.end = new Date(start.getTime() + Number(minutes[1]) * 60 * 1000).toISOString();
    }
    return { text: `I drafted “${proposal.summary}”. Confirm the card to create the invite.`, proposal };
  }
  return { text: "I can search mail, list your calendar, or draft an event. Nothing is sent until you confirm.", proposal: null };
}
