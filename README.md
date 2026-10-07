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

Point the Pub/Sub push subscription at the Gmail webhook URL Hub gives you on `https://auth.corsair.dev`. Hub checks the notification and delivers it to this app. Locally that comes in through the Corsair tunnel at `/api/corsair`. In production Hub posts to the delivery URL you set in the dashboard.

The notification includes the Gmail address, and that address picks the mailbox.

Watches get renewed by `/api/cron/renew-watches` (see `vercel.json`). It expects `Authorization: Bearer $CRON_SECRET`.

```bash
pnpm typecheck
pnpm test:unit
```
