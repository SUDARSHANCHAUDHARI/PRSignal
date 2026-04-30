# Prompt: Upgrade PRSignal MVP to production SaaS

Upgrade the existing PRSignal MVP.

Add:

1. GitHub App installation flow
2. Slack OAuth flow
3. Postgres support with Prisma or Drizzle
4. Team/workspace model
5. Reviewer SLA rules
6. Escalation policies
7. Team dashboard
8. AI PR summary
9. Audit logs
10. Rate limiting
11. Unit tests
12. Dockerfile and docker-compose

Keep the existing MVP working. Do not break current endpoints.

Use a clean architecture:

- apps/api
- apps/web
- apps/extension
- packages/db
- packages/github
- packages/slack
- packages/shared
