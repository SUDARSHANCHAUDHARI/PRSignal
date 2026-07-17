import { normalizeRepositoryFullName } from './repositoryWatchRules.js';

export type GitHubPullRequestState = 'open' | 'closed' | 'merged';

export type GitHubPullRequest = {
  repoFullName: string;
  number: number;
  title: string;
  url: string;
  authorGithub: string;
  state: GitHubPullRequestState;
  isDraft: boolean;
  mergedAt: string | null;
  requestedReviewers: string[];
};

type GitHubPullRequestPayload = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  merged_at?: string | null;
  user?: { login?: string } | null;
  requested_reviewers?: Array<{ login?: string }> | null;
};

export interface GitHubHeadersLike {
  get(name: string): string | null;
}

export interface GitHubResponseLike {
  ok: boolean;
  status: number;
  headers: GitHubHeadersLike;
  json(): Promise<unknown>;
}

export type GitHubFetchLike = (url: string, init?: RequestInit) => Promise<GitHubResponseLike>;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rateLimited: boolean,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

function requestHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PRSignal'
  };
}

async function requireSuccessfulResponse(response: GitHubResponseLike, repoFullName: string): Promise<unknown> {
  if (!response.ok) {
    const rateLimited = response.status === 429 || (
      response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0'
    );
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new GitHubApiError(
      rateLimited
        ? `GitHub rate limit reached while syncing ${repoFullName}`
        : `GitHub request failed for ${repoFullName} with status ${response.status}`,
      response.status,
      rateLimited,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    );
  }
  return response.json();
}

function mapPullRequest(repoFullName: string, payload: GitHubPullRequestPayload): GitHubPullRequest {
  const state: GitHubPullRequestState = payload.merged_at
    ? 'merged'
    : payload.state === 'closed' ? 'closed' : 'open';
  return {
    repoFullName,
    number: payload.number,
    title: payload.title,
    url: payload.html_url,
    authorGithub: payload.user?.login ?? 'ghost',
    state,
    isDraft: Boolean(payload.draft),
    mergedAt: payload.merged_at ?? null,
    requestedReviewers: (payload.requested_reviewers ?? [])
      .map((reviewer) => reviewer.login)
      .filter((login): login is string => Boolean(login))
  };
}

export async function fetchOpenPullRequestsFromGitHub(
  repoFullName: string,
  token: string,
  fetchImpl: GitHubFetchLike = fetch
): Promise<GitHubPullRequest[]> {
  const normalizedRepository = normalizeRepositoryFullName(repoFullName);
  const [owner, repository] = normalizedRepository.split('/');
  const pullRequests: GitHubPullRequest[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls?state=open&per_page=100&page=${page}`;
    const response = await fetchImpl(url, {
      headers: requestHeaders(token),
      signal: AbortSignal.timeout(20_000)
    });
    const payload = await requireSuccessfulResponse(response, normalizedRepository);
    if (!Array.isArray(payload)) {
      throw new GitHubApiError(`GitHub returned an invalid pull request list for ${normalizedRepository}`, 502, false);
    }
    pullRequests.push(...payload.map((item) => mapPullRequest(normalizedRepository, item as GitHubPullRequestPayload)));
    hasNextPage = /rel="next"/.test(response.headers.get('link') ?? '');
    page += 1;
  }

  return pullRequests;
}

export async function fetchPullRequestFromGitHub(
  repoFullName: string,
  prNumber: number,
  token: string,
  fetchImpl: GitHubFetchLike = fetch
): Promise<GitHubPullRequest> {
  const normalizedRepository = normalizeRepositoryFullName(repoFullName);
  const [owner, repository] = normalizedRepository.split('/');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${prNumber}`;
  const response = await fetchImpl(url, {
    headers: requestHeaders(token),
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await requireSuccessfulResponse(response, normalizedRepository);
  if (!payload || typeof payload !== 'object') {
    throw new GitHubApiError(`GitHub returned an invalid pull request for ${normalizedRepository}`, 502, false);
  }
  return mapPullRequest(normalizedRepository, payload as GitHubPullRequestPayload);
}
