import type { DigestPullRequest, MergeableState, ReviewDecision } from './dailyDigest.js';

export interface MonitoredRepository {
  owner: string;
  name: string;
  fullName: string;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponseLike>;

interface PullRequestNode {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  author: { login?: string } | null;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  reviewRequests: {
    nodes: Array<{ requestedReviewer: { login?: string; slug?: string } | null }>;
  };
  updatedAt: string;
}

interface GraphQlPayload {
  data?: {
    repository?: {
      pullRequests: {
        nodes: PullRequestNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

const OPEN_PULL_REQUESTS_QUERY = `
  query OpenPullRequests($owner: String!, $name: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(states: OPEN, first: 100, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          number
          title
          url
          isDraft
          author { login }
          mergeable
          mergeStateStatus
          reviewDecision
          reviewRequests(first: 100) {
            nodes {
              requestedReviewer {
                ... on User { login }
                ... on Mannequin { login }
                ... on Team { slug }
              }
            }
          }
          updatedAt
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export function parseMonitoredRepositories(value: string): MonitoredRepository[] {
  const repositories: MonitoredRepository[] = [];
  const seen = new Set<string>();

  for (const entry of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    const match = /^([^/\s]+)\/([^/\s]+)$/.exec(entry);
    if (!match) throw new Error(`Invalid monitored repository "${entry}"; expected owner/repository`);

    const owner = match[1];
    const name = match[2];
    const fullName = `${owner}/${name}`;
    const key = fullName.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    repositories.push({ owner, name, fullName });
  }

  return repositories;
}

function normalizeMergeable(value: string): MergeableState {
  if (value === 'MERGEABLE' || value === 'CONFLICTING') return value;
  return 'UNKNOWN';
}

function normalizeReviewDecision(value: string | null): ReviewDecision {
  if (value === 'APPROVED' || value === 'CHANGES_REQUESTED' || value === 'REVIEW_REQUIRED') return value;
  return null;
}

function mapPullRequest(repository: MonitoredRepository, node: PullRequestNode): DigestPullRequest {
  const requestedReviewers = node.reviewRequests.nodes
    .map(({ requestedReviewer }) =>
      requestedReviewer?.login ?? (requestedReviewer?.slug ? `team:${requestedReviewer.slug}` : undefined)
    )
    .filter((reviewer): reviewer is string => Boolean(reviewer));

  return {
    repository: repository.fullName,
    number: node.number,
    title: node.title,
    url: node.url,
    author: node.author?.login ?? 'ghost',
    isDraft: node.isDraft,
    mergeable: normalizeMergeable(node.mergeable),
    mergeStateStatus: node.mergeStateStatus,
    reviewDecision: normalizeReviewDecision(node.reviewDecision),
    requestedReviewers,
    updatedAt: node.updatedAt
  };
}

async function fetchRepositoryPullRequests(
  repository: MonitoredRepository,
  githubToken: string,
  fetchImpl: FetchLike
): Promise<DigestPullRequest[]> {
  const pullRequests: DigestPullRequest[] = [];
  let after: string | null = null;

  do {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${githubToken}`,
        'content-type': 'application/json',
        'user-agent': 'PRSignal'
      },
      body: JSON.stringify({
        query: OPEN_PULL_REQUESTS_QUERY,
        variables: { owner: repository.owner, name: repository.name, after }
      }),
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) {
      throw new Error(`GitHub request failed for ${repository.fullName} with status ${response.status}`);
    }

    const payload = (await response.json()) as GraphQlPayload;
    if (payload.errors?.length) {
      const details = payload.errors.map((error) => error.message ?? 'Unknown GraphQL error').join('; ');
      throw new Error(`GitHub request failed for ${repository.fullName}: ${details}`);
    }

    const connection = payload.data?.repository?.pullRequests;
    if (!connection) throw new Error(`GitHub repository not found or inaccessible: ${repository.fullName}`);

    pullRequests.push(...connection.nodes.map((node) => mapPullRequest(repository, node)));
    if (connection.pageInfo.hasNextPage && !connection.pageInfo.endCursor) {
      throw new Error(`GitHub returned an invalid pagination cursor for ${repository.fullName}`);
    }
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);

  return pullRequests;
}

export async function fetchOpenPullRequests(
  repositories: MonitoredRepository[],
  githubToken: string,
  fetchImpl: FetchLike = fetch
): Promise<DigestPullRequest[]> {
  const results = await Promise.all(
    repositories.map((repository) => fetchRepositoryPullRequests(repository, githubToken, fetchImpl))
  );
  return results.flat();
}
