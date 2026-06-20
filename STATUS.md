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
