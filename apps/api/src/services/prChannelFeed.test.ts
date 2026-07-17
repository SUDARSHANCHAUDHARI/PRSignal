import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrChannelFeed, type PrChannelFeedDependencies } from './prChannelFeed.js';
import type { ChannelNotification, RepositoryWatch } from '../types/models.js';

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

const pullRequest = {
  prId: 'pr-1',
  repoFullName: 'acme/api',
  prNumber: 42,
  title: 'Fix offline playback',
  url: 'https://github.com/acme/api/pull/42',
  authorGithub: 'octocat',
  requestedReviewers: ['reviewer-one'],
  state: 'open' as const,
  isDraft: false
};

function createDependencies(postSucceeds = true) {
  let notification: ChannelNotification | undefined;
  let postCount = 0;
  let insertCount = 0;
  const dependencies: PrChannelFeedDependencies = {
    getNotification: () => notification,
    insertNotification: (input) => {
      insertCount += 1;
      notification = {
        id: 'notification-1',
        pr_id: input.prId,
        repository_watch_id: input.repositoryWatchId,
        slack_channel_id: input.slackChannelId,
        slack_root_ts: input.slackRootTs,
        last_known_pr_status: input.status,
        posted_at: '2026-07-17 00:00:00',
        updated_at: '2026-07-17 00:00:00'
      };
      return notification;
    },
    updateNotificationStatus: (_id, status) => {
      if (notification) notification = { ...notification, last_known_pr_status: status };
    },
    postNotification: async () => {
      postCount += 1;
      await Promise.resolve();
      return postSucceeds ? { ok: true, ts: '171234.0001' } : { ok: false };
    },
    updateNotification: async () => true
  };
  return { dependencies, counts: () => ({ postCount, insertCount }) };
}

test('duplicate webhook or sync processing creates one Slack root message', async () => {
  const { dependencies, counts } = createDependencies();
  const feed = createPrChannelFeed(dependencies);
  const results = await Promise.all([
    feed.ensureNotification(watch, pullRequest),
    feed.ensureNotification(watch, pullRequest)
  ]);

  assert.equal(counts().postCount, 1);
  assert.equal(counts().insertCount, 1);
  assert.deepEqual(results.map((result) => result.status).sort(), ['created', 'existing']);
});

test('Slack failure does not record a successful channel notification', async () => {
  const { dependencies, counts } = createDependencies(false);
  const feed = createPrChannelFeed(dependencies);
  const result = await feed.ensureNotification(watch, pullRequest);

  assert.equal(result.status, 'failed');
  assert.deepEqual(counts(), { postCount: 1, insertCount: 0 });
});
