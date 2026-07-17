# PRSignal Dependencies

This repo is intentionally dependency-light.

## Root

- `typescript`: TypeScript compiler shared by workspaces.

## API app

Runtime:
- `express`: HTTP server
- `cors`: CORS for extension/API usage
- `helmet`: basic security headers
- `dotenv`: local `.env` loading
- `zod`: environment and request validation
- `better-sqlite3`: local SQLite database
- `@slack/web-api`: Slack message API
- `jsonwebtoken`: extension token signing
- `nanoid`: IDs

Dev:
- `tsx`: run TypeScript directly in development
- `@types/*`: TypeScript typings
- `typescript`: compiler

## Chrome extension

Dev only:
- `typescript`
- `@types/chrome`

## Required external keys

You add these in `.env`:

```env
GITHUB_WEBHOOK_SECRET=
GITHUB_TOKEN=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
JWT_SECRET=
ADMIN_API_TOKEN=
```

`GITHUB_TOKEN` is optional for webhook-only operation and required for manual or scheduled repository reconciliation. Use a fine-grained, read-only token limited to the selected repositories.

## Recommended checks

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```
