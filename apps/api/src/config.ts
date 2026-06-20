import { config as dotenvConfig } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load from project root .env (works for both tsx src/ and node dist/)
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

const DEFAULT_JWT_SECRET = 'change-me-dev-secret';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    PUBLIC_APP_URL: z.string().url().default('http://localhost:4000'),
    DATABASE_URL: z.string().default('./prsignal.db'),
    JWT_SECRET: z.string().min(12).default(DEFAULT_JWT_SECRET),
    ADMIN_API_TOKEN: z.string().min(16).optional(),
    CORS_ORIGINS: z.string().optional(),
    EXTENSION_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_000_000),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),
    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),
    TEAM_CHANNEL_ID: z.string().optional(),
    DEFAULT_SNOOZE_MINUTES: z.coerce.number().default(30),
    OVERLAY_POLL_SECONDS: z.coerce.number().default(30),
    ESCALATION_MINUTES: z.coerce.number().default(120),
    REMINDER_AFTER_MINUTES: z.coerce.number().default(60),
    REMINDER_WORKER_SECONDS: z.coerce.number().default(300)
  })
  .superRefine((cfg, ctx) => {
    // Production must not run with insecure defaults or an unprotected admin API.
    if (cfg.NODE_ENV !== 'production') return;
    if (cfg.JWT_SECRET === DEFAULT_JWT_SECRET || cfg.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be a strong (>=32 chars), non-default value in production'
      });
    }
    if (!cfg.ADMIN_API_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_API_TOKEN'],
        message: 'ADMIN_API_TOKEN is required in production'
      });
    }
  });

export const config = schema.parse(process.env);

// Comma-separated allowlist of browser origins. Empty = permissive (POC default).
export const corsOrigins = config.CORS_ORIGINS
  ? config.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];
