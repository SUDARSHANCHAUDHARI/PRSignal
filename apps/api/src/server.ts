import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, corsOrigins } from './config.js';
import './db/client.js';
import { adminRouter } from './routes/admin.js';
import { extensionRouter } from './routes/extension.js';
import { githubRouter } from './routes/github.js';
import { slackRouter } from './routes/slack.js';
import { startReminderWorker } from './services/reminders.js';
import { rateLimit } from './utils/rateLimit.js';

const app = express();
app.set('trust proxy', 1);

// Global rate limit (rejects before we buffer the body).
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// Capture the raw body (needed for webhook signature verification), enforce a
// size cap, and parse JSON / urlencoded without crashing on malformed input.
app.use((req: any, res, next) => {
  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;

  req.on('data', (chunk: Buffer) => {
    if (aborted) return;
    size += chunk.length;
    if (size > config.MAX_BODY_BYTES) {
      aborted = true;
      res.status(413).json({ error: 'Payload too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    const contentType = String(req.headers['content-type'] ?? '');
    try {
      if (raw.length > 0) {
        if (contentType.includes('application/json')) {
          req.body = JSON.parse(raw.toString('utf8'));
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')).entries());
        }
      }
    } catch {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    next();
  });

  req.on('error', () => {
    if (!aborted) res.status(400).json({ error: 'Request stream error' });
  });
});

// Restrict CORS to the configured allowlist when provided; permissive otherwise (POC default).
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : undefined));
app.use(helmet({ contentSecurityPolicy: false }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'prsignal-api' }));
app.use('/admin', rateLimit({ windowMs: 60_000, max: 20 }), adminRouter);
app.use('/extension', extensionRouter);
app.use('/github', githubRouter);
app.use('/slack', slackRouter);

app.listen(config.PORT, () => {
  console.log(`PRSignal API running on ${config.PUBLIC_APP_URL}`);
  startReminderWorker();
});
