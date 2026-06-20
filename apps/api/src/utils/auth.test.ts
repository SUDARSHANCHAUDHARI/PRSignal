import { test, before } from 'node:test';
import assert from 'node:assert/strict';

type AuthModule = typeof import('./auth.js');
let auth: AuthModule;

before(async () => {
  // config.ts validates required env at import time; provide minimal values first.
  process.env.JWT_SECRET = 'test-secret-value';
  process.env.GITHUB_WEBHOOK_SECRET = 'x';
  process.env.SLACK_BOT_TOKEN = 'x';
  process.env.SLACK_SIGNING_SECRET = 'x';
  auth = await import('./auth.js');
});

test('signExtensionToken round-trips to the same user id', () => {
  const token = auth.signExtensionToken('user-123');
  assert.deepEqual(auth.verifyExtensionJwt(token), { userId: 'user-123' });
});

test('verifyExtensionJwt rejects a malformed token', () => {
  assert.equal(auth.verifyExtensionJwt('not-a-jwt'), null);
});
