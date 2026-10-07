import assert from "node:assert/strict";
import test from "node:test";
import { buildRaw, buildRfc822 } from "./mail/mime";
import { parseGmailQuery } from "./mail/parse";
import { expandRecurrence } from "./calendar/recurrence";

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
