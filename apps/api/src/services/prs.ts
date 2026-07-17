import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { PullRequest, ReviewAssignment } from '../types/models.js';
import { normalizeRepositoryFullName } from './repositoryWatchRules.js';

export function upsertPullRequest(input: {
  repoFullName: string;
  prNumber: number;
  title: string;
  url: string;
  authorGithub: string;
  state?: string;
  isDraft?: boolean;
  requestedReviewers?: string[];
  mergedAt?: string | null;
}): PullRequest {
  const repoFullName = normalizeRepositoryFullName(input.repoFullName);
  const existing = db.prepare('SELECT * FROM pull_requests WHERE repo_full_name = ? COLLATE NOCASE AND pr_number = ?')
    .get(repoFullName, input.prNumber) as PullRequest | undefined;

  if (existing) {
    const requestedReviewers = input.requestedReviewers === undefined
      ? existing.requested_reviewers_json
      : JSON.stringify(input.requestedReviewers);
    db.prepare(`
      UPDATE pull_requests
      SET repo_full_name = ?, title = ?, url = ?, author_github = ?, state = ?, is_draft = ?,
          requested_reviewers_json = ?, merged_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      repoFullName,
      input.title,
      input.url,
      input.authorGithub,
      input.state ?? 'open',
      input.isDraft === undefined ? existing.is_draft : Number(input.isDraft),
      requestedReviewers,
      input.mergedAt === undefined ? existing.merged_at : input.mergedAt,
      existing.id
    );
    return db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(existing.id) as PullRequest;
  }

  const id = nanoid();
  db.prepare(`
    INSERT INTO pull_requests (
      id, repo_full_name, pr_number, title, url, author_github, state, is_draft,
      requested_reviewers_json, merged_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    repoFullName,
    input.prNumber,
    input.title,
    input.url,
    input.authorGithub,
    input.state ?? 'open',
    Number(input.isDraft ?? false),
    JSON.stringify(input.requestedReviewers ?? []),
    input.mergedAt ?? null
  );
  return db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(id) as PullRequest;
}

export function createOrKeepAssignment(prId: string, reviewerGithub: string): ReviewAssignment {
  const existing = db.prepare(`SELECT * FROM review_assignments WHERE pr_id = ? AND reviewer_github = ? AND status IN ('pending','acknowledged','snoozed')`)
    .get(prId, reviewerGithub) as ReviewAssignment | undefined;
  if (existing) return existing;

  const id = nanoid();
  db.prepare(`INSERT INTO review_assignments (id, pr_id, reviewer_github) VALUES (?, ?, ?)`).run(id, prId, reviewerGithub);
  return db.prepare('SELECT * FROM review_assignments WHERE id = ?').get(id) as ReviewAssignment;
}

export function markAssignmentStatus(id: string, status: string): ReviewAssignment | undefined {
  const nowField = status === 'completed' ? ', completed_at = CURRENT_TIMESTAMP' : status === 'acknowledged' ? ', acknowledged_at = CURRENT_TIMESTAMP' : '';
  db.prepare(`UPDATE review_assignments SET status = ? ${nowField} WHERE id = ?`).run(status, id);
  return db.prepare('SELECT * FROM review_assignments WHERE id = ?').get(id) as ReviewAssignment | undefined;
}

export function snoozeAssignment(id: string, minutes: number): ReviewAssignment | undefined {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  db.prepare(`UPDATE review_assignments SET status = 'snoozed', snoozed_until = ? WHERE id = ?`).run(until, id);
  return db.prepare('SELECT * FROM review_assignments WHERE id = ?').get(id) as ReviewAssignment | undefined;
}

export function getAssignmentWithPr(id: string) {
  return db.prepare(`SELECT a.*, p.title, p.url, p.repo_full_name, p.pr_number, p.author_github FROM review_assignments a JOIN pull_requests p ON p.id = a.pr_id WHERE a.id = ?`).get(id);
}

export function pendingForGithub(githubUsername: string) {
  return db.prepare(`
    SELECT a.id as assignment_id, a.status, a.assigned_at, a.snoozed_until,
           p.id as pr_id, p.repo_full_name, p.pr_number, p.title, p.url, p.author_github
    FROM review_assignments a
    JOIN pull_requests p ON p.id = a.pr_id
    WHERE a.reviewer_github = ?
      AND p.state = 'open'
      AND (
        a.status = 'pending'
        OR a.status = 'acknowledged'
        OR (a.status = 'snoozed' AND datetime(a.snoozed_until) <= datetime('now'))
      )
    ORDER BY a.assigned_at ASC
  `).all(githubUsername);
}

export function setSlackTs(assignmentId: string, ts: string) {
  db.prepare('UPDATE review_assignments SET slack_ts = ? WHERE id = ?').run(ts, assignmentId);
}

export function getPullRequest(repoFullName: string, prNumber: number): PullRequest | undefined {
  const normalizedRepository = normalizeRepositoryFullName(repoFullName);
  return db.prepare('SELECT * FROM pull_requests WHERE repo_full_name = ? COLLATE NOCASE AND pr_number = ?')
    .get(normalizedRepository, prNumber) as PullRequest | undefined;
}

export function markPullRequestFinal(
  repoFullName: string,
  prNumber: number,
  status: 'closed' | 'merged',
  mergedAt: string | null = null
): PullRequest | undefined {
  const pr = getPullRequest(repoFullName, prNumber);
  if (!pr) return undefined;

  const finalize = db.transaction(() => {
    db.prepare(`
      UPDATE pull_requests
      SET state = ?, is_draft = 0, merged_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, mergedAt, pr.id);
    db.prepare(`
      UPDATE review_assignments
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE pr_id = ? AND status != 'completed'
    `).run(pr.id);
  });
  finalize();
  return db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(pr.id) as PullRequest;
}

export function markPrClosed(repoFullName: string, prNumber: number): PullRequest | undefined {
  return markPullRequestFinal(repoFullName, prNumber, 'closed');
}

export function listOpenPullRequestsForRepository(repoFullName: string): PullRequest[] {
  const normalizedRepository = normalizeRepositoryFullName(repoFullName);
  return db.prepare(`
    SELECT * FROM pull_requests
    WHERE repo_full_name = ? COLLATE NOCASE AND state = 'open'
    ORDER BY pr_number ASC
  `).all(normalizedRepository) as PullRequest[];
}

export function getRequestedReviewers(pr: PullRequest): string[] {
  try {
    const parsed: unknown = JSON.parse(pr.requested_reviewers_json);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}


export function touchAssignmentNotified(id: string) {
  db.prepare(`UPDATE review_assignments SET last_notified_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function touchAssignmentReminded(id: string) {
  db.prepare(`UPDATE review_assignments SET last_reminded_at = CURRENT_TIMESTAMP, reminder_count = reminder_count + 1 WHERE id = ?`).run(id);
}

export function pendingAssignmentsForReminder(reminderAfterMinutes: number) {
  return db.prepare(`
    SELECT a.id as assignment_id, a.reviewer_github, a.status, a.assigned_at, a.snoozed_until,
           a.last_notified_at, a.last_reminded_at, a.reminder_count,
           p.id as pr_id, p.repo_full_name, p.pr_number, p.title, p.url, p.author_github
    FROM review_assignments a
    JOIN pull_requests p ON p.id = a.pr_id
    WHERE p.state = 'open'
      AND a.status IN ('pending', 'acknowledged', 'snoozed')
      AND (
        a.status != 'snoozed'
        OR datetime(a.snoozed_until) <= datetime('now')
      )
      AND datetime(a.assigned_at) <= datetime('now', '-' || ? || ' minutes')
      AND (
        a.last_reminded_at IS NULL
        OR datetime(a.last_reminded_at) <= datetime('now', '-' || ? || ' minutes')
      )
    ORDER BY a.assigned_at ASC
    LIMIT 25
  `).all(reminderAfterMinutes, reminderAfterMinutes);
}
