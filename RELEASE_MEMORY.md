# Release Memory: PRSignal
_Last updated: 2026-06-04_

## Current Status

PRSignal is a hybrid MVP for GitHub PR review events, Slack DMs, and a Chrome extension overlay.

## Release Target

Internal/team production after webhook, Slack, storage, and extension security are hardened.

## Success Criteria

- Build/typecheck/lint pass.
- GitHub webhook receives reviewer events.
- Slack DM and button interactions work.
- Chrome extension overlay receives and displays review state.
- Persistence is production-safe: persistent disk or Postgres.
- Extension/API auth is hardened.

## Ordered Plan

1. Install dependencies.
2. Run `pnpm build`, `pnpm typecheck`, `pnpm lint`, and webhook test.
3. Configure Slack app and GitHub webhook.
4. Replace or harden SQLite storage for deployment.
5. Add extension/API token safety.
6. Deploy backend to Railway/Fly/VPS.
7. Run webhook-to-Slack-to-extension end-to-end test.

## Risks

- Slack and GitHub webhook setup is operationally sensitive.
- SQLite is not ideal for multi-instance production.
- Extension tokens must not be guessable or leak.

## First Task

Run package checks and webhook test locally.

## Latest Prep Notes

- Updated `.env.example` and README setup/webhook examples to use `YOUR_*` placeholders for Slack, GitHub, JWT, domain, tunnel, and team-channel values.
- Current release type remains POC/internal demo until dependencies, webhook test, Slack setup, storage hardening, and extension/API auth are verified.
- Polished README with POC/internal status, technical decisions, setup, verification, known limits, and production blockers.
