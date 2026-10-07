import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, getPool } from "../db";
import { drafts, userSettings } from "../db/schema";
import { AppError, asRecord, str, toAppError } from "../errors";
import { isDemoMode } from "../flags";
import { emitLive } from "../live";
import { withTenant } from "../corsair";
import {
  ensureDemo,
  insertDemoMessage,
  loadDemoLabels,
  loadDemoMessages,
  patchDemoThread,
} from "../demo/store";
import { buildRaw } from "./mime";
import { decodeEntities, extractAttachments, extractBodies, headerValue, parseAddress, parseGmailQuery, senderName } from "./parse";
import { categoryOf, inFolder, threadLabelIds, type Category, type Folder } from "./folders";
import { sanitizeEmailHtml } from "./sanitize";

export type { Category, Folder };

export type ThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  fromName: string;
  fromEmail: string;
  date: string;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  labelIds: string[];
  messageCount: number;
};

export type MailMessage = {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string;
  html: string;
  labelIds: string[];
  attachments: { filename: string; mimeType: string; size: number; attachmentId?: string; contentBase64?: string }[];
  messageIdHeader: string;
};

export type MailLabel = { id: string; name: string; type: "system" | "user"; unread: number };

type Normalized = MailMessage & { snippet: string };

function summarize(messages: Normalized[]): ThreadSummary[] {
  const groups = new Map<string, Normalized[]>();
  for (const message of messages) {
    const list = groups.get(message.threadId) ?? [];
    list.push(message);
    groups.set(message.threadId, list);
  }
  return [...groups.values()].map((list) => {
    const sorted = [...list].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const latest = sorted[sorted.length - 1] ?? sorted[0];
    if (!latest) throw new Error("Empty thread");
    const labels = threadLabelIds(sorted);
    const incoming = [...sorted].reverse().find((item) => !item.labelIds.includes("SENT")) ?? latest;
    return {
      id: latest.threadId,
      subject: latest.subject,
      snippet: latest.snippet,
      fromName: incoming.fromName,
      fromEmail: incoming.fromEmail,
      date: latest.date,
      unread: labels.includes("UNREAD"),
      starred: labels.includes("STARRED"),
      hasAttachment: sorted.some((item) => item.attachments.length > 0),
      labelIds: labels,
      messageCount: sorted.length,
    };
  });
}

function applyQuery(threads: ThreadSummary[], messages: Normalized[], query: string): ThreadSummary[] {
  const parsed = parseGmailQuery(query);
  if (!query.trim()) return threads;
  return threads.filter((thread) => {
    const body = messages.filter((message) => message.threadId === thread.id);
    if (parsed.from && !`${thread.fromEmail} ${thread.fromName}`.toLowerCase().includes(parsed.from)) return false;
    if (parsed.unread && !thread.unread) return false;
    if (parsed.attachment && !thread.hasAttachment) return false;
    if (parsed.label) {
      const names = thread.labelIds.map((label) => label.toLowerCase());
      if (!names.some((label) => label.includes(parsed.label ?? ""))) return false;
    }
    if (!parsed.text) return true;
    const haystack = [thread.subject, thread.snippet, ...body.map((message) => message.html)].join(" ").toLowerCase();
    return haystack.includes(parsed.text);
  });
}

async function accountOf(tenantId: string) {
  const [row] = await getDb().select().from(userSettings).where(eq(userSettings.tenantId, tenantId)).limit(1);
  return {
    email: row?.email ?? "me@localhost",
    name: row?.displayName ?? "Me",
  };
}

function fromDemo(row: Awaited<ReturnType<typeof loadDemoMessages>>[number]): Normalized {
  return {
    id: row.id,
    threadId: row.threadId,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    to: row.toEmails,
    cc: row.ccEmails,
    subject: row.subject,
    date: row.internalDate.toISOString(),
    html: sanitizeEmailHtml(row.bodyHtml),
    snippet: row.snippet,
    labelIds: row.labelIds,
    attachments: row.attachments,
    messageIdHeader: row.messageIdHeader,
  };
}

