// Pure helpers for interpreting GitHub pull_request webhook payloads.
// Kept free of DB/Slack side effects so the branching logic can be unit-tested.

interface GitHubReviewer {
  login?: string;
}

interface PullRequestPayload {
  requested_reviewer?: GitHubReviewer | null;
  pull_request?: {
    requested_reviewers?: GitHubReviewer[] | null;
  } | null;
}

/**
 * Collect the set of reviewer logins implied by a pull_request event, de-duplicated.
 *
 * GitHub surfaces requested reviewers in two places: the single
 * `requested_reviewer` on a `review_requested` action, and the cumulative
 * `pull_request.requested_reviewers` array. We union both and drop blanks so a
 * reviewer is never notified twice for the same event.
 */
export function extractRequestedReviewers(payload: PullRequestPayload): string[] {
  const reviewers = new Set<string>();
  const single = payload.requested_reviewer?.login;
  if (single) reviewers.add(single);
  for (const reviewer of payload.pull_request?.requested_reviewers ?? []) {
    if (reviewer?.login) reviewers.add(reviewer.login);
  }
  return [...reviewers];
}
