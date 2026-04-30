FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/extension/package.json apps/extension/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 4000
CMD ["pnpm", "--filter", "@prsignal/api", "start"]
