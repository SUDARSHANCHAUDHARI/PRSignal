# Status — PRSignal

**Last updated:** 2026-07-17
**Maturity:** Implementation-ready for a single instance; live GitHub/Slack validation pending

## Implemented

- Express API with payload-size protection, CORS, Helmet, and fixed-window rate limiting
- GitHub and Slack HMAC verification
- Bearer-protected `/admin` API and JWT-protected extension API
- Existing reviewer DMs, acknowledge/snooze actions, reminders, escalations, and Chrome extension flow
- SQLite with `better-sqlite3`, WAL, foreign keys, and additive startup migrations
- Persistent case-insensitive repository watchlist with per-repository Slack channels
- Persistent channel root-message timestamps and PR status
- Idempotent root-message creation across webhook redelivery and repeated reconciliation
- Webhook handling for opened, reopened, ready-for-review, converted-to-draft, merged, and closed states
- Optional native-fetch GitHub reconciliation with pagination, rate-limit handling, and per-repository failure isolation
- Manual repository synchronization through the admin API
- Retry of Slack state drift after failed channel-message updates
- Optional scheduled all-open-PR digest using a separate Slack channel

## Database

- `users`
- `pull_requests` with additive draft, reviewer, and merge metadata
- `review_assignments`
- `repository_watches`
- `channel_notifications`
- `daily_digest_runs`

Existing SQLite databases are upgraded at startup; no deletion or manual recreation is required.

## Admin endpoints

- `GET /admin/users`
- `POST /admin/users`
- `GET /admin/repositories`
- `POST /admin/repositories`
- `PATCH /admin/repositories/:id`
- `POST /admin/repositories/:id/sync`

Permanent watch deletion is intentionally omitted; disabling a watch is safer and preserves notification history.

## Automated verification

- Tests: 36 passing test cases across utility, event, watch-rule, channel-feed, GitHub API, reconciliation, and digest files
- TypeScript: strict typecheck passing for API and extension
- Build: API and extension production builds passing
- Lint: 0 errors; 10 pre-existing-style `no-explicit-any` warnings remain in older Express/reminder seams
- Diff whitespace check: passing

## Credential-gated work remaining

- Real GitHub webhook → Slack channel smoke test
- Real reconciliation against private selected repositories
- Slack private-channel membership and public-channel scope validation
- Deployment to a persistent single-instance host
- Optional Postgres/distributed-lock migration before horizontal scaling

## Documentation inconsistencies corrected

- The backend is Express, not Fastify. The previous `STATUS.md` checklist was incorrect.
- `TEAM_CHANNEL_ID` is escalation-only; it is no longer documented or used as a digest fallback.
- `AGENTS.md` references `CodexConfig/rules/web.md`, but that file is absent from this checkout. No contents were inferred.
