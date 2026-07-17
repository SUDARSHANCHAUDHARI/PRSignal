import { db } from '../db/client.js';

export function getLastDailyDigestDate(): string | undefined {
  const row = db.prepare(
    'SELECT digest_date FROM daily_digest_runs ORDER BY digest_date DESC LIMIT 1'
  ).get() as { digest_date: string } | undefined;
  return row?.digest_date;
}

export function recordDailyDigestSent(digestDate: string, openPrCount: number): void {
  db.prepare(
    'INSERT INTO daily_digest_runs (digest_date, open_pr_count) VALUES (?, ?) ON CONFLICT(digest_date) DO NOTHING'
  ).run(digestDate, openPrCount);
}
