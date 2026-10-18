import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const SIGNING_SECRET = 'slack-test-secret';

let handler: (req: any, res: any) => Promise<unknown>;
let prs: typeof import('../services/prs.js');
let assignmentId: string;

before(async () => {
  // config.ts validates env at import time; use an in-memory DB so the test never touches a real file.
  process.env.DATABASE_URL = ':memory:';
  process.env.JWT_SECRET = 'test-secret-value';
  process.env.GITHUB_WEBHOOK_SECRET = 'x';
  process.env.SLACK_BOT_TOKEN = 'x';
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;

  const users = await import('../services/users.js');
  prs = await import('../services/prs.js');
  const { slackRouter } = await import('./slack.js');
  handler = (slackRouter as any).stack[0].route.stack[0].handle;

  users.upsertUserByGithub({ githubUsername: 'alice', slackUserId: 'UALICE' });
  users.upsertUserByGithub({ githubUsername: 'bob', slackUserId: 'UBOB' });
  const pr = prs.upsertPullRequest({ repoFullName: 'acme/api', prNumber: 1, title: 't', url: 'https://example.test/1', authorGithub: 'carol' });
  assignmentId = prs.createOrKeepAssignment(pr.id, 'alice').id;
});

function signedRequest(slackUserId: string | undefined, actionId: string) {
  const payload = JSON.stringify({ user: slackUserId ? { id: slackUserId } : undefined, actions: [{ action_id: actionId, value: assignmentId }] });
  const raw = Buffer.from(`payload=${encodeURIComponent(payload)}`);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(`v0:${ts}:${raw.toString('utf8')}`).digest('hex');
  const headers: Record<string, string> = { 'x-slack-request-timestamp': ts, 'x-slack-signature': sig };
  return { rawBody: raw, body: { payload }, header: (name: string) => headers[name.toLowerCase()] };
}

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.send = (body?: unknown) => { res.body = body; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

function status() {
  return (prs.getAssignmentWithPr(assignmentId) as { status: string }).status;
}

test('foreign Slack user cannot change another reviewer\'s assignment', async () => {
  const res = fakeRes();
  await handler(signedRequest('UBOB', 'ack_assignment'), res);
  assert.equal(res.body?.response_type, 'ephemeral');
  assert.match(res.body?.text, /not your assignment/);
  assert.equal(status(), 'pending');
});

test('unknown Slack user (no mapped app user) cannot change an assignment', async () => {
  const res = fakeRes();
  await handler(signedRequest('UNOBODY', 'snooze_assignment'), res);
  assert.equal(res.body?.response_type, 'ephemeral');
  assert.equal(status(), 'pending');
});

test('payload without a Slack user cannot change an assignment', async () => {
  const res = fakeRes();
  await handler(signedRequest(undefined, 'ack_assignment'), res);
  assert.equal(res.body?.response_type, 'ephemeral');
  assert.equal(status(), 'pending');
});

test('assigned reviewer can acknowledge their own assignment', async () => {
  const res = fakeRes();
  await handler(signedRequest('UALICE', 'ack_assignment'), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body?.text, /Acknowledged/);
  assert.equal(status(), 'acknowledged');
});