function fromEntity(row: unknown): Normalized | null {
  const record = asRecord(row);
  const data = asRecord(record.data ?? record);
  const id = str(data.id) ?? str(record.entityId);
  const threadId = str(data.threadId) ?? id;
  if (!id || !threadId) return null;
  const payload = data.payload;
  const fromRaw = str(data.from) ?? headerValue(payload, "From");
  const toRaw = str(data.to) ?? headerValue(payload, "To");
  const ccRaw = headerValue(payload, "Cc");
  const subject = decodeEntities(str(data.subject) ?? headerValue(payload, "Subject") ?? "(no subject)");
  const from = parseAddress(fromRaw || "");
  const name = senderName(from.name, from.email);
  const bodies = payload ? extractBodies(payload) : { html: "", text: "" };
  const rawHtml = str(data.body) ?? bodies.html;
  const html = payload ? sanitizeEmailHtml(rawHtml || `<p>${decodeEntities(str(data.snippet) ?? "")}</p>`) : "";
  const internal = str(data.internalDate);
  const date = internal ? new Date(Number(internal) || internal).toISOString() : new Date().toISOString();
  const labelIds = Array.isArray(data.labelIds) ? data.labelIds.filter((item): item is string => typeof item === "string") : [];
  return {
    id,
    threadId,
    fromName: name,
    fromEmail: from.email,
    to: toRaw.split(",").map((item) => item.trim()).filter(Boolean),
    cc: ccRaw.split(",").map((item) => item.trim()).filter(Boolean),
    subject,
    date: Number.isNaN(+new Date(date)) ? new Date().toISOString() : date,
    html,
    snippet: decodeEntities(str(data.snippet) ?? ""),
    labelIds,
    attachments: extractAttachments(payload),
    messageIdHeader: headerValue(payload, "Message-ID") || headerValue(payload, "Message-Id"),
  };
}

async function cachedMessages(tenantId: string, threadId?: string): Promise<Normalized[]> {
  const params: string[] = [tenantId];
  let threadSql = "";
  if (threadId) {
    params.push(threadId);
    threadSql = "and (e.data->>'threadId' = $2 or e.entity_id = $2)";
  }
  const dataSql = threadId
    ? "e.data"
    : `jsonb_build_object(
        'id', e.data->'id',
        'threadId', e.data->'threadId',
        'from', e.data->'from',
        'to', e.data->'to',
        'subject', e.data->'subject',
        'snippet', e.data->'snippet',
        'internalDate', e.data->'internalDate',
        'labelIds', e.data->'labelIds'
      )`;
  const result = await getPool().query<{ data: unknown }>(
    `select ${dataSql} as data
     from corsair_entities e
     join corsair_accounts a on a.id = e.account_id
     join corsair_integrations i on i.id = a.integration_id
     where a.tenant_id = $1 and i.name = 'gmail' and e.entity_type = 'messages'
     ${threadSql}`,
    params,
  );
  return result.rows.map((row) => fromEntity({ data: row.data })).filter((item): item is Normalized => item !== null);
}

export async function listThreads(input: {
  tenantId: string;
  folder: Folder;
  labelId?: string;
  category?: Category;
  query?: string;
  cursor?: number;
  limit: number;
}) {
  if (isDemoMode()) await ensureDemo(input.tenantId);
  let messages: Normalized[] = [];
  if (isDemoMode()) {
    messages = (await loadDemoMessages(input.tenantId)).map(fromDemo);
  } else {
    try {
      messages = await cachedMessages(input.tenantId);
    } catch (error) {
      throw toAppError(error);
    }
  }
  if (!isDemoMode()) messages = messages.filter((message) => message.fromEmail.includes("@"));
  let threads = summarize(messages).filter((thread) => inFolder(thread.labelIds, input.folder, input.labelId));
  if (input.folder === "inbox" && input.category) {
    threads = threads.filter((thread) => categoryOf(thread.labelIds) === input.category);
  }
  if (input.query?.trim()) threads = applyQuery(threads, messages, input.query);
  threads.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const start = input.cursor ?? 0;
  const page = threads.slice(start, start + input.limit);
  const unread = summarize(messages).filter((thread) => inFolder(thread.labelIds, "inbox") && thread.unread).length;
  return {
    threads: page,
    nextCursor: start + input.limit < threads.length ? start + input.limit : null,
    unread,
  };
}

