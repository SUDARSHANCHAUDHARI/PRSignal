# PRSignal

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220.svg)](https://pnpm.io/)

PRSignal is a single-instance pull-request notification service built with Express, TypeScript, SQLite, GitHub webhooks, Slack Web API, and a Chrome extension. It provides reviewer DMs and reminders, plus a persistent repository watchlist that routes each repository's pull requests to its configured Slack channel.

> **Status:** Implementation and automated verification are complete for the watchlist/channel-feed feature. Live GitHub-to-Slack validation still requires real credentials and a reachable deployment.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Setup](#setup)
- [Slack configuration](#slack-configuration)
- [GitHub configuration](#github-configuration)
- [Repository admin API](#repository-admin-api)
- [Webhook behavior](#webhook-behavior)
- [Reconciliation behavior](#reconciliation-behavior)
- [Daily digest](#daily-digest)
- [Deployment](#deployment)
- [Verification](#verification)
- [Manual end-to-end smoke test](#manual-end-to-end-smoke-test)
- [Known limitations](#known-limitations)
- [About](#about)

## Architecture

PRSignal uses a hybrid event model:

- **GitHub webhooks** remain the primary source for immediate `pull_request` events.
- **Repository reconciliation** is optional and periodically fetches all open PRs to recover existing PRs, downtime gaps, failed deliveries, and state drift.
- **SQLite** stores reviewer assignments, repository watches, PR state, Slack root-message timestamps, and successful daily digest runs.
- **One Slack WebClient** handles reviewer DMs, escalations, per-repository channel messages, and daily digests.

The channel feed does not replace reviewer DMs, Slack interactions, reminders, escalation behavior, or the extension.

## Features

- HMAC-verified GitHub pull-request webhooks
- Persistent repository-to-Slack-channel watchlist
- Immediate channel messages for opened, reopened, and ready-for-review PRs
- Root-message updates for draft, reopened, merged, and closed state changes
- Optional paginated GitHub REST reconciliation worker
- Authenticated admin API for listing, creating, editing, and synchronizing watches
- Reviewer Slack DMs with acknowledge, snooze, and review actions
- Reminder worker and `TEAM_CHANNEL_ID` escalation channel
- Chrome Manifest V3 review overlay
- Optional scheduled all-open-PR digest to a separate digest channel

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

Set the required backend secrets:

```env
GITHUB_WEBHOOK_SECRET=generate-a-random-webhook-secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-slack-signing-secret
JWT_SECRET=at-least-32-random-characters-in-production
ADMIN_API_TOKEN=at-least-16-random-characters
```

Optional reconciliation configuration:

```env
GITHUB_TOKEN=your-fine-grained-read-only-token
PR_SYNC_ENABLED=true
PR_SYNC_INTERVAL_SECONDS=300
```

`GITHUB_TOKEN` is not needed for webhook-only operation. Manual and background reconciliation return or log a clear configuration error when it is absent. The earlier `GITHUB_API_TOKEN` name remains accepted as a compatibility alias but new installations should use `GITHUB_TOKEN`.

Start the API:

```bash
pnpm dev
```

Health check: `GET http://localhost:4000/health`.

## Slack configuration

Create a Slack app, install it to the workspace, and configure:

- Bot scope `chat:write` for DMs and channels the bot has joined.
- Interactivity request URL: `https://YOUR_HOST/slack/interactions`.
- Invite the bot to every private channel configured in a repository watch.
- For public channels, invite the bot or additionally grant `chat:write.public` if it must post without joining.

`TEAM_CHANNEL_ID` is used only for overdue-review escalations. Repository feed channels are stored per watch. `DAILY_DIGEST_CHANNEL_ID` is separate and has no fallback to `TEAM_CHANNEL_ID`.

## GitHub configuration

### Webhook

For every watched repository, configure a webhook:

- Payload URL: `https://YOUR_HOST/github/webhook`
- Content type: `application/json`
- Secret: the exact `GITHUB_WEBHOOK_SECRET`
- Events: **Pull requests**

The webhook signature is verified before any payload is processed.

### Reconciliation token

Use a fine-grained token limited to the selected repositories with:

- Metadata: read
- Pull requests: read

The REST client uses GitHub API version `2022-11-28`, a `PRSignal` user agent, native Node 20 `fetch`, and pagination. Tokens are never returned from the admin API or written to logs.

## Repository admin API

All `/admin` routes require:

```text
Authorization: Bearer ADMIN_API_TOKEN
```

### List watches

```http
GET /admin/repositories
```

### Create a watch

```http
POST /admin/repositories
Content-Type: application/json

{
  "repoFullName": "owner/repository",
  "slackChannelId": "C0123456789",
  "enabled": true,
  "notifyDrafts": false,
  "syncNow": true
}
```

Repository names are trimmed, validated, stored lowercase, and matched case-insensitively. GitHub URLs are rejected. Slack channel IDs must begin with `C` or `G`. Only one watch can exist for a repository; disable and update an existing watch rather than creating a duplicate.

### Update or disable a watch

```http
PATCH /admin/repositories/:id
Content-Type: application/json

{
  "enabled": false,
  "notifyDrafts": true,
  "slackChannelId": "G0123456789"
}
```

### Synchronize one watch

```http
POST /admin/repositories/:id/sync
```

Successful responses contain accurate counts:

```json
{
  "found": 4,
  "created": 2,
  "updated": 1,
  "skipped": 1,
  "failed": 0
}
```

## Webhook behavior

- `opened`: creates one root channel message unless a draft is excluded.
- `reopened`: restores open state and creates or updates the root message.
- `ready_for_review`: creates a message for a previously skipped draft or updates an existing draft message.
- `converted_to_draft`: stores draft state and updates an existing root message.
- `closed`: records `merged` or `closed`, completes reviewer assignments, and updates the existing root message.
- `review_requested`: preserves the current reviewer-DM workflow and does not create a second root message.
- `edited`, `synchronize`, and other actions update stored metadata without noisy channel posts.

Webhook redelivery and reconciliation share the same idempotent channel-feed service. A database unique constraint and a single-process keyed lock prevent duplicate root messages in the supported single-instance deployment.

## Reconciliation behavior

When enabled, the worker runs no more often than every 60 seconds and defaults to 300 seconds. For each enabled watch it:

1. Fetches every open PR using GitHub pagination.
2. Upserts current metadata and reviewers.
3. Respects `notify_drafts`.
4. Creates a root message only when none exists.
5. Checks stored-open PRs missing from GitHub's open list to distinguish merged from closed.
6. Retries Slack message state that differs from persisted GitHub state.
7. Updates `last_synced_at` after a successful repository fetch.

A failure in one repository is logged without stopping synchronization of the remaining watches. Rate limits produce safe errors without logging response bodies or credentials.

## Daily digest

The earlier daily digest remains opt-in. It posts all open PRs at a configured local time, grouped as needs your review, ready to merge, waiting for review, or draft/blocked. It requires its own `DAILY_DIGEST_CHANNEL_ID`; the escalation channel is never reused implicitly.

See [.env.example](.env.example) for all digest settings.

## Deployment

The provided Docker Compose configuration mounts SQLite at `/app/data/prsignal.db`. Run a single API instance; SQLite and the in-process idempotency lock are not designed for horizontally scaled workers. Move to Postgres and distributed locking before multi-instance deployment.

Never commit `.env`, tokens, signing secrets, SQLite files, or generated `dist/` output.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

Run `pnpm test:webhook` only while the local API is running with the required environment variables configured.

## Manual end-to-end smoke test

This check is credential-gated and has not been run automatically:

1. Deploy or expose the API through a trusted HTTPS tunnel.
2. Configure the Slack bot, interaction URL, scopes, and channel membership.
3. Configure the GitHub webhook and optional fine-grained token.
4. Create a repository watch with `syncNow: true`; confirm existing open PRs create one message each.
5. Run the same sync again; confirm no duplicate root messages appear.
6. Open a PR; confirm a channel root message appears and requested reviewers still receive DMs.
7. Convert the PR to draft, mark it ready, then merge or close it; confirm the original Slack message changes state.
8. Stop PRSignal, create another PR, restart it, and run reconciliation; confirm the missed PR appears.
9. Verify acknowledge and snooze Slack actions plus the Chrome extension still work.

## Known limitations

- Live GitHub/Slack end-to-end validation remains pending.
- A GitHub webhook must be configured separately for each repository unless an organization/GitHub App installation provides broader delivery.
- Existing Slack conversations stay in their original channel if a watch's channel is later changed; new PRs use the new channel.
- Single-instance SQLite and in-memory locking are not suitable for horizontal scaling.
- Slack delivery and database persistence cannot be one atomic transaction; an abrupt process crash in the narrow interval after Slack accepts a message but before SQLite records it can require manual cleanup.

---

## About

I'm Sudarshan Chaudhari, a Senior Quality Engineer, Test Automation specialist, and AI systems builder based in Bangkok, Thailand.

I have 13+ years of experience in software quality engineering, working across SaaS, fintech, gaming, web, mobile, cloud, and digital signage platforms. My background combines hands-on test automation with QA leadership, test strategy, CI/CD, release quality, production investigation, and cross-platform validation.

Alongside my professional QA career, I run [SudarshanTechLabs](https://sudarshantechlabs.com/), my independent engineering and product lab where I design, build, test, and ship software across Android, web, AI, cybersecurity, developer tooling, and cross-platform applications.

### What I work on

- ⚙️ **Quality Engineering & Test Automation** — Playwright, Selenium, Cypress, Appium, API testing, automation frameworks, end-to-end testing, CI/CD, release gates, GitHub Actions, risk-based testing, and production validation
- 🤖 **AI Systems & Automation** — AI agents, multi-agent orchestration, MCP servers, AI-assisted QA, prompt tooling, developer workflows, automation systems, and Claude Code plugins
- 📱 **Mobile & Cross-Platform Applications** — Android applications built with Kotlin and Jetpack Compose, Google Play releases, automated build and publishing pipelines, and cross-platform development spanning iOS, web, Windows, and macOS
- 🌐 **Web Applications & Platforms** — Full-stack applications using Next.js, TypeScript, Firebase, Cloudflare, REST APIs, and modern web infrastructure
- 🛠️ **Developer Tooling & CLI Engineering** — Rust, Python, TypeScript, CLI utilities, multi-repository tooling, build automation, release tooling, and engineering productivity systems
- 🛡️ **Cybersecurity & Observability** — Threat detection, log analysis, security auditing, vulnerability assessment, monitoring, and security-focused developer tools
- 📺 **Digital Signage & Device Platforms** — Content validation, playback testing, device compatibility, production investigation, monitoring, and QA across diverse hardware and operating-system environments

My work sits at the intersection of quality engineering, automation, AI, and software development. I approach products with a QA mindset from the beginning: understanding failure modes, designing for testability, automating repetitive work, and building release confidence into the engineering process.

Through SudarshanTechLabs, I also build products and tools from idea to production, covering architecture, development, testing, CI/CD, release automation, monitoring, and ongoing maintenance.

🌐 [sudarshantechlabs.com](https://sudarshantechlabs.com/) · 💼 [LinkedIn](https://linkedin.com/in/sudarshan-chaudhari) · 🐙 [GitHub](https://github.com/SUDARSHANCHAUDHARI) · ✉️ [sunny.sudarshan@gmail.com](mailto:sunny.sudarshan@gmail.com)
