import { WebClient } from '@slack/web-api';
import { config } from '../config.js';
import { setSlackTs, touchAssignmentNotified } from './prs.js';
import { getUserByGithub } from './users.js';
import { getMessageTone, getSlackBody, getSlackIntro, getWaitingMinutes } from './messageTemplates.js';
import type { DailyDigestMessage } from './dailyDigest.js';
import type { ChannelNotification } from '../types/models.js';
import type { ChannelPostResult, PrChannelInput } from './prChannelFeed.js';

export const slack = new WebClient(config.SLACK_BOT_TOKEN);

export async function sendReviewDm(input: {
  assignmentId: string;
  reviewerGithub: string;
  prTitle: string;
  prUrl: string;
  repoFullName: string;
  prNumber: number;
  authorGithub: string;
  assignedAt?: string;
}): Promise<boolean> {
  const user = getUserByGithub(input.reviewerGithub);
  if (!user?.slack_user_id) {
    console.warn(`[slack] No slack user mapping for GitHub user ${input.reviewerGithub}`);
    return false;
  }

  const waitingMinutes = getWaitingMinutes(input.assignedAt);
  const tone = getMessageTone(waitingMinutes);
  const intro = getSlackIntro(tone);
  const body = getSlackBody({
    title: input.prTitle,
    url: input.prUrl,
    repoFullName: input.repoFullName,
    prNumber: input.prNumber,
    authorGithub: input.authorGithub,
    reviewerGithub: input.reviewerGithub,
    waitingMinutes
  }, tone);

  try {
    const result = await slack.chat.postMessage({
      channel: user.slack_user_id,
      text: `PR review requested: ${input.prTitle}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: intro } },
        { type: 'section', text: { type: 'mrkdwn', text: body } },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Repo: \`${input.repoFullName}\` · PR #${input.prNumber} · Author: @${input.authorGithub}` }
          ]
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Review now' }, style: 'primary', url: input.prUrl, action_id: 'review_now', value: input.assignmentId },
            { type: 'button', text: { type: 'plain_text', text: 'Acknowledge' }, action_id: 'ack_assignment', value: input.assignmentId },
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 30m' }, action_id: 'snooze_assignment', value: input.assignmentId }
          ]
        }
      ]
    });
    if (result.ts) setSlackTs(input.assignmentId, result.ts);
    touchAssignmentNotified(input.assignmentId);
    return true;
  } catch (err) {
    console.warn(`[slack] DM failed for ${input.reviewerGithub}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function postEscalation(input: { reviewerGithub: string; prTitle: string; prUrl: string; waitingText: string }) {
  if (!config.TEAM_CHANNEL_ID) return;
  try {
    await slack.chat.postMessage({
      channel: config.TEAM_CHANNEL_ID,
      text: `PR review still pending from @${input.reviewerGithub}: ${input.prTitle}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:rotating_light: *PR review still pending*\nReviewer: @${input.reviewerGithub}\nWaiting: ${input.waitingText}\n<${input.prUrl}|${input.prTitle}>`
          }
        }
      ]
    });
  } catch (err) {
    console.warn('[slack] Escalation failed:', err instanceof Error ? err.message : err);
  }
}


export async function sendReviewReminderDm(input: {
  assignmentId: string;
  reviewerGithub: string;
  prTitle: string;
  prUrl: string;
  repoFullName: string;
  prNumber: number;
  authorGithub: string;
  assignedAt?: string;
  reminderCount?: number;
}): Promise<boolean> {
  return sendReviewDm(input);
}

export async function postDailyDigest(channelId: string, message: DailyDigestMessage): Promise<boolean> {
  const batchSize = 45;
  const batches: string[][] = [];
  for (let index = 0; index < message.sections.length; index += batchSize) {
    batches.push(message.sections.slice(index, index + batchSize));
  }

  try {
    for (const [index, sections] of batches.entries()) {
      const part = batches.length > 1 ? ` (part ${index + 1}/${batches.length})` : '';
      const result = await slack.chat.postMessage({
        channel: channelId,
        text: `${message.fallbackText}${part}`,
        blocks: sections.map((section) => ({
          type: 'section' as const,
          text: { type: 'mrkdwn' as const, text: section }
        }))
      });
      if (!result.ok) return false;
    }
    return true;
  } catch (err) {
    console.warn('[slack] Daily digest failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

function escapeSlackText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function prStatusLabel(pullRequest: PrChannelInput): string {
  switch (pullRequest.state) {
    case 'merged': return 'Merged';
    case 'closed': return 'Closed';
    case 'draft': return 'Draft';
    case 'open': return pullRequest.isDraft ? 'Draft' : 'Open';
  }
}

function buildPrChannelMessage(pullRequest: PrChannelInput) {
  const status = prStatusLabel(pullRequest);
  const headline = pullRequest.state === 'open'
    ? 'New pull request ready for review'
    : pullRequest.state === 'draft'
      ? 'Draft pull request'
      : `Pull request ${status.toLocaleLowerCase('en-US')}`;
  const reviewers = pullRequest.requestedReviewers.length > 0
    ? pullRequest.requestedReviewers.map((reviewer) => `@${escapeSlackText(reviewer)}`).join(', ')
    : 'Not requested';
  const title = escapeSlackText(pullRequest.title);
  const repository = escapeSlackText(pullRequest.repoFullName);
  const author = escapeSlackText(pullRequest.authorGithub);
  return {
    text: `${headline}: ${pullRequest.repoFullName} #${pullRequest.prNumber} ${pullRequest.title} — ${status}`,
    blocks: [
      {
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: `*${headline}*` }
      },
      {
        type: 'section' as const,
        text: {
          type: 'mrkdwn' as const,
          text: `*Repository:* \`${repository}\`\n*PR:* <${pullRequest.url}|#${pullRequest.prNumber} ${title}>\n*Author:* @${author}\n*Reviewers:* ${reviewers}\n*Status:* ${status}`
        }
      },
      {
        type: 'actions' as const,
        elements: [
          {
            type: 'button' as const,
            text: { type: 'plain_text' as const, text: 'Open pull request' },
            style: 'primary' as const,
            url: pullRequest.url,
            action_id: 'open_pr_channel_feed'
          }
        ]
      }
    ]
  };
}

export async function postPrChannelNotification(
  channelId: string,
  pullRequest: PrChannelInput
): Promise<ChannelPostResult> {
  const message = buildPrChannelMessage(pullRequest);
  try {
    const result = await slack.chat.postMessage({ channel: channelId, ...message });
    return { ok: Boolean(result.ok && result.ts), ts: result.ts };
  } catch (error) {
    console.warn('[slack] PR channel notification failed:', error instanceof Error ? error.message : error);
    return { ok: false };
  }
}

export async function updatePrChannelNotification(
  notification: ChannelNotification,
  pullRequest: PrChannelInput
): Promise<boolean> {
  const message = buildPrChannelMessage(pullRequest);
  try {
    const result = await slack.chat.update({
      channel: notification.slack_channel_id,
      ts: notification.slack_root_ts,
      ...message
    });
    return Boolean(result.ok);
  } catch (error) {
    console.warn('[slack] PR channel update failed:', error instanceof Error ? error.message : error);
    return false;
  }
}
