import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideChannelFeedAction,
  extractRequestedReviewers,
  resolvePullRequestState
} from './githubEvents.js';

test('extractRequestedReviewers reads the single requested_reviewer', () => {
  const reviewers = extractRequestedReviewers({
    requested_reviewer: { login: 'alice' },
    pull_request: { requested_reviewers: [] }
  });
  assert.deepEqual(reviewers, ['alice']);
});

test('extractRequestedReviewers reads the requested_reviewers array', () => {
  const reviewers = extractRequestedReviewers({
    pull_request: { requested_reviewers: [{ login: 'bob' }, { login: 'carol' }] }
  });
  assert.deepEqual(reviewers, ['bob', 'carol']);
});

test('extractRequestedReviewers de-duplicates across both sources', () => {
  const reviewers = extractRequestedReviewers({
    requested_reviewer: { login: 'alice' },
    pull_request: { requested_reviewers: [{ login: 'alice' }, { login: 'bob' }] }
  });
  assert.deepEqual(reviewers, ['alice', 'bob']);
});

test('extractRequestedReviewers ignores blank or missing logins', () => {
  const reviewers = extractRequestedReviewers({
    requested_reviewer: { login: '' },
    pull_request: { requested_reviewers: [{ login: undefined }, { login: 'dave' }] }
  });
  assert.deepEqual(reviewers, ['dave']);
});

test('extractRequestedReviewers returns empty array for an empty payload', () => {
  assert.deepEqual(extractRequestedReviewers({}), []);
});

test('opened notifies for a normal PR and respects draft configuration', () => {
  assert.deepEqual(
    decideChannelFeedAction({ action: 'opened', isDraft: false, merged: false, notifyDrafts: false, hasNotification: false }),
    { kind: 'ensure', status: 'open' }
  );
  assert.deepEqual(
    decideChannelFeedAction({ action: 'opened', isDraft: true, merged: false, notifyDrafts: false, hasNotification: false }),
    { kind: 'none', status: 'draft' }
  );
  assert.deepEqual(
    decideChannelFeedAction({ action: 'opened', isDraft: true, merged: false, notifyDrafts: true, hasNotification: false }),
    { kind: 'ensure', status: 'draft' }
  );
});

test('ready_for_review ensures a previously skipped draft gets a root message', () => {
  assert.deepEqual(
    decideChannelFeedAction({ action: 'ready_for_review', isDraft: false, merged: false, notifyDrafts: false, hasNotification: false }),
    { kind: 'ensure', status: 'open' }
  );
});

test('reopened and ready_for_review update an existing root message back to open', () => {
  for (const action of ['reopened', 'ready_for_review']) {
    assert.deepEqual(
      decideChannelFeedAction({ action, isDraft: false, merged: false, notifyDrafts: false, hasNotification: true }),
      { kind: 'update', status: 'open' }
    );
  }
});

test('converted_to_draft only updates an existing channel conversation', () => {
  assert.deepEqual(
    decideChannelFeedAction({ action: 'converted_to_draft', isDraft: true, merged: false, notifyDrafts: false, hasNotification: true }),
    { kind: 'update', status: 'draft' }
  );
  assert.deepEqual(
    decideChannelFeedAction({ action: 'converted_to_draft', isDraft: true, merged: false, notifyDrafts: false, hasNotification: false }),
    { kind: 'none', status: 'draft' }
  );
});

test('closed events distinguish merged from closed state', () => {
  assert.equal(resolvePullRequestState({ action: 'closed', isDraft: false, merged: true }), 'merged');
  assert.equal(resolvePullRequestState({ action: 'closed', isDraft: false, merged: false }), 'closed');
});
