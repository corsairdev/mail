export type OutboundMail = {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  attachments?: { filename: string; mimeType: string; contentBase64: string }[];
};

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function toBase64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildRfc822(mail: OutboundMail): string {
  const boundary = `mail_${Date.now().toString(36)}`;
  const lines = [
    `From: ${mail.from}`,
    `To: ${mail.to.join(", ")}`,
    mail.cc.length ? `Cc: ${mail.cc.join(", ")}` : "",
    mail.bcc.length ? `Bcc: ${mail.bcc.join(", ")}` : "",
    `Subject: ${encodeHeader(mail.subject)}`,
    mail.inReplyTo ? `In-Reply-To: ${mail.inReplyTo}` : "",
    mail.references ? `References: ${mail.references}` : "",
    "MIME-Version: 1.0",
  ].filter(Boolean);

  const files = mail.attachments ?? [];
  if (files.length === 0) {
    lines.push("Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", Buffer.from(mail.html, "utf8").toString("base64"));
    return lines.join("\r\n");
  }

  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "");
  lines.push(`--${boundary}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", Buffer.from(mail.html, "utf8").toString("base64"));
  for (const file of files) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${file.mimeType}; name="${file.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${file.filename}"`,
      "",
      file.contentBase64,
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

export function buildRaw(mail: OutboundMail): string {
  return toBase64Url(buildRfc822(mail));
}
