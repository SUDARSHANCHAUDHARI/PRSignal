# PRSignal

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220.svg)](https://pnpm.io/)
[![Status](https://img.shields.io/badge/status-single--instance%20ready-green.svg)](RELEASE_MEMORY.md)

Hybrid PR review enforcement: GitHub webhook receiver, Slack DM workflow, and Chrome extension overlay for reviewer reminders.

> **Status:** Hardened for single-instance production — HMAC signature verification (GitHub + Slack), bearer-auth on `/admin` and `/extension`, rate limiting, and Zod config guards that refuse insecure defaults when `NODE_ENV=production`. Remaining steps before trusting it live: supply real GitHub/Slack credentials, run the one-time end-to-end smoke test, and move to Postgres only if you need multiple instances.

## Why This Exists

Pull request review requests are easy to miss across GitHub, Slack, and browser tabs. PRSignal explores a stricter workflow: when someone becomes a reviewer, the backend records it, Slack nudges them, and a Chrome extension can surface the pending review in-browser.

## Status

| Item | State |
|---|---|
| Release type | Single-instance production-ready |
| Backend | Express workspace app |
| Extension | Chrome Manifest V3 |
| Storage | SQLite (single-instance); Postgres for multi-instance |
| Security | Signature verification, bearer auth, rate limiting, prod config guards |
| Remaining | Live end-to-end smoke test with real GitHub/Slack credentials |

## Key Technical Decisions

**GitHub webhooks are the source of truth.** Reviewer events should come from GitHub instead of polling PR pages.

**Slack is used for immediate human notification.** PR review reminders need to land where teams already respond.

**The Chrome extension is a second surface, not the backend.** The extension displays review state, but the backend owns webhook validation, persistence, and reviewer mapping.

**SQLite is acceptable for the MVP only.** Production should use persistent disk guarantees or Postgres before multi-instance deployment.

## Features

- GitHub pull request webhook receiver
- Slack DM notifications and interaction endpoint
- Chrome extension overlay concept
- reviewer mapping between GitHub and Slack
- snooze/escalation timing configuration
- local health endpoint

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill in:

```env
GITHUB_WEBHOOK_SECRET=YOUR_GITHUB_WEBHOOK_SECRET
SLACK_BOT_TOKEN=YOUR_SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET=YOUR_SLACK_SIGNING_SECRET
JWT_SECRET=YOUR_JWT_SECRET
ADMIN_API_TOKEN=YOUR_ADMIN_API_TOKEN
TEAM_CHANNEL_ID=YOUR_TEAM_CHANNEL_ID
```

In production (`NODE_ENV=production`) the server refuses to start unless `JWT_SECRET`
is a strong non-default value (>=32 chars) and `ADMIN_API_TOKEN` is set. The `/admin`
endpoints require `Authorization: Bearer $ADMIN_API_TOKEN`.

Run:

```bash
pnpm dev
```

Health check:

```txt
http://localhost:4000/health
```

## Deployment

Single-instance deployment persists SQLite to a Docker volume (see `docker-compose.yml`).

Before going live:

- configure real GitHub webhook delivery
- configure Slack app scopes and signing secret
- set a strong `JWT_SECRET` and `ADMIN_API_TOKEN` (enforced at startup when `NODE_ENV=production`)
- move to Postgres only if you need to run multiple instances behind a load balancer
- run the end-to-end smoke test below

## Verification

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:webhook
```

## End-to-End Smoke Test (manual)

Requires live credentials and a public tunnel — cannot run from CI.

1. Start the API (`pnpm dev`) and expose it: `ngrok http 4000` (or cloudflared).
2. In the GitHub repo settings, add a webhook → `https://<tunnel>/github/webhook`, content type `application/json`, secret = `GITHUB_WEBHOOK_SECRET`, events = *Pull requests*.
3. In the Slack app: set the interactivity request URL to `https://<tunnel>/slack/interactions`, install the app, copy the bot token + signing secret into `.env`.
4. Register a reviewer: `POST /admin/users` with `Authorization: Bearer $ADMIN_API_TOKEN` and `{ "githubUsername": "...", "slackUserId": "..." }`. Save the returned `extensionToken`.
5. Configure the extension popup with the API URL and that token.
6. Open a PR and request the registered reviewer.
7. **Verify:** GitHub delivery returns `200`; the reviewer gets a Slack DM; the extension overlay shows the pending review; the DM buttons (ack/snooze) update state.

## Known Limits

- SQLite is single-instance only; multiple instances need Postgres.
- Slack/GitHub setup is operationally sensitive.
- The end-to-end flow still needs a live smoke test before trusting it in production.
- End-to-end webhook smoke is still required.

## Author

Built by **Sudarshan Chaudhari** — SudarshanTechLabs.
