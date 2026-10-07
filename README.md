# Inboxly

Gmail and Google Calendar client. Live data goes through [Corsair](https://corsair.dev). `DEMO_MODE=true` is a single switch that loads a realistic mailbox so the UI still runs when Google is unreachable.

Auth falls back to a hardcoded tenant `demo` (Alex Chen) when `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` are not all set. Set those three to turn on Google sign-in; the tenant id is then the Better Auth user id.

## Local

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts embedded Postgres on port `54329` when `DATABASE_URL` is unset, defaults `DEMO_MODE` to `true`, and opens Next on http://localhost:3000. Copy `.env.example` to `.env.local` before a live Google demo.

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:e2e
```

## Live Google

1. Create a Corsair project and copy `CORSAIR_API_KEY`, `CORSAIR_SIGNING_SECRET`, and a `CORSAIR_KEK` (`openssl rand -base64 32`).
2. In Google Cloud, enable the Gmail API and the Calendar API. Create an OAuth client. The Corsair redirect is `https://auth.corsair.dev/oauth/callback`.
3. Create a Pub/Sub topic. Grant `gmail-api-push@system.gserviceaccount.com` the Publisher role. Set `GOOGLE_PUBSUB_TOPIC` to `projects/<project>/topics/<topic>`.
4. Create a push subscription on that topic. The endpoint is your public webhook, including the tenant:

```bash
ngrok http 3000
# delivery URL you register in Google:
# https://<ngrok-host>/api/webhook?tenantId=<better-auth user id, or demo>
```

`GOOGLE_PUBSUB_AUDIENCE` is the OIDC audience Corsair Hub checks on that push. Gmail does not deliver to the Hub URL itself; Calendar channel watches do, and Corsair renews both.

5. Set `DEMO_MODE=false`. Sign in, open Settings, connect Gmail and Calendar, then Register watches. The first sync pulls about 200 inbox threads and calendar events from 30 days ago through 60 days ahead.
6. A `ck_dev_` API key opens a Corsair tunnel on the first request to `/api/corsair`. Point Calendar's watch at that tunnel if you are not using ngrok for Hub delivery. Gmail still needs the Pub/Sub push URL above.

`/debug` (development, or `ENABLE_DEBUG=true`) lists recent webhook rows, watch expiry, and can replay the last event.

## Deploy

- Set every variable in `.env.example` on the Vercel project. `DEMO_MODE=false` for a real mailbox.
- `vercel.json` runs `/api/cron/renew-watches` every 6 hours. Vercel sends `Authorization: Bearer $CRON_SECRET`. Watches expire in about 7 days; the job renews them through Corsair.
- Use a hosted Postgres. Do not rely on the embedded database.
- Confirm `/api/corsair` is reachable, the Hub delivery URL is the production origin, and the Pub/Sub push URL is `https://<domain>/api/webhook?tenantId=<id>`.
- `pnpm build` must pass before promoting.

## What stays in this app's tables

Drizzle owns users, sessions, drafts, AI summaries, webhook event log, settings, sync state, and the demo mailbox. Corsair owns its own tables in the same database. Message bodies are not written to the webhook log.
