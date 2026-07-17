import { githubToken } from '../config.js';
import type { RepositoryWatch } from '../types/models.js';
import { listPullRequestsWithNotificationStateDrift } from './channelNotifications.js';
import { fetchOpenPullRequestsFromGitHub, fetchPullRequestFromGitHub } from './githubApi.js';
import { prChannelFeed } from './prChannelFeedRuntime.js';
import {
  listOpenPullRequestsForRepository,
  markPullRequestFinal,
  upsertPullRequest
} from './prs.js';
import {
  reconcileRepositories,
  reconcileRepository,
  type RepositorySyncBatchItem,
  type RepositorySyncResult
} from './repositorySync.js';
import {
  getRepositoryWatchById,
  listEnabledRepositoryWatches,
  markRepositoryWatchSynced,
  RepositoryWatchNotFoundError
} from './repositoryWatches.js';

export class RepositorySyncConfigurationError extends Error {
  constructor() {
    super('GITHUB_TOKEN is required for repository reconciliation');
    this.name = 'RepositorySyncConfigurationError';
  }
}

export class RepositorySyncDisabledError extends Error {
  constructor() {
    super('Repository watch is disabled');
    this.name = 'RepositorySyncDisabledError';
  }
}

export function assertRepositorySyncConfigured(): string {
  if (!githubToken) throw new RepositorySyncConfigurationError();
  return githubToken;
}

export async function syncRepositoryWatch(watch: RepositoryWatch): Promise<RepositorySyncResult> {
  if (!watch.enabled) throw new RepositorySyncDisabledError();
  const token = assertRepositorySyncConfigured();
  return reconcileRepository(watch, {
    fetchOpenPullRequests: (repoFullName) => fetchOpenPullRequestsFromGitHub(repoFullName, token),
    fetchPullRequest: (repoFullName, prNumber) => fetchPullRequestFromGitHub(repoFullName, prNumber, token),
    upsertPullRequest,
    listOpenPullRequests: listOpenPullRequestsForRepository,
    listNotificationStateDrift: listPullRequestsWithNotificationStateDrift,
    markPullRequestFinal,
    ensureNotification: prChannelFeed.ensureNotification,
    updateNotificationStatus: prChannelFeed.updateNotificationStatus,
    markSynced: markRepositoryWatchSynced
  });
}

export async function syncRepositoryWatchById(id: string): Promise<RepositorySyncResult> {
  const watch = getRepositoryWatchById(id);
  if (!watch) throw new RepositoryWatchNotFoundError();
  return syncRepositoryWatch(watch);
}

export async function syncAllEnabledRepositoryWatches(): Promise<RepositorySyncBatchItem[]> {
  return reconcileRepositories(listEnabledRepositoryWatches(), syncRepositoryWatch);
}
