import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import './db/client.js';
import { adminRouter } from './routes/admin.js';
import { extensionRouter } from './routes/extension.js';
import { githubRouter } from './routes/github.js';
import { slackRouter } from './routes/slack.js';
import { startReminderWorker } from './services/reminders.js';

const app = express();

app.use((req: any, _res, next) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    const contentType = req.headers['content-type'] ?? '';
    if (raw.length > 0) {
      if (String(contentType).includes('application/json')) req.body = JSON.parse(raw.toString('utf8'));
      else if (String(contentType).includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(raw.toString('utf8'));
        req.body = Object.fromEntries(params.entries());
      }
    }
    next();
  });
});

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'prsignal-api' }));
app.use('/admin', adminRouter);
app.use('/extension', extensionRouter);
app.use('/github', githubRouter);
app.use('/slack', slackRouter);

app.listen(config.PORT, () => {
  console.log(`PRSignal API running on ${config.PUBLIC_APP_URL}`);
  startReminderWorker();
});
