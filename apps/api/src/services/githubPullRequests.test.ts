import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOpenPullRequests, parseMonitoredRepositories, type FetchLike } from './githubPullRequests.js';

test('parseMonitoredRepositories trims, validates, and de-duplicates owner/name entries', () => {
  assert.deepEqual(parseMonitoredRepositories('acme/api, acme/web,acme/api'), [
    { owner: 'acme', name: 'api', fullName: 'acme/api' },
    { owner: 'acme', name: 'web', fullName: 'acme/web' }
  ]);
  assert.throws(() => parseMonitoredRepositories('missing-owner'), /owner\/repository/);
});

test('fetchOpenPullRequests maps and paginates GitHub GraphQL results', async () => {
  const afterValues: Array<string | null> = [];
  const responses = [
    {
      data: {
        repository: {
          pullRequests: {
            nodes: [
              {
                number: 7,
                title: 'Review me',
                url: 'https://github.com/acme/api/pull/7',
                isDraft: false,
                author: { login: 'octocat' },
                mergeable: 'MERGEABLE',
                mergeStateStatus: 'CLEAN',
                reviewDecision: 'REVIEW_REQUIRED',
                reviewRequests: { nodes: [{ requestedReviewer: { login: 'sudarshanchaudhari' } }] },
                updatedAt: '2026-07-17T00:00:00Z'
              }
            ],
            pageInfo: { hasNextPage: true, endCursor: 'next-page' }
          }
        }
      }
    },
    {
      data: {
        repository: {
          pullRequests: {
            nodes: [
              {
                number: 8,
                title: 'Merge me',
                url: 'https://github.com/acme/api/pull/8',
                isDraft: false,
                author: null,
                mergeable: 'MERGEABLE',
                mergeStateStatus: 'CLEAN',
                reviewDecision: 'APPROVED',
                reviewRequests: { nodes: [] },
                updatedAt: '2026-07-17T01:00:00Z'
              }
            ],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    }
  ];
  const fetchMock: FetchLike = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { variables: { after: string | null } };
    afterValues.push(body.variables.after);
    const payload = responses.shift();
    return {
      ok: true,
      status: 200,
      json: async () => payload
    };
  };

  const pullRequests = await fetchOpenPullRequests(
    [{ owner: 'acme', name: 'api', fullName: 'acme/api' }],
    'github-token',
    fetchMock
  );

  assert.deepEqual(afterValues, [null, 'next-page']);
  assert.equal(pullRequests.length, 2);
  assert.deepEqual(pullRequests[0]?.requestedReviewers, ['sudarshanchaudhari']);
  assert.equal(pullRequests[1]?.author, 'ghost');
});
