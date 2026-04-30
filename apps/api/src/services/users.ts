import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { User } from '../types/models.js';
import { signExtensionToken } from '../utils/auth.js';

export function upsertUserByGithub(input: { githubUsername: string; slackUserId?: string; displayName?: string }): User {
  const existing = db.prepare('SELECT * FROM users WHERE github_username = ?').get(input.githubUsername) as User | undefined;
  if (existing) {
    db.prepare('UPDATE users SET slack_user_id = COALESCE(?, slack_user_id), display_name = COALESCE(?, display_name) WHERE id = ?')
      .run(input.slackUserId ?? null, input.displayName ?? null, existing.id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id) as User;
  }

  const id = nanoid();
  const extensionToken = signExtensionToken(id);
  db.prepare('INSERT INTO users (id, github_username, slack_user_id, display_name, extension_token) VALUES (?, ?, ?, ?, ?)')
    .run(id, input.githubUsername, input.slackUserId ?? null, input.displayName ?? null, extensionToken);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
}

export function getUserByGithub(githubUsername: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE github_username = ?').get(githubUsername) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function listUsers(): User[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[];
}
