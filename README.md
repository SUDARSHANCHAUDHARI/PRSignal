# PRSignal

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220.svg)](https://pnpm.io/)
[![Release](https://img.shields.io/badge/release-POC%20internal%20demo-orange.svg)](RELEASE_MEMORY.md)

Hybrid PR review enforcement MVP: GitHub webhook receiver, Slack DM workflow, and Chrome extension overlay for reviewer reminders.

> **Status:** POC/internal demo · not production-ready until Slack/GitHub webhook setup, persistent storage, and extension/API auth are hardened

## Why This Exists

Pull request review requests are easy to miss across GitHub, Slack, and browser tabs. PRSignal explores a stricter workflow: when someone becomes a reviewer, the backend records it, Slack nudges them, and a Chrome extension can surface the pending review in-browser.

## Status

| Item | State |
|---|---|
| Release type | POC/internal demo |
| Backend | Express workspace app |
| Extension | Chrome Manifest V3 |
| Storage | SQLite MVP |
| Production | Pending hardening |

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

Release scope: internal demo only.

Before production:

- configure real GitHub webhook delivery
- configure Slack app scopes and signing secret
- replace or harden SQLite storage
- harden extension/API token lifecycle
- run webhook-to-Slack-to-extension end-to-end test

## Verification

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:webhook
```

## Known Limits

- SQLite is not ideal for multi-instance production.
- Extension tokens must be hardened before public use.
- Slack/GitHub setup is operationally sensitive.
- End-to-end webhook smoke is still required.

## Author

Built by **Sudarshan Chaudhari** — SudarshanTechLabs.
