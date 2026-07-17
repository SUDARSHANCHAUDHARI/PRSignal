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

export type PullRequestChannelStatus = 'open' | 'draft' | 'closed' | 'merged';
export type ChannelFeedDecision = {
  kind: 'ensure' | 'update' | 'none';
  status: PullRequestChannelStatus;
};

export function resolvePullRequestState(input: {
  action: string;
  isDraft: boolean;
  merged: boolean;
}): PullRequestChannelStatus {
  if (input.action === 'closed') return input.merged ? 'merged' : 'closed';
  return input.isDraft ? 'draft' : 'open';
}

export function decideChannelFeedAction(input: {
  action: string;
  isDraft: boolean;
  merged: boolean;
  notifyDrafts: boolean;
  hasNotification: boolean;
}): ChannelFeedDecision {
  const status = resolvePullRequestState(input);

  if (input.action === 'closed') {
    return { kind: input.hasNotification ? 'update' : 'none', status };
  }
  if (input.action === 'converted_to_draft') {
    return { kind: input.hasNotification ? 'update' : 'none', status: 'draft' };
  }
  if (['reopened', 'ready_for_review'].includes(input.action) && input.hasNotification) {
    return { kind: 'update', status };
  }
  if (['opened', 'reopened', 'ready_for_review'].includes(input.action)) {
    const shouldNotify = !input.isDraft || input.notifyDrafts;
    return { kind: shouldNotify ? 'ensure' : 'none', status };
  }
  return { kind: 'none', status };
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
