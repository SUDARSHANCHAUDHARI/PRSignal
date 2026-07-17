import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import type { ChannelNotification, PullRequest } from '../types/models.js';
import type { PullRequestChannelStatus } from './githubEvents.js';

export function getChannelNotification(
  prId: string,
  repositoryWatchId: string
): ChannelNotification | undefined {
  return db.prepare(`
    SELECT * FROM channel_notifications
    WHERE pr_id = ? AND repository_watch_id = ?
  `).get(prId, repositoryWatchId) as ChannelNotification | undefined;
}

export function insertChannelNotification(input: {
  prId: string;
  repositoryWatchId: string;
  slackChannelId: string;
  slackRootTs: string;
  status: PullRequestChannelStatus;
}): ChannelNotification {
  const id = nanoid();
  db.prepare(`
    INSERT INTO channel_notifications (
      id, pr_id, repository_watch_id, slack_channel_id, slack_root_ts, last_known_pr_status
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pr_id, repository_watch_id) DO NOTHING
  `).run(
    id,
    input.prId,
    input.repositoryWatchId,
    input.slackChannelId,
    input.slackRootTs,
    input.status
  );
  const notification = getChannelNotification(input.prId, input.repositoryWatchId);
  if (!notification) throw new Error('Failed to persist Slack channel notification');
  return notification;
}

export function updateChannelNotificationStatus(
  id: string,
  status: PullRequestChannelStatus
): void {
  db.prepare(`
    UPDATE channel_notifications
    SET last_known_pr_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, id);
}

export function listPullRequestsWithNotificationStateDrift(
  repositoryWatchId: string
): PullRequest[] {
  return db.prepare(`
    SELECT p.*
    FROM channel_notifications n
    JOIN pull_requests p ON p.id = n.pr_id
    WHERE n.repository_watch_id = ?
      AND n.last_known_pr_status != CASE
        WHEN p.state = 'open' AND p.is_draft = 1 THEN 'draft'
        ELSE p.state
      END
    ORDER BY p.pr_number ASC
  `).all(repositoryWatchId) as PullRequest[];
}
