import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyGitHubSignature, verifySlackSignature } from './crypto.js';

test('verifyGitHubSignature accepts a valid signature', () => {
  const secret = 'topsecret';
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyGitHubSignature(body, sig, secret), true);
});

test('verifyGitHubSignature rejects a tampered signature', () => {
  const secret = 'topsecret';
  const body = Buffer.from('{}');
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(Buffer.from('other')).digest('hex');
  assert.equal(verifyGitHubSignature(body, sig, secret), false);
});

test('verifyGitHubSignature rejects a missing header', () => {
  assert.equal(verifyGitHubSignature(Buffer.from('{}'), undefined, 'secret'), false);
});

test('verifySlackSignature accepts a fresh valid signature', () => {
  const secret = 'slacksecret';
  const ts = String(Math.floor(Date.now() / 1000));
  const body = Buffer.from('token=abc');
  const base = `v0:${ts}:${body.toString('utf8')}`;
  const sig = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  assert.equal(verifySlackSignature(body, ts, sig, secret), true);
});

test('verifySlackSignature rejects an expired timestamp', () => {
  const secret = 'slacksecret';
  const ts = String(Math.floor(Date.now() / 1000) - 60 * 10);
  const body = Buffer.from('token=abc');
  const base = `v0:${ts}:${body.toString('utf8')}`;
  const sig = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  assert.equal(verifySlackSignature(body, ts, sig, secret), false);
});

test('verifySlackSignature rejects a missing signature', () => {
  assert.equal(verifySlackSignature(Buffer.from(''), String(Date.now()), undefined, 'secret'), false);
});
