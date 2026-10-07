<div align="center">

<img src="public/corsair.png" alt="Corsair" width="56" />

# Mail

</div>

Gmail and Google Calendar. Google is wired through [Corsair](https://corsair.dev): `@corsair-dev/gmail` and `@corsair-dev/googlecalendar`.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

http://localhost:3000

`DEMO_MODE=true` is a fake inbox, so the UI works with no Google account. Set it to `false` and fill in the keys in `.env.example` when you want real mail. Sign-in is Google. Each account gets its own mailbox.

## Gmail push

One Pub/Sub topic, `GOOGLE_PUBSUB_TOPIC`. Give `gmail-api-push@system.gserviceaccount.com` Publisher on it.

The push endpoint is:

```
https://<your-domain>/api/webhook
```

The notification includes the Gmail address, and that address picks the mailbox. On my laptop I pointed Pub/Sub at an ngrok URL, because the Corsair tunnel only forwards `/api/corsair`.

Watches get renewed by `/api/cron/renew-watches` (see `vercel.json`). It expects `Authorization: Bearer $CRON_SECRET`.

```bash
pnpm typecheck
pnpm test:e2e
```
