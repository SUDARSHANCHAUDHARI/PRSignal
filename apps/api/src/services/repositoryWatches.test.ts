import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesRepositoryWatch,
  normalizeRepositoryFullName,
  normalizeSlackChannelId
} from './repositoryWatchRules.js';
import type { RepositoryWatch } from '../types/models.js';

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

test('normalizeRepositoryFullName trims and canonicalizes owner/repository', () => {
  assert.equal(normalizeRepositoryFullName('  Acme/Payments.API  '), 'acme/payments.api');
});

test('normalizeRepositoryFullName rejects malformed names and GitHub URLs', () => {
  for (const value of ['acme', 'acme/api/extra', 'https://github.com/acme/api', 'acme api/repo']) {
    assert.throws(() => normalizeRepositoryFullName(value), /owner\/repository/);
  }
});

test('normalizeSlackChannelId requires a Slack public or private channel ID', () => {
  assert.equal(normalizeSlackChannelId(' C0123456789 '), 'C0123456789');
  assert.equal(normalizeSlackChannelId('G0123456789'), 'G0123456789');
  assert.throws(() => normalizeSlackChannelId('D0123456789'), /Slack channel ID/);
});

test('matchesRepositoryWatch is case-insensitive and ignores disabled watches', () => {
  assert.equal(matchesRepositoryWatch(watch, 'ACME/API'), true);
  assert.equal(matchesRepositoryWatch({ ...watch, enabled: 0 }, 'acme/api'), false);
});
