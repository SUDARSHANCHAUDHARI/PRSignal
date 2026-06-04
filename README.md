# PRSignal Hybrid MVP

PRSignal is a hybrid PR review enforcement system.

It combines:

1. GitHub webhook receiver
2. Slack DM notification with buttons
3. Chrome extension full-page overlay
4. SQLite database
5. Reviewer mapping between GitHub, Slack, and extension token

The goal is simple: when someone is added as a PR reviewer, they should not miss it.

## Architecture

```txt
GitHub Pull Request Event
        ↓
PRSignal API
        ↓
SQLite DB
        ↓
Slack DM + Chrome Extension Overlay
```

## What is included

```txt
apps/api        Node.js Express backend
apps/extension  Chrome extension Manifest V3
prompts         Claude/Codex build prompts
.env.example    Environment variables
```

## Requirements

- Node.js 20+
- pnpm 9+
- Slack workspace admin access for app installation
- GitHub repo admin access for webhook setup
- Chrome or Chromium browser

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create env file

```bash
cp .env.example .env
```

Fill in:

```env
GITHUB_WEBHOOK_SECRET=YOUR_GITHUB_WEBHOOK_SECRET
SLACK_BOT_TOKEN=YOUR_SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET=YOUR_SLACK_SIGNING_SECRET
JWT_SECRET=YOUR_JWT_SECRET
TEAM_CHANNEL_ID=YOUR_TEAM_CHANNEL_ID
```

### 3. Run backend

```bash
pnpm dev
```

Open:

```txt
http://localhost:4000/health
```

You should see:

```json
{ "ok": true, "service": "prsignal-api" }
```

## Slack App setup

Create a Slack app at Slack API dashboard.

### Bot token scopes

Add these bot scopes:

```txt
chat:write
im:write
users:read
```

Install app to workspace.

Copy:

```txt
Bot User OAuth Token → SLACK_BOT_TOKEN
Signing Secret → SLACK_SIGNING_SECRET
```

### Interactivity endpoint

Set Slack Interactivity Request URL:

```txt
https://YOUR_DOMAIN/slack/interactions
```

For local testing, use ngrok:

```bash
ngrok http 4000
```

Then set:

```env
PUBLIC_APP_URL=https://YOUR_TUNNEL_DOMAIN
```

## GitHub webhook setup

In your GitHub repo:

```txt
Settings → Webhooks → Add webhook
```

Payload URL:

```txt
https://YOUR_DOMAIN/github/webhook
```

Content type:

```txt
application/json
```

Secret:

```txt
same value as GITHUB_WEBHOOK_SECRET
```

Events:

```txt
Pull requests
```

The MVP listens for:

```txt
pull_request.review_requested
pull_request.closed
```

## User mapping

Before Slack can DM a reviewer, PRSignal must know which GitHub username maps to which Slack user ID.

Create user mapping:

```bash
curl -X POST http://localhost:4000/admin/users \
  -H "content-type: application/json" \
  -d '{"githubUsername":"YOUR_GITHUB_USERNAME","slackUserId":"YOUR_SLACK_USER_ID","displayName":"Your Name"}'
```

Response includes:

```json
{
  "extensionToken": "..."
}
```

Use this token in Chrome extension popup.

## How to find Slack user ID

In Slack:

1. Open profile
2. Click three dots
3. Copy member ID

It looks like:

```txt
U012ABCDEF
```

## Chrome extension setup

Build extension:

```bash
pnpm --filter @prsignal/extension build
```

Load it:

```txt
Chrome → Extensions → Developer mode → Load unpacked → apps/extension/dist
```

Click PRSignal extension icon.

Add:

```txt
Backend URL: http://localhost:4000
Extension Token: token from /admin/users
```

Save.

## Test with fake webhook

Edit `apps/api/src/scripts/sendTestWebhook.ts` and replace:

```txt
YOUR_GITHUB_USERNAME
```

with your GitHub username.

Then run:

```bash
pnpm test:webhook
```

Expected result:

1. DB creates PR
2. DB creates review assignment
3. Slack DM is sent if Slack user mapping exists
4. Chrome extension overlay appears after polling

## API endpoints

### Health

```txt
GET /health
```

### Admin

```txt
POST /admin/users
GET /admin/users
```

### GitHub

```txt
POST /github/webhook
```

### Slack

```txt
POST /slack/interactions
```

### Extension

```txt
GET /extension/me
GET /extension/prs
POST /extension/assignments/:id/ack
POST /extension/assignments/:id/snooze
POST /extension/assignments/:id/complete
```

All extension endpoints require:

```txt
Authorization: Bearer EXTENSION_TOKEN
```

## Production deployment

Recommended first deployment:

- Railway
- Render
- Fly.io

Set environment variables in hosting dashboard.

Use persistent disk or Postgres for production. SQLite is okay for MVP and internal testing, but not best for multi-instance production.

## MVP limitations

This is intentionally simple.

Current MVP does not include:

- GitHub App OAuth installation
- Automatic GitHub to Slack identity lookup
- Team dashboard
- Reassign flow
- AI PR summaries
- Enterprise SSO

Those are next steps after MVP validation.

## Best product behavior

Do not make the overlay too aggressive from day one.

Good rules:

- Show overlay only for active pending reviews
- Respect snooze
- Allow acknowledge
- Allow mark done
- Do not block after completed PR

## Suggested next version

1. GitHub App instead of webhook secret per repo
2. Slack OAuth onboarding
3. Reviewer SLA settings
4. Team dashboard
5. Escalation rules
6. AI PR summary
7. VS Code extension

## Tone-based notification system

This version includes a message engine in `apps/api/src/services/messageTemplates.ts`.

PRSignal changes tone based on how long a review has been waiting:

| Waiting time | Tone | Example feeling |
|---|---|---|
| 0–30 min | clean | normal review request |
| 30–90 min | friendly | gentle nudge |
| 90–180 min | epic | `The stars have aligned...` |
| 180–360 min | dramatic | `I am but a hollow shell...` |
| 360+ min | direct | blocked / escalation tone |

Slack DMs use the same message engine as the Chrome extension overlay, so the product feels consistent across channels.

### Files added or updated

```txt
apps/api/src/services/messageTemplates.ts
apps/api/src/services/slack.ts
apps/api/src/routes/extension.ts
apps/extension/src/content.ts
apps/extension/src/content.css
```

### How to customize tone

Edit `getSlackIntro`, `getSlackBody`, and `getOverlayCopy` inside:

```txt
apps/api/src/services/messageTemplates.ts
```

You can safely change the copy without touching Slack API logic or extension logic.