export async function getThread(tenantId: string, threadId: string): Promise<{ messages: MailMessage[] }> {
  if (isDemoMode()) {
    await ensureDemo(tenantId);
    const messages = (await loadDemoMessages(tenantId)).map(fromDemo).filter((message) => message.threadId === threadId);
    messages.sort((a, b) => +new Date(a.date) - +new Date(b.date));
    return { messages };
  }
  const cached = (await cachedMessages(tenantId, threadId)).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const savedBody = await getPool().query(
    `select 1
     from corsair_entities e
     join corsair_accounts a on a.id = e.account_id
     join corsair_integrations i on i.id = a.integration_id
     where a.tenant_id = $1 and i.name = 'gmail' and e.entity_type = 'messages'
       and (e.data->>'threadId' = $2 or e.entity_id = $2)
       and e.data ? 'payload'
     limit 1`,
    [tenantId, threadId],
  );
  if (cached.length > 0 && savedBody.rowCount) return { messages: cached };
  try {
    const tenant = withTenant(tenantId);
    const thread = await tenant.gmail.api.threads.get({ id: threadId, format: "full" });
    const messages = (thread.messages ?? [])
      .map((message) => fromEntity({ data: message }))
      .filter((message): message is Normalized => message !== null)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
    if (messages.length > 0) return { messages };
  } catch {
    if (cached.length > 0) return { messages: cached };
  }
  if (cached.length > 0) return { messages: cached };
  throw new AppError("UPSTREAM", "Could not open this conversation.");
}

export async function listLabels(tenantId: string): Promise<MailLabel[]> {
  if (isDemoMode()) {
    await ensureDemo(tenantId);
    const labels = await loadDemoLabels(tenantId);
    const messages = await loadDemoMessages(tenantId);
    return labels
      .filter((label) => label.type === "user" || ["INBOX", "STARRED", "SENT", "DRAFT", "TRASH", "SPAM"].includes(label.labelId))
      .map((label) => ({
        id: label.labelId,
        name: label.name,
        type: label.type === "user" ? "user" : "system",
        unread: new Set(
          messages.filter((message) => message.labelIds.includes(label.labelId) && message.labelIds.includes("UNREAD")).map((message) => message.threadId),
        ).size,
      }));
  }
  try {
    const tenant = withTenant(tenantId);
    const result = await tenant.gmail.api.labels.list({});
    return (result.labels ?? [])
      .filter((label) => label.id && label.name)
      .map((label) => ({
        id: label.id ?? "",
        name: label.name ?? "",
        type: label.type === "user" ? "user" : "system",
        unread: label.threadsUnread ?? 0,
      }));
  } catch (error) {
    const app = toAppError(error);
    if (app.code === "AUTH_MISSING" || app.code === "RECONNECT" || app.code === "RATE_LIMIT") return [];
    throw app;
  }
}

async function mutateLabels(tenantId: string, threadId: string, add: string[], remove: string[]) {
  if (isDemoMode()) {
    await patchDemoThread(tenantId, threadId, (labels) => {
      const next = new Set(labels);
      for (const label of remove) next.delete(label);
      for (const label of add) next.add(label);
      return [...next];
    });
    await emitLive(tenantId, "gmail", "messageLabelChanged", threadId, "Mailbox updated");
    return;
  }
  try {
    await withTenant(tenantId).gmail.api.threads.modify({
      id: threadId,
      addLabelIds: add,
      removeLabelIds: remove,
    });
  } catch (error) {
    throw toAppError(error);
  }
}

