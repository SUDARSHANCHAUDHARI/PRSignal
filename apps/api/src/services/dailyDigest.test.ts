import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizePullRequests,
  formatDailyDigest,
  runDailyDigestIfDue,
  shouldRunDailyDigest,
  type DigestPullRequest
} from './dailyDigest.js';

const basePullRequest: DigestPullRequest = {
  repository: 'acme/api',
  number: 42,
  title: 'Ship the daily digest',
  url: 'https://github.com/acme/api/pull/42',
  author: 'octocat',
  isDraft: false,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewDecision: 'APPROVED',
  requestedReviewers: [],
  updatedAt: '2026-07-17T00:00:00Z'
};

test('shouldRunDailyDigest waits for the configured local time and runs once per local day', () => {
  const beforeNineInBangkok = new Date('2026-07-17T01:59:00Z');
  const nineInBangkok = new Date('2026-07-17T02:00:00Z');

  assert.deepEqual(
    shouldRunDailyDigest(beforeNineInBangkok, 'Asia/Bangkok', '09:00', undefined),
    { shouldRun: false, localDate: '2026-07-17' }
  );
  assert.deepEqual(
    shouldRunDailyDigest(nineInBangkok, 'Asia/Bangkok', '09:00', undefined),
    { shouldRun: true, localDate: '2026-07-17' }
  );
  assert.deepEqual(
    shouldRunDailyDigest(nineInBangkok, 'Asia/Bangkok', '09:00', '2026-07-17'),
    { shouldRun: false, localDate: '2026-07-17' }
  );
});

test('categorizePullRequests gives every open PR one actionable category', () => {
  const needsMyReview = {
    ...basePullRequest,
    number: 1,
    reviewDecision: 'REVIEW_REQUIRED' as const,
    requestedReviewers: ['SudarshanChaudhari']
  };
  const readyToMerge = { ...basePullRequest, number: 2 };
  const waitingForReview = {
    ...basePullRequest,
    number: 3,
    reviewDecision: 'REVIEW_REQUIRED' as const,
    requestedReviewers: ['another-reviewer']
  };
  const draft = { ...basePullRequest, number: 4, isDraft: true };
  const blocked = {
    ...basePullRequest,
    number: 5,
    mergeable: 'CONFLICTING' as const,
    mergeStateStatus: 'DIRTY'
  };

  const result = categorizePullRequests(
    [needsMyReview, readyToMerge, waitingForReview, draft, blocked],
    'sudarshanchaudhari'
  );

  assert.deepEqual(result.needsMyReview.map((pr) => pr.number), [1]);
  assert.deepEqual(result.readyToMerge.map((pr) => pr.number), [2]);
  assert.deepEqual(result.waitingForReview.map((pr) => pr.number), [3]);
  assert.deepEqual(result.draftOrBlocked.map((pr) => pr.number), [4, 5]);
});

test('formatDailyDigest includes all categories and an explicit zero-count summary', () => {
  const digest = formatDailyDigest([basePullRequest], 'sudarshanchaudhari', '2026-07-17');

  assert.match(digest.fallbackText, /1 open PR/);
  assert.match(digest.fallbackText, /0 need your review/);
  assert.match(digest.fallbackText, /1 ready to merge/);
  assert.ok(digest.sections.some((section) => section.includes('*Ready to merge (1)*')));
  assert.ok(digest.sections.some((section) => section.includes('<https://github.com/acme/api/pull/42|acme/api #42>')));
});

test('runDailyDigestIfDue records the day only after Slack accepts the digest', async () => {
  const recorded: Array<{ localDate: string; openPrCount: number }> = [];
  const result = await runDailyDigestIfDue(
    {
      now: new Date('2026-07-17T02:00:00Z'),
      timeZone: 'Asia/Bangkok',
      scheduledTime: '09:00',
      lastSentDate: undefined,
      reviewerGithub: 'sudarshanchaudhari'
    },
    {
      fetchPullRequests: async () => [basePullRequest],
      postDigest: async () => true,
      recordSent: async (localDate, openPrCount) => recorded.push({ localDate, openPrCount })
    }
  );

  assert.deepEqual(result, { status: 'sent', localDate: '2026-07-17', openPrCount: 1 });
  assert.deepEqual(recorded, [{ localDate: '2026-07-17', openPrCount: 1 }]);
});

test('runDailyDigestIfDue does not record a failed Slack post', async () => {
  let recorded = false;
  const result = await runDailyDigestIfDue(
    {
      now: new Date('2026-07-17T02:00:00Z'),
      timeZone: 'Asia/Bangkok',
      scheduledTime: '09:00',
      lastSentDate: undefined,
      reviewerGithub: 'sudarshanchaudhari'
    },
    {
      fetchPullRequests: async () => [basePullRequest],
      postDigest: async () => false,
      recordSent: async () => {
        recorded = true;
      }
    }
  );

  assert.deepEqual(result, { status: 'post_failed', localDate: '2026-07-17', openPrCount: 1 });
  assert.equal(recorded, false);
});
