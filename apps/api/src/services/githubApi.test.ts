import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubApiError,
  fetchOpenPullRequestsFromGitHub,
  type GitHubFetchLike
} from './githubApi.js';

function githubPr(number: number) {
  return {
    number,
    title: `PR ${number}`,
    html_url: `https://github.com/acme/api/pull/${number}`,
    state: 'open',
    draft: false,
    merged_at: null,
    user: { login: 'octocat' },
    requested_reviewers: []
  };
}

test('GitHub open-PR client uses required headers and follows pagination', async () => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const pages = [[githubPr(1)], [githubPr(2)]];
  const fetchMock: GitHubFetchLike = async (url, init) => {
    const page = pages.shift() ?? [];
    requests.push({ url, headers: init?.headers as Record<string, string> });
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'link' && pages.length > 0 ? '<next>; rel="next"' : null },
      json: async () => page
    };
  };

  const pullRequests = await fetchOpenPullRequestsFromGitHub('acme/api', 'secret-token', fetchMock);

  assert.deepEqual(pullRequests.map((pr) => pr.number), [1, 2]);
  assert.match(requests[0]?.url ?? '', /per_page=100&page=1/);
  assert.match(requests[1]?.url ?? '', /page=2/);
  assert.equal(requests[0]?.headers.Authorization, 'Bearer secret-token');
  assert.equal(requests[0]?.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(requests[0]?.headers['User-Agent'], 'PRSignal');
});

test('GitHub API surfaces rate limits without exposing response bodies', async () => {
  const fetchMock: GitHubFetchLike = async () => ({
    ok: false,
    status: 429,
    headers: { get: (name) => name.toLowerCase() === 'retry-after' ? '60' : null },
    json: async () => ({ token: 'must-not-appear' })
  });

  await assert.rejects(
    () => fetchOpenPullRequestsFromGitHub('acme/api', 'secret-token', fetchMock),
    (error: unknown) => {
      assert.ok(error instanceof GitHubApiError);
      assert.equal(error.rateLimited, true);
      assert.equal(error.retryAfterSeconds, 60);
      assert.doesNotMatch(error.message, /must-not-appear|secret-token/);
      return true;
    }
  );
});
