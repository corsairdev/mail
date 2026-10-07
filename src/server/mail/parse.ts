import { asRecord, str } from "../errors";

export function headerValue(payload: unknown, name: string): string {
  const headers = asRecord(payload).headers;
  if (!Array.isArray(headers)) return "";
  for (const header of headers) {
    const record = asRecord(header);
    if (str(record.name)?.toLowerCase() === name.toLowerCase()) return str(record.value) ?? "";
  }
  return "";
}

export function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((data.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
  headers?: { name?: string; value?: string }[];
};

function asPart(value: unknown): Part {
  const record = asRecord(value);
  const body = asRecord(record.body);
  return {
    mimeType: str(record.mimeType) ?? undefined,
    filename: str(record.filename) ?? undefined,
    body: {
      data: str(body.data) ?? undefined,
      attachmentId: str(body.attachmentId) ?? undefined,
      size: typeof body.size === "number" ? body.size : undefined,
    },
    parts: Array.isArray(record.parts) ? record.parts.map(asPart) : undefined,
    headers: Array.isArray(record.headers)
      ? record.headers.map((header) => {
          const item = asRecord(header);
          return { name: str(item.name) ?? undefined, value: str(item.value) ?? undefined };
        })
      : undefined,
  };
}

export function extractBodies(payload: unknown): { html: string; text: string } {
  const root = asPart(payload);
  let html = "";
  let text = "";
  const walk = (part: Part) => {
    const data = part.body?.data ? decodeBase64Url(part.body.data) : "";
    if (part.mimeType === "text/html" && data && !html) html = data;
    if (part.mimeType === "text/plain" && data && !text) text = data;
    for (const child of part.parts ?? []) walk(child);
  };
  walk(root);
  if (!html && text) html = `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`;
  return { html, text };
}

export type AttachmentMeta = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  contentBase64?: string;
};

export function extractAttachments(payload: unknown): AttachmentMeta[] {
  const found: AttachmentMeta[] = [];
  const walk = (part: Part) => {
    if (part.filename) {
      found.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body?.size ?? 0,
        attachmentId: part.body?.attachmentId,
        contentBase64: part.body?.data,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(asPart(payload));
  return found;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function senderName(name: string, email: string): string {
  const clean = decodeEntities(name).replace(/^"|"$/g, "").trim();
  if (clean && clean.toLowerCase() !== "unknown" && clean !== email) return clean;
  const local = email.includes("@") ? (email.split("@")[0] ?? "") : "";
  if (!local || local.toLowerCase() === "unknown") return "Unknown sender";
  return local
    .replace(/[._+]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*)<([^>]+)>$/);
  if (!match) return { name: raw, email: raw.trim() };
  return { name: match[1].replace(/"/g, "").trim() || match[2], email: match[2].trim() };
}

export type MailQuery = {
  from?: string;
  unread?: boolean;
  attachment?: boolean;
  label?: string;
  text: string;
};

export function parseGmailQuery(query: string): MailQuery {
  const parsed: MailQuery = { text: "" };
  const text: string[] = [];
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const [key, ...rest] = token.split(":");
    const value = rest.join(":");
    if (key === "from" && value) parsed.from = value.toLowerCase();
    else if (key === "is" && value === "unread") parsed.unread = true;
    else if (key === "has" && value === "attachment") parsed.attachment = true;
    else if (key === "label" && value) parsed.label = value.toLowerCase();
    else text.push(token);
  }
  parsed.text = text.join(" ").toLowerCase();
  return parsed;
}
