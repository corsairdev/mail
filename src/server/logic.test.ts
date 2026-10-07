import assert from "node:assert/strict";
import test from "node:test";
import { expandRecurrence } from "./calendar/recurrence";
import { toAppError } from "./errors";
import { gmailPushAddress } from "./gmail-push";
import { categoryOf, inFolder, threadLabelIds } from "./mail/folders";
import { buildRaw, buildRfc822 } from "./mail/mime";
import { extractBodies, parseAddress, parseGmailQuery, senderName } from "./mail/parse";
import { blockRemoteImages, sanitizeEmailHtml } from "./mail/sanitize";

test("raw email is base64url and keeps reply headers", () => {
  const raw = buildRaw({
    from: "Alex <alex@northwind.dev>",
    to: ["sam@acme.dev"],
    cc: [],
    bcc: [],
    subject: "Hello",
    html: "<p>Hi</p>",
    inReplyTo: "<m1@northwind.dev>",
    references: "<m1@northwind.dev>",
  });
  assert.equal(raw.includes("+"), false);
  assert.equal(raw.includes("/"), false);
  assert.equal(raw.endsWith("="), false);
  const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.match(decoded, /In-Reply-To: <m1@northwind.dev>/);
  assert.match(buildRfc822({
    from: "a@b.c",
    to: ["c@d.e"],
    cc: [],
    bcc: [],
    subject: "S",
    html: "<p>x</p>",
  }), /Content-Type: text\/html/);
});

test("gmail query passthrough tokens", () => {
  const parsed = parseGmailQuery("from:sam@acme.dev is:unread has:attachment label:customers roadmap");
  assert.equal(parsed.from, "sam@acme.dev");
  assert.equal(parsed.unread, true);
  assert.equal(parsed.attachment, true);
  assert.equal(parsed.label, "customers");
  assert.equal(parsed.text, "roadmap");
});

test("weekly recurrence expands inside the window", () => {
  const copies = expandRecurrence(
    {
      id: "evt",
      start: "2026-10-05T10:00:00.000Z",
      end: "2026-10-05T10:30:00.000Z",
      allDay: false,
      recurrence: ["RRULE:FREQ=WEEKLY;COUNT=4"],
    },
    new Date("2026-10-01T00:00:00.000Z"),
    new Date("2026-10-31T00:00:00.000Z"),
  );
  assert.equal(copies.length, 4);
  assert.equal(copies[1]?.id.startsWith("evt_"), true);
});

test("a trashed copy does not hide the live message", () => {
  const labels = threadLabelIds([
    { labelIds: ["TRASH"] },
    { labelIds: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"] },
  ]);
  assert.equal(inFolder(labels, "inbox"), true);
  assert.equal(inFolder(labels, "trash"), false);
  assert.equal(categoryOf(labels), "primary");
});

test("promotions stay out of primary", () => {
  const labels = ["INBOX", "CATEGORY_PROMOTIONS"];
  assert.equal(categoryOf(labels), "promotions");
  assert.equal(inFolder(labels, "inbox"), true);
});

test("address and body parsing", () => {
  assert.deepEqual(parseAddress('Ada Lovelace <ada@mail.dev>'), { name: "Ada Lovelace", email: "ada@mail.dev" });
  assert.equal(senderName("", "ada.lovelace@mail.dev"), "Ada Lovelace");
  const html = Buffer.from("<p>Hello</p>").toString("base64url");
  const bodies = extractBodies({ mimeType: "text/html", body: { data: html } });
  assert.equal(bodies.html, "<p>Hello</p>");
  assert.equal(sanitizeEmailHtml('<p>Hi</p><script>alert(1)</script>').includes("script"), false);
  assert.match(blockRemoteImages('<img src="https://evil.test/a.png">'), /data-remote-image/);
});

test("gmail push address is the mailbox, not the query string", () => {
  const data = Buffer.from(JSON.stringify({ emailAddress: "Ada@Mail.dev", historyId: "9" })).toString("base64");
  assert.equal(gmailPushAddress({ message: { data } }), "ada@mail.dev");
  assert.equal(gmailPushAddress({ message: { data: "%%%" } }), null);
  assert.equal(gmailPushAddress({}), null);
});

test("quota errors pause instead of looking like a random failure", () => {
  const error = Object.assign(new Error("Forbidden"), {
    body: { error: { message: "Quota exceeded for quota metric 'Total Query Cost'" } },
  });
  assert.equal(toAppError(error).code, "RATE_LIMIT");
});
