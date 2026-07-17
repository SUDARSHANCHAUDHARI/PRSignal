import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import type { RepositoryWatch } from '../types/models.js';
import { normalizeRepositoryFullName, normalizeSlackChannelId } from './repositoryWatchRules.js';

export class RepositoryWatchNotFoundError extends Error {
  constructor() {
    super('Repository watch not found');
    this.name = 'RepositoryWatchNotFoundError';
  }
}

export class DuplicateRepositoryWatchError extends Error {
  constructor(repoFullName: string) {
    super(`Repository ${repoFullName} is already configured`);
    this.name = 'DuplicateRepositoryWatchError';
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

export function listRepositoryWatches(): RepositoryWatch[] {
  return db.prepare('SELECT * FROM repository_watches ORDER BY repo_full_name ASC').all() as RepositoryWatch[];
}

export function listEnabledRepositoryWatches(): RepositoryWatch[] {
  return db.prepare('SELECT * FROM repository_watches WHERE enabled = 1 ORDER BY repo_full_name ASC')
    .all() as RepositoryWatch[];
}

export function getRepositoryWatchById(id: string): RepositoryWatch | undefined {
  return db.prepare('SELECT * FROM repository_watches WHERE id = ?').get(id) as RepositoryWatch | undefined;
}

export function getEnabledRepositoryWatchByFullName(repoFullName: string): RepositoryWatch | undefined {
  let normalizedRepository: string;
  try {
    normalizedRepository = normalizeRepositoryFullName(repoFullName);
  } catch {
    return undefined;
  }
  return db.prepare(`
    SELECT * FROM repository_watches
    WHERE repo_full_name = ? COLLATE NOCASE AND enabled = 1
  `).get(normalizedRepository) as RepositoryWatch | undefined;
}

export function createRepositoryWatch(input: {
  repoFullName: string;
  slackChannelId: string;
  enabled?: boolean;
  notifyDrafts?: boolean;
}): RepositoryWatch {
  const id = nanoid();
  const repoFullName = normalizeRepositoryFullName(input.repoFullName);
  const slackChannelId = normalizeSlackChannelId(input.slackChannelId);
  try {
    db.prepare(`
      INSERT INTO repository_watches (id, repo_full_name, slack_channel_id, enabled, notify_drafts)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, repoFullName, slackChannelId, Number(input.enabled ?? true), Number(input.notifyDrafts ?? false));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DuplicateRepositoryWatchError(repoFullName);
    throw error;
  }
  return getRepositoryWatchById(id) as RepositoryWatch;
}

export function updateRepositoryWatch(id: string, input: {
  repoFullName?: string;
  slackChannelId?: string;
  enabled?: boolean;
  notifyDrafts?: boolean;
}): RepositoryWatch {
  const current = getRepositoryWatchById(id);
  if (!current) throw new RepositoryWatchNotFoundError();

  const repoFullName = input.repoFullName === undefined
    ? current.repo_full_name
    : normalizeRepositoryFullName(input.repoFullName);
  const slackChannelId = input.slackChannelId === undefined
    ? current.slack_channel_id
    : normalizeSlackChannelId(input.slackChannelId);
  try {
    db.prepare(`
      UPDATE repository_watches
      SET repo_full_name = ?, slack_channel_id = ?, enabled = ?, notify_drafts = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      repoFullName,
      slackChannelId,
      Number(input.enabled ?? Boolean(current.enabled)),
      Number(input.notifyDrafts ?? Boolean(current.notify_drafts)),
      id
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DuplicateRepositoryWatchError(repoFullName);
    throw error;
  }
  return getRepositoryWatchById(id) as RepositoryWatch;
}

export function markRepositoryWatchSynced(id: string): void {
  db.prepare(`
    UPDATE repository_watches
    SET last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}
