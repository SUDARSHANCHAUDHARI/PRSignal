import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = config.DATABASE_URL;
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);


// Lightweight additive migrations for existing local SQLite files.
// This keeps the MVP simple while allowing new fields to be added safely.
for (const statement of [
  "ALTER TABLE review_assignments ADD COLUMN last_notified_at TEXT",
  "ALTER TABLE review_assignments ADD COLUMN last_reminded_at TEXT",
  "ALTER TABLE review_assignments ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0"
]) {
  try {
    db.exec(statement);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('duplicate column name')) throw error;
  }
}
