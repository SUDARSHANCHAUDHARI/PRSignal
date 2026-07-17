import type { PullRequest, RepositoryWatch } from '../types/models.js';
import type { GitHubPullRequest } from './githubApi.js';
import type {
  EnsureChannelNotificationResult,
  PrChannelInput,
  UpdateChannelNotificationResult
} from './prChannelFeed.js';
import type { PullRequestChannelStatus } from './githubEvents.js';

export type RepositorySyncResult = {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type RepositorySyncBatchItem = {
  repository: string;
  result?: RepositorySyncResult;
  error?: string;
};

export type PullRequestUpsertInput = {
  repoFullName: string;
  prNumber: number;
  title: string;
  url: string;
  authorGithub: string;
  state?: string;
  isDraft?: boolean;
  requestedReviewers?: string[];
  mergedAt?: string | null;
};

export type RepositorySyncDependencies = {
  fetchOpenPullRequests(repoFullName: string): Promise<GitHubPullRequest[]>;
  fetchPullRequest(repoFullName: string, prNumber: number): Promise<GitHubPullRequest>;
  upsertPullRequest(input: PullRequestUpsertInput): PullRequest;
  listOpenPullRequests(repoFullName: string): PullRequest[];
  listNotificationStateDrift(repositoryWatchId: string): PullRequest[];
  markPullRequestFinal(
    repoFullName: string,
    prNumber: number,
    status: 'closed' | 'merged',
    mergedAt: string | null
  ): PullRequest | undefined;
  ensureNotification(watch: RepositoryWatch, pullRequest: PrChannelInput): Promise<EnsureChannelNotificationResult>;
  updateNotificationStatus(watch: RepositoryWatch, pullRequest: PrChannelInput): Promise<UpdateChannelNotificationResult>;
  markSynced(repositoryWatchId: string): void;
};

function toChannelInput(row: PullRequest, pullRequest: GitHubPullRequest, state?: PullRequestChannelStatus): PrChannelInput {
  return {
    prId: row.id,
    repoFullName: row.repo_full_name,
    prNumber: row.pr_number,
    title: row.title,
    url: row.url,
    authorGithub: row.author_github,
    requestedReviewers: pullRequest.requestedReviewers,
    state: state ?? (pullRequest.isDraft ? 'draft' : 'open'),
    isDraft: pullRequest.isDraft
  };
}

function storedPullRequestToChannelInput(row: PullRequest): PrChannelInput {
  let requestedReviewers: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.requested_reviewers_json);
    if (Array.isArray(parsed)) {
      requestedReviewers = parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    requestedReviewers = [];
  }
  const state: PullRequestChannelStatus = row.state === 'open'
    ? row.is_draft ? 'draft' : 'open'
    : row.state === 'merged' ? 'merged' : 'closed';
  return {
    prId: row.id,
    repoFullName: row.repo_full_name,
    prNumber: row.pr_number,
    title: row.title,
    url: row.url,
    authorGithub: row.author_github,
    requestedReviewers,
    state,
    isDraft: Boolean(row.is_draft)
  };
}

export async function reconcileRepository(
  watch: RepositoryWatch,
  dependencies: RepositorySyncDependencies
): Promise<RepositorySyncResult> {
  const result: RepositorySyncResult = { found: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  const previouslyOpen = dependencies.listOpenPullRequests(watch.repo_full_name);
  const attemptedNotificationUpdates = new Set<string>();
  const openPullRequests = await dependencies.fetchOpenPullRequests(watch.repo_full_name);
  result.found = openPullRequests.length;
  const openNumbers = new Set(openPullRequests.map((pullRequest) => pullRequest.number));

  for (const pullRequest of openPullRequests) {
    try {
      const row = dependencies.upsertPullRequest({
        repoFullName: pullRequest.repoFullName,
        prNumber: pullRequest.number,
        title: pullRequest.title,
        url: pullRequest.url,
        authorGithub: pullRequest.authorGithub,
        state: 'open',
        isDraft: pullRequest.isDraft,
        requestedReviewers: pullRequest.requestedReviewers,
        mergedAt: null
      });
      if (pullRequest.isDraft && !watch.notify_drafts) {
        result.skipped += 1;
        continue;
      }

      const notification = await dependencies.ensureNotification(watch, toChannelInput(row, pullRequest));
      if (notification.status === 'created') result.created += 1;
      else if (notification.status === 'failed') result.failed += 1;
      else result.skipped += 1;
    } catch {
      result.failed += 1;
    }
  }

  for (const stored of previouslyOpen) {
    if (openNumbers.has(stored.pr_number)) continue;
    try {
      const current = await dependencies.fetchPullRequest(watch.repo_full_name, stored.pr_number);
      if (current.state === 'open') continue;

      const status = current.state as 'closed' | 'merged';
      const finalized = dependencies.markPullRequestFinal(
        watch.repo_full_name,
        stored.pr_number,
        status,
        current.mergedAt
      );
      if (!finalized) {
        result.skipped += 1;
        continue;
      }
      attemptedNotificationUpdates.add(finalized.id);
      const notification = await dependencies.updateNotificationStatus(
        watch,
        toChannelInput(finalized, current, status)
      );
      if (notification.status === 'updated') result.updated += 1;
      else if (notification.status === 'failed') result.failed += 1;
      else result.skipped += 1;
    } catch {
      result.failed += 1;
    }
  }

  const notificationStateDrift = dependencies.listNotificationStateDrift(watch.id);
  for (const stored of notificationStateDrift) {
    if (attemptedNotificationUpdates.has(stored.id)) continue;
    try {
      const notification = await dependencies.updateNotificationStatus(
        watch,
        storedPullRequestToChannelInput(stored)
      );
      if (notification.status === 'updated') result.updated += 1;
      else if (notification.status === 'failed') result.failed += 1;
      else result.skipped += 1;
    } catch {
      result.failed += 1;
    }
  }

  dependencies.markSynced(watch.id);
  return result;
}

export async function reconcileRepositories(
  watches: RepositoryWatch[],
  syncOne: (watch: RepositoryWatch) => Promise<RepositorySyncResult>
): Promise<RepositorySyncBatchItem[]> {
  const results: RepositorySyncBatchItem[] = [];
  for (const watch of watches) {
    try {
      results.push({ repository: watch.repo_full_name, result: await syncOne(watch) });
    } catch (error) {
      results.push({
        repository: watch.repo_full_name,
        error: error instanceof Error ? error.message : 'Repository synchronization failed'
      });
    }
  }
  return results;
}
