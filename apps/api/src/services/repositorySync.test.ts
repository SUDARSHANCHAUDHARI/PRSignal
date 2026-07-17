import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileRepositories,
  reconcileRepository,
  type RepositorySyncDependencies
} from './repositorySync.js';
import type { PullRequest, RepositoryWatch } from '../types/models.js';

const watch: RepositoryWatch = {
  id: 'watch-1',
  repo_full_name: 'acme/api',
  slack_channel_id: 'C0123456789',
  enabled: 1,
  notify_drafts: 0,
  created_at: '2026-07-17 00:00:00',
  updated_at: '2026-07-17 00:00:00',
  last_synced_at: null
};

test('repeated reconciliation is idempotent and skips drafts by configuration', async () => {
  let notificationExists = false;
  let synced = 0;
  const stored = new Map<number, PullRequest>();
  const githubPullRequests = [
    {
      repoFullName: 'acme/api',
      number: 1,
      title: 'Ready for review',
      url: 'https://github.com/acme/api/pull/1',
      authorGithub: 'octocat',
      state: 'open' as const,
      isDraft: false,
      mergedAt: null,
      requestedReviewers: ['reviewer']
    },
    {
      repoFullName: 'acme/api',
      number: 2,
      title: 'Draft work',
      url: 'https://github.com/acme/api/pull/2',
      authorGithub: 'octocat',
      state: 'open' as const,
      isDraft: true,
      mergedAt: null,
      requestedReviewers: []
    }
  ];
  const dependencies: RepositorySyncDependencies = {
    fetchOpenPullRequests: async () => githubPullRequests,
    fetchPullRequest: async () => {
      throw new Error('not expected');
    },
    upsertPullRequest: (input) => {
      const row: PullRequest = {
        id: `pr-${input.prNumber}`,
        repo_full_name: input.repoFullName,
        pr_number: input.prNumber,
        title: input.title,
        url: input.url,
        author_github: input.authorGithub,
        state: input.state ?? 'open',
        is_draft: input.isDraft ? 1 : 0,
        requested_reviewers_json: JSON.stringify(input.requestedReviewers ?? []),
        merged_at: input.mergedAt ?? null,
        created_at: '2026-07-17 00:00:00',
        updated_at: '2026-07-17 00:00:00'
      };
      stored.set(row.pr_number, row);
      return row;
    },
    listOpenPullRequests: () => [...stored.values()].filter((pr) => pr.state === 'open'),
    listNotificationStateDrift: () => [],
    markPullRequestFinal: () => undefined,
    ensureNotification: async () => {
      if (notificationExists) return { status: 'existing' as const };
      notificationExists = true;
      return { status: 'created' as const };
    },
    updateNotificationStatus: async () => ({ status: 'missing' as const }),
    markSynced: () => {
      synced += 1;
    }
  };

  const first = await reconcileRepository(watch, dependencies);
  const second = await reconcileRepository(watch, dependencies);

  assert.deepEqual(first, { found: 2, created: 1, updated: 0, skipped: 1, failed: 0 });
  assert.deepEqual(second, { found: 2, created: 0, updated: 0, skipped: 2, failed: 0 });
  assert.equal(synced, 2);
});

test('reconciliation retries a persisted PR state that Slack has not reflected', async () => {
  const mergedPullRequest: PullRequest = {
    id: 'pr-9',
    repo_full_name: 'acme/api',
    pr_number: 9,
    title: 'Already merged',
    url: 'https://github.com/acme/api/pull/9',
    author_github: 'octocat',
    state: 'merged',
    is_draft: 0,
    requested_reviewers_json: '[]',
    merged_at: '2026-07-17T02:00:00Z',
    created_at: '2026-07-17 00:00:00',
    updated_at: '2026-07-17 02:00:00'
  };
  let updateCalls = 0;
  const dependencies: RepositorySyncDependencies = {
    fetchOpenPullRequests: async () => [],
    fetchPullRequest: async () => {
      throw new Error('not expected');
    },
    upsertPullRequest: () => mergedPullRequest,
    listOpenPullRequests: () => [],
    listNotificationStateDrift: () => [mergedPullRequest],
    markPullRequestFinal: () => mergedPullRequest,
    ensureNotification: async () => ({ status: 'existing' }),
    updateNotificationStatus: async (_watch, pullRequest) => {
      updateCalls += 1;
      assert.equal(pullRequest.state, 'merged');
      return { status: 'updated' };
    },
    markSynced: () => undefined
  };

  const result = await reconcileRepository(watch, dependencies);

  assert.deepEqual(result, { found: 0, created: 0, updated: 1, skipped: 0, failed: 0 });
  assert.equal(updateCalls, 1);
});

test('batch reconciliation continues after one repository fails', async () => {
  const secondWatch = { ...watch, id: 'watch-2', repo_full_name: 'acme/web' };
  const results = await reconcileRepositories([watch, secondWatch], async (item) => {
    if (item.id === watch.id) throw new Error('rate limited');
    return { found: 1, created: 1, updated: 0, skipped: 0, failed: 0 };
  });

  assert.deepEqual(results, [
    { repository: 'acme/api', error: 'rate limited' },
    {
      repository: 'acme/web',
      result: { found: 1, created: 1, updated: 0, skipped: 0, failed: 0 }
    }
  ]);
});
