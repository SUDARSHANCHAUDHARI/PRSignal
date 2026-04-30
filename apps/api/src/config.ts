import { config as dotenvConfig } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load from project root .env (works for both tsx src/ and node dist/)
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().default('./prsignal.db'),
  JWT_SECRET: z.string().min(12).default('change-me-dev-secret'),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  TEAM_CHANNEL_ID: z.string().optional(),
  DEFAULT_SNOOZE_MINUTES: z.coerce.number().default(30),
  OVERLAY_POLL_SECONDS: z.coerce.number().default(30),
  ESCALATION_MINUTES: z.coerce.number().default(120),
  REMINDER_AFTER_MINUTES: z.coerce.number().default(60),
  REMINDER_WORKER_SECONDS: z.coerce.number().default(300)
});

export const config = schema.parse(process.env);
