import type { RepositoryWatch } from '../types/models.js';

const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/;
const SLACK_CHANNEL_PATTERN = /^[CG][A-Z0-9]{8,}$/;

export function normalizeRepositoryFullName(value: string): string {
  const normalized = value.trim();
  if (!REPOSITORY_PATTERN.test(normalized)) {
    throw new Error('Repository must use owner/repository format');
  }
  return normalized.toLocaleLowerCase('en-US');
}

export function normalizeSlackChannelId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!SLACK_CHANNEL_PATTERN.test(normalized)) {
    throw new Error('Expected a Slack channel ID beginning with C or G');
  }
  return normalized;
}

export function matchesRepositoryWatch(watch: RepositoryWatch, repoFullName: string): boolean {
  if (!watch.enabled) return false;
  try {
    return watch.repo_full_name.toLocaleLowerCase('en-US') === normalizeRepositoryFullName(repoFullName);
  } catch {
    return false;
  }
}
