export function gmailPushAddress(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { message?: { data?: string } }).message?.data;
  if (!data) return null;
  try {
    const json = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as { emailAddress?: string };
    return json.emailAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
