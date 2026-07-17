export type MergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;

export interface DigestPullRequest {
  repository: string;
  number: number;
  title: string;
  url: string;
  author: string;
  isDraft: boolean;
  mergeable: MergeableState;
  mergeStateStatus: string;
  reviewDecision: ReviewDecision;
  requestedReviewers: string[];
  updatedAt: string;
}

export interface CategorizedPullRequests {
  needsMyReview: DigestPullRequest[];
  readyToMerge: DigestPullRequest[];
  waitingForReview: DigestPullRequest[];
  draftOrBlocked: DigestPullRequest[];
}

export interface DailyDigestMessage {
  fallbackText: string;
  sections: string[];
}

export interface DailyDigestRunInput {
  now: Date;
  timeZone: string;
  scheduledTime: string;
  lastSentDate: string | undefined;
  reviewerGithub: string;
}

export interface DailyDigestDependencies {
  fetchPullRequests(): Promise<DigestPullRequest[]>;
  postDigest(message: DailyDigestMessage): Promise<boolean>;
  recordSent(localDate: string, openPrCount: number): Promise<unknown>;
}

export type DailyDigestRunResult = {
  status: 'not_due' | 'sent' | 'post_failed';
  localDate: string;
  openPrCount: number;
};

function parseScheduledTime(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid daily digest time: ${value}`);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid daily digest time: ${value}`);
  return hours * 60 + minutes;
}

function getZonedDateTime(now: Date, timeZone: string): { localDate: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  return { localDate, minutes };
}

export function shouldRunDailyDigest(
  now: Date,
  timeZone: string,
  scheduledTime: string,
  lastSentDate: string | undefined
): { shouldRun: boolean; localDate: string } {
  const { localDate, minutes } = getZonedDateTime(now, timeZone);
  const scheduledMinutes = parseScheduledTime(scheduledTime);
  return {
    shouldRun: lastSentDate !== localDate && minutes >= scheduledMinutes,
    localDate
  };
}

function sortPullRequests(pullRequests: DigestPullRequest[]): DigestPullRequest[] {
  return [...pullRequests].sort((left, right) => {
    const repositoryOrder = left.repository.localeCompare(right.repository);
    return repositoryOrder === 0 ? left.number - right.number : repositoryOrder;
  });
}

export function categorizePullRequests(
  pullRequests: DigestPullRequest[],
  reviewerGithub: string
): CategorizedPullRequests {
  const categories: CategorizedPullRequests = {
    needsMyReview: [],
    readyToMerge: [],
    waitingForReview: [],
    draftOrBlocked: []
  };
  const reviewer = reviewerGithub.toLocaleLowerCase('en-US');

  for (const pullRequest of sortPullRequests(pullRequests)) {
    const isMyReviewRequested = pullRequest.requestedReviewers.some(
      (requestedReviewer) => requestedReviewer.toLocaleLowerCase('en-US') === reviewer
    );
    if (isMyReviewRequested) {
      categories.needsMyReview.push(pullRequest);
      continue;
    }

    const isReadyToMerge =
      !pullRequest.isDraft &&
      pullRequest.mergeable === 'MERGEABLE' &&
      pullRequest.mergeStateStatus === 'CLEAN' &&
      pullRequest.reviewDecision === 'APPROVED';
    if (isReadyToMerge) {
      categories.readyToMerge.push(pullRequest);
      continue;
    }

    const isWaitingForReview =
      !pullRequest.isDraft &&
      (pullRequest.reviewDecision === 'REVIEW_REQUIRED' || pullRequest.requestedReviewers.length > 0);
    if (isWaitingForReview) {
      categories.waitingForReview.push(pullRequest);
      continue;
    }

    categories.draftOrBlocked.push(pullRequest);
  }

  return categories;
}

function escapeSlackText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function formatPullRequestLine(pullRequest: DigestPullRequest): string {
  return `• <${pullRequest.url}|${escapeSlackText(pullRequest.repository)} #${pullRequest.number}> — ${escapeSlackText(pullRequest.title)} · @${escapeSlackText(pullRequest.author)}`;
}

function sectionChunks(title: string, pullRequests: DigestPullRequest[]): string[] {
  if (pullRequests.length === 0) return [];

  const header = `*${title} (${pullRequests.length})*`;
  const chunks: string[] = [];
  let current = header;

  for (const pullRequest of pullRequests) {
    const line = formatPullRequestLine(pullRequest);
    if (current.length + line.length + 1 > 2_900) {
      chunks.push(current);
      current = `*${title} (continued)*\n${line}`;
    } else {
      current += `\n${line}`;
    }
  }
  chunks.push(current);
  return chunks;
}

export function formatDailyDigest(
  pullRequests: DigestPullRequest[],
  reviewerGithub: string,
  localDate: string
): DailyDigestMessage {
  const categories = categorizePullRequests(pullRequests, reviewerGithub);
  const total = pullRequests.length;
  const fallbackText =
    `PRSignal daily digest ${localDate}: ${total} open PR${total === 1 ? '' : 's'}; ` +
    `${categories.needsMyReview.length} need your review; ` +
    `${categories.readyToMerge.length} ready to merge; ` +
    `${categories.waitingForReview.length} waiting for review; ` +
    `${categories.draftOrBlocked.length} draft or blocked.`;

  const sections = [`*PRSignal daily digest — ${localDate}*\n${fallbackText}`];
  sections.push(...sectionChunks('Needs your review', categories.needsMyReview));
  sections.push(...sectionChunks('Ready to merge', categories.readyToMerge));
  sections.push(...sectionChunks('Waiting for review', categories.waitingForReview));
  sections.push(...sectionChunks('Draft or blocked', categories.draftOrBlocked));
  if (total === 0) sections.push(':white_check_mark: No open pull requests in the monitored repositories.');

  return { fallbackText, sections };
}

export async function runDailyDigestIfDue(
  input: DailyDigestRunInput,
  dependencies: DailyDigestDependencies
): Promise<DailyDigestRunResult> {
  const schedule = shouldRunDailyDigest(
    input.now,
    input.timeZone,
    input.scheduledTime,
    input.lastSentDate
  );
  if (!schedule.shouldRun) {
    return { status: 'not_due', localDate: schedule.localDate, openPrCount: 0 };
  }

  const pullRequests = await dependencies.fetchPullRequests();
  const message = formatDailyDigest(pullRequests, input.reviewerGithub, schedule.localDate);
  const posted = await dependencies.postDigest(message);
  if (!posted) {
    return { status: 'post_failed', localDate: schedule.localDate, openPrCount: pullRequests.length };
  }

  await dependencies.recordSent(schedule.localDate, pullRequests.length);
  return { status: 'sent', localDate: schedule.localDate, openPrCount: pullRequests.length };
}
