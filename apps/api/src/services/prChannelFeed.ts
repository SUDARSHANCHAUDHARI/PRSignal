import type { ChannelNotification, RepositoryWatch } from '../types/models.js';
import type { PullRequestChannelStatus } from './githubEvents.js';

export type PrChannelInput = {
  prId: string;
  repoFullName: string;
  prNumber: number;
  title: string;
  url: string;
  authorGithub: string;
  requestedReviewers: string[];
  state: PullRequestChannelStatus;
  isDraft: boolean;
};

export type ChannelPostResult = { ok: boolean; ts?: string };

export type PrChannelFeedDependencies = {
  getNotification(prId: string, repositoryWatchId: string): ChannelNotification | undefined;
  insertNotification(input: {
    prId: string;
    repositoryWatchId: string;
    slackChannelId: string;
    slackRootTs: string;
    status: PullRequestChannelStatus;
  }): ChannelNotification;
  updateNotificationStatus(id: string, status: PullRequestChannelStatus): void;
  postNotification(channelId: string, pullRequest: PrChannelInput): Promise<ChannelPostResult>;
  updateNotification(notification: ChannelNotification, pullRequest: PrChannelInput): Promise<boolean>;
};

export type EnsureChannelNotificationResult = {
  status: 'created' | 'existing' | 'failed' | 'skipped';
  notification?: ChannelNotification;
};

export type UpdateChannelNotificationResult = {
  status: 'updated' | 'unchanged' | 'missing' | 'failed';
};

export function createPrChannelFeed(dependencies: PrChannelFeedDependencies) {
  const inFlight = new Map<string, Promise<EnsureChannelNotificationResult>>();

  async function ensureInner(
    watch: RepositoryWatch,
    pullRequest: PrChannelInput
  ): Promise<EnsureChannelNotificationResult> {
    if (!watch.enabled) return { status: 'skipped' };
    const existing = dependencies.getNotification(pullRequest.prId, watch.id);
    if (existing) return { status: 'existing', notification: existing };

    const posted = await dependencies.postNotification(watch.slack_channel_id, pullRequest);
    if (!posted.ok || !posted.ts) return { status: 'failed' };

    const notification = dependencies.insertNotification({
      prId: pullRequest.prId,
      repositoryWatchId: watch.id,
      slackChannelId: watch.slack_channel_id,
      slackRootTs: posted.ts,
      status: pullRequest.state
    });
    return { status: 'created', notification };
  }

  async function ensureNotification(
    watch: RepositoryWatch,
    pullRequest: PrChannelInput
  ): Promise<EnsureChannelNotificationResult> {
    const key = `${watch.id}:${pullRequest.prId}`;
    const active = inFlight.get(key);
    if (active) {
      const result = await active;
      return result.status === 'created'
        ? { status: 'existing', notification: result.notification }
        : result;
    }

    const work = ensureInner(watch, pullRequest);
    inFlight.set(key, work);
    try {
      return await work;
    } finally {
      if (inFlight.get(key) === work) inFlight.delete(key);
    }
  }

  async function updateNotificationStatus(
    watch: RepositoryWatch,
    pullRequest: PrChannelInput
  ): Promise<UpdateChannelNotificationResult> {
    const notification = dependencies.getNotification(pullRequest.prId, watch.id);
    if (!notification) return { status: 'missing' };
    if (notification.last_known_pr_status === pullRequest.state) return { status: 'unchanged' };

    const updated = await dependencies.updateNotification(notification, pullRequest);
    if (!updated) return { status: 'failed' };
    dependencies.updateNotificationStatus(notification.id, pullRequest.state);
    return { status: 'updated' };
  }

  return { ensureNotification, updateNotificationStatus };
}
