import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRequestedReviewers } from './githubEvents.js';

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