export async function archiveThread(tenantId: string, threadId: string) {
  if (isDemoMode()) {
    await mutateLabels(tenantId, threadId, [], ["INBOX"]);
    return;
  }
  await writeLabels(tenantId, threadId, [], ["INBOX"]);
}

export async function trashThread(tenantId: string, threadId: string) {
  if (isDemoMode()) {
    await mutateLabels(tenantId, threadId, ["TRASH"], ["INBOX"]);
    return;
  }
  await writeLabels(tenantId, threadId, ["TRASH"], ["INBOX"]);
}

type LabelJob = { tenantId: string; threadId: string; add: string[]; remove: string[]; tries: number };
const labelJobs: LabelJob[] = [];
let labelFlush: Promise<void> | null = null;

function rememberGmailLabels(tenantId: string, threadId: string, add: string[], remove: string[]) {
  const index = labelJobs.findIndex((job) => job.tenantId === tenantId && job.threadId === threadId);
  if (index >= 0) labelJobs.splice(index, 1);
  labelJobs.push({ tenantId, threadId, add, remove, tries: 0 });
  labelFlush ??= flushLabelJobs().finally(() => {
    labelFlush = null;
  });
}

async function flushLabelJobs() {
  while (labelJobs.length > 0) {
    const job = labelJobs[0];
    if (!job) return;
    try {
      await mutateLabels(job.tenantId, job.threadId, job.add, job.remove);
      labelJobs.shift();
    } catch (error) {
      const app = toAppError(error);
      job.tries += 1;
      if (job.tries > 6 || (app.code !== "RATE_LIMIT" && !/forbidden/i.test(app.message))) {
        labelJobs.shift();
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}

async function writeLabels(tenantId: string, threadId: string, add: string[], remove: string[]) {
  await patchCachedLabels(tenantId, threadId, add, remove);
  try {
    await mutateLabels(tenantId, threadId, add, remove);
  } catch (error) {
    const app = toAppError(error);
    if (app.code === "RATE_LIMIT" || /forbidden/i.test(app.message)) {
      rememberGmailLabels(tenantId, threadId, add, remove);
      return;
    }
    throw app;
  }
}

export async function setStar(tenantId: string, threadId: string, starred: boolean) {
  await writeLabels(tenantId, threadId, starred ? ["STARRED"] : [], starred ? [] : ["STARRED"]);
}

async function patchCachedLabels(tenantId: string, threadId: string, add: string[], remove: string[]) {
  await getPool().query(
    `update corsair_entities e
     set data = jsonb_set(
       e.data,
       '{labelIds}',
       (
         select coalesce(jsonb_agg(to_jsonb(lbl)), '[]'::jsonb)
         from (
           select lbl
           from jsonb_array_elements_text(coalesce(e.data->'labelIds', '[]'::jsonb)) lbl
           where not (lbl = any($3::text[]))
           union
           select unnest($2::text[])
         ) labels
       )
     )
     from corsair_accounts a
     join corsair_integrations i on i.id = a.integration_id
     where e.account_id = a.id
       and a.tenant_id = $1
       and i.name = 'gmail'
       and e.entity_type = 'messages'
       and (e.data->>'threadId' = $4 or e.entity_id = $4)`,
    [tenantId, add, remove, threadId],
  );
}

export async function setRead(tenantId: string, threadId: string, read: boolean) {
  await writeLabels(tenantId, threadId, read ? [] : ["UNREAD"], read ? ["UNREAD"] : []);
}

export async function listContacts(tenantId: string): Promise<{ name: string; email: string }[]> {
  const { threads } = await listThreads({ tenantId, folder: "inbox", limit: 100 });
  const sent = await listThreads({ tenantId, folder: "sent", limit: 50 });
  const map = new Map<string, string>();
  for (const thread of [...threads, ...sent.threads]) {
    if (thread.fromEmail) map.set(thread.fromEmail.toLowerCase(), thread.fromName);
  }
  return [...map.entries()].map(([email, name]) => ({ email, name }));
}

export async function sendMail(input: {
  tenantId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  threadId?: string;
  replyToMessageId?: string;
  references?: string;
  attachments?: { filename: string; mimeType: string; contentBase64: string }[];
  draftId?: string;
}) {
  if (input.to.length === 0) throw new AppError("UPSTREAM", "Add at least one recipient.");
  const account = await accountOf(input.tenantId);
  if (isDemoMode()) {
    await ensureDemo(input.tenantId);
    const sent = await insertDemoMessage({
      tenantId: input.tenantId,
      threadId: input.threadId,
      fromName: account.name,
      fromEmail: account.email,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      html: input.html,
      labels: ["SENT", "CATEGORY_PERSONAL"],
      attachments: input.attachments?.map((file) => ({
        ...file,
        size: Math.ceil((file.contentBase64.length * 3) / 4),
      })),
    });
    const self = input.to.some((address) => address.toLowerCase() === account.email.toLowerCase());
    if (self) {
      await insertDemoMessage({
        tenantId: input.tenantId,
        fromName: account.name,
        fromEmail: account.email,
        to: input.to,
        subject: input.subject,
        html: input.html,
        labels: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
      });
    }
    if (input.draftId) await getDb().delete(drafts).where(eq(drafts.id, input.draftId));
    await emitLive(input.tenantId, "gmail", "messageReceived", sent.threadId, self ? "New mail" : "Message sent");
    return { id: sent.id, threadId: sent.threadId };
  }
  try {
    const raw = buildRaw({
      from: `${account.name} <${account.email}>`,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: input.html,
      inReplyTo: input.replyToMessageId,
      references: input.references,
      attachments: input.attachments,
    });
    const sent = await withTenant(input.tenantId).gmail.api.messages.send({
      raw,
      threadId: input.threadId,
    });
    if (input.draftId) await getDb().delete(drafts).where(eq(drafts.id, input.draftId));
    const threadId = sent.threadId ?? input.threadId ?? "";
    if (threadId) {
      const { ingestThread } = await import("../sync");
      await ingestThread(input.tenantId, threadId).catch(() => undefined);
    }
    return { id: sent.id ?? nanoid(), threadId };
  } catch (error) {
    throw toAppError(error);
  }
}

export async function saveDraft(input: {
  tenantId: string;
  id?: string;
  mode: string;
  threadId?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
}) {
  const id = input.id ?? nanoid();
  const db = getDb();
  await db
    .insert(drafts)
    .values({
      id,
      tenantId: input.tenantId,
      mode: input.mode,
      threadId: input.threadId,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: drafts.id,
      set: {
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        updatedAt: new Date(),
      },
    });
  return { id };
}

export async function listDrafts(tenantId: string) {
  return getDb().select().from(drafts).where(eq(drafts.tenantId, tenantId));
}

export async function deleteDraft(tenantId: string, id: string) {
  await getDb().delete(drafts).where(and(eq(drafts.id, id), eq(drafts.tenantId, tenantId)));
}

export async function attachmentBytes(tenantId: string, messageId: string, filename: string) {
  const threadLists = isDemoMode() ? await loadDemoMessages(tenantId) : [];
  if (isDemoMode()) {
    for (const message of threadLists) {
      if (message.id !== messageId) continue;
      const file = message.attachments.find((item) => item.filename === filename);
      if (!file) break;
      return { mimeType: file.mimeType, filename: file.filename, bytes: Buffer.from(file.contentBase64, "base64") };
    }
    throw new AppError("UPSTREAM", "Attachment not found");
  }
  try {
    const message = await withTenant(tenantId).gmail.api.messages.get({ id: messageId, format: "full" });
    const files = extractAttachments(message.payload);
    const file = files.find((item) => item.filename === filename);
    if (!file?.contentBase64) {
      throw new AppError("UPSTREAM", "This attachment is not inline. The Gmail plugin does not expose attachments.get; only inline parts can be downloaded.");
    }
    return { mimeType: file.mimeType, filename: file.filename, bytes: Buffer.from(file.contentBase64, "base64url") };
  } catch (error) {
    throw toAppError(error);
  }
}
