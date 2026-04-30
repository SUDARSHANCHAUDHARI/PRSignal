# Prompt for Claude/Codex: Build PRSignal Hybrid MVP

You are building a production-quality MVP called PRSignal.

PRSignal prevents ignored pull request review requests using a hybrid system:

- GitHub webhook receiver
- Slack app notification
- Chrome extension overlay
- Backend API
- SQLite database

Do not give placeholder-only code. Every file must be runnable.

## Hard requirements

1. Use Node.js 20+, TypeScript, Express.
2. Use SQLite with better-sqlite3.
3. Use Slack Web API to send reviewer DMs.
4. Verify GitHub webhook signatures.
5. Verify Slack interaction signatures.
6. Build Chrome extension Manifest V3.
7. Extension must poll backend and show a full-page overlay for pending PR reviews.
8. User must be able to click Review now, Snooze 30m, Acknowledge, Mark done.
9. Include `.env.example`.
10. Include README with setup steps.
11. Include local testing instructions.
12. `pnpm install`, `pnpm dev`, and `pnpm build` must work.

## External keys

Load these from env:

- GITHUB_WEBHOOK_SECRET
- SLACK_BOT_TOKEN
- SLACK_SIGNING_SECRET
- JWT_SECRET
- PUBLIC_APP_URL

## Final verification

Before final answer, run:

```bash
pnpm install
pnpm typecheck
pnpm build
```

Fix all TypeScript errors before finishing.
