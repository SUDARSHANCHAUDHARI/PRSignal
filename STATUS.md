# Status — PRSignal

**Last updated:** 2026-06-21
**Maturity:** 🟢 `status-production-ready` (single-instance)

## What's done

- GitHub webhook receiver with HMAC-SHA256 signature verification (timing-safe)
- Slack DM workflow with signing-secret verification (timestamp window)
- Chrome extension (Manifest V3) overlay surface
- SQLite persistence with `better-sqlite3`, WAL journal, foreign keys
- Lightweight additive migrations on startup
- Zod-validated config that **fails closed in production** when `JWT_SECRET` is default/short or `ADMIN_API_TOKEN` missing
- Bearer-token auth on `/admin` and `/extension` routes
- Express rate limiting (global + tighter on `/admin`)
- Helmet security headers
- Raw-body capture for sig verification, with payload-size cap (default 1 MB)
- Reminder worker with snooze / escalation timing
- Extracted `extractRequestedReviewers()` pure helper for the webhook reviewer-dedup logic
- 13 tests across 3 suites (utils/crypto, utils/auth, services/githubEvents)
- Docker + `docker-compose.yml` for single-instance deploy
- Build, lint, typecheck, tests all green

## What's left

- **Live end-to-end smoke test** against a real GitHub webhook + Slack workspace — requires GitHub webhook secret + Slack bot token (creds-gated, owner action)
- **Postgres migration** if you ever need multiple API instances behind a load balancer (current SQLite is single-instance only — documented as a known limit)
- Deployment to a container host (Railway / Fly / Render / VPS) — code and Compose are ready

## Quality gates

| Gate | Status |
|---|---|
| Build | ✅ |
| Lint | ✅ 0 errors |
| Typecheck (strict) | ✅ |
| Tests | ✅ 13 / 3 suites |

## Deployment

Not yet deployed. `docker-compose.yml` is ready for single-instance hosts.

## File-by-file checklist

### API (`apps/api/src/`)
- [x] `server.ts` — Fastify wiring (rate limit, raw-body capture, CORS allowlist, helmet, route mount, reminder worker start, graceful shutdown)
- [x] `config.ts` — Zod-validated env with production fail-closed guards (`JWT_SECRET` ≥ 32 chars, `ADMIN_API_TOKEN` required)

### Routes
- [x] `routes/github.ts` — `/github/webhook` with HMAC verification + reviewer-dedup via `extractRequestedReviewers()`
- [x] `routes/slack.ts` — Slack interactivity endpoint with timestamp + signature window
- [x] `routes/extension.ts` — bearer-token-guarded extension API
- [x] `routes/admin.ts` — bearer-token-guarded admin API (with tighter rate limit)

### Services
- [x] `services/githubEvents.ts` — pure reviewer-dedup helper (extracted)
- [x] `services/prs.ts` — PR + assignment CRUD
- [x] `services/slack.ts` — DM dispatch
- [x] `services/reminders.ts` — reminder worker (snooze / escalation timing)
- [x] `services/users.ts` — user management
- [x] `services/messageTemplates.ts` — DM templates

### Utils
- [x] `utils/crypto.ts` — `verifyGitHubSignature()` + `verifySlackSignature()` (timing-safe)
- [x] `utils/auth.ts` — JWT issue/verify
- [x] `utils/rateLimit.ts` — sliding-window rate limiter

### DB
- [x] `db/client.ts` — `better-sqlite3` with WAL + FK + additive migrations
- [x] `db/schema.sql` — `users`, `pull_requests`, `review_assignments`, `dms`

### Scripts
- [x] `scripts/sendTestWebhook.ts` — signed test webhook generator (`pnpm test:webhook`)

### Extension (`apps/extension/`)
- [x] Chrome MV3 popup + content script (separate workspace)

### Tests
- [x] `utils/crypto.test.ts` — 6 tests (GitHub sig accept/reject/missing; Slack accept/expired/missing)
- [x] `utils/auth.test.ts` — 2 tests
- [x] `services/githubEvents.test.ts` — 5 tests (reviewer dedup: single, array, cross-source, blank, empty)

### Quality + scaffolding
- [x] Build (`tsc -p tsconfig.json`) green
- [x] Lint green
- [x] Typecheck green
- [x] 13 tests pass
- [x] Docker + `docker-compose.yml` ready

### Not done
- [ ] Live end-to-end smoke against real GitHub webhook + Slack workspace (needs GitHub webhook secret + Slack bot token)
- [ ] Migrate SQLite → Postgres if multi-instance deployment is needed

## Categorized work remaining

| Item | Effort | Bucket | Blocker | Priority |
|------|--------|--------|---------|----------|
| Migrate SQLite → Postgres | ~1d | 🟦 Pure code | (optional — only if multi-instance) | P3 |
| Live e2e smoke test | ~1h | 🔑 Needs creds | GitHub webhook secret + Slack bot token + container host | P1 |
| Deploy to container host | ~1h | 🔑 Needs creds | hosting access (Railway/Fly/your VPS) | P1 |

## Release plan

1. **Live smoke (creds-gated):**
   - Generate GitHub webhook secret: `openssl rand -hex 32`
   - Create Slack app at https://api.slack.com/apps with `chat:write` scope, install to workspace, copy bot token + signing secret
   - Generate `JWT_SECRET` (≥32 chars) + `ADMIN_API_TOKEN` (≥16 chars)
   - Fill `.env` from `.env.example`
   - Run `pnpm dev`, expose with `ngrok http 4000`, register the webhook + Slack interactivity URL
   - Open a test PR, request a reviewer who's registered via `/admin/users` → verify Slack DM lands
2. **Deploy:**
   - On Railway/Fly/your VPS: build the Docker image from `Dockerfile`, mount a volume for the SQLite file, set the env vars above
   - Confirm `/health` returns `{ok: true}`
3. **Tag release:** `gh release create v1.0.0 --title "PRSignal v1.0.0 — single-instance production-ready"`

### Deploy prerequisites
- `GITHUB_WEBHOOK_SECRET` — generated locally
- `SLACK_BOT_TOKEN` — from Slack app (`xoxb-…`)
- `SLACK_SIGNING_SECRET` — from Slack app Basic Information page
- `JWT_SECRET` — ≥32 chars (`openssl rand -hex 32`)
- `ADMIN_API_TOKEN` — ≥16 chars
- `PUBLIC_APP_URL` — your live URL
- `TEAM_CHANNEL_ID` — Slack channel ID for escalations
- Container host with persistent disk (for SQLite WAL file)
