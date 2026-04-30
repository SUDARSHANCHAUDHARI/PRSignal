import crypto from 'node:crypto';
import { config } from '../config.js';

const payload = {
  action: 'review_requested',
  repository: { full_name: 'demo/prsignal-test' },
  requested_reviewer: { login: 'your-github-username' },
  pull_request: {
    number: 42,
    title: 'Test PR review request',
    html_url: 'https://github.com/demo/prsignal-test/pull/42',
    state: 'open',
    user: { login: 'author-user' },
    requested_reviewers: [{ login: 'your-github-username' }]
  }
};

const body = JSON.stringify(payload);
const sig = `sha256=${crypto.createHmac('sha256', config.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')}`;

const res = await fetch(`${config.PUBLIC_APP_URL}/github/webhook`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-github-event': 'pull_request',
    'x-hub-signature-256': sig
  },
  body
});

console.log(res.status, await res.text());
