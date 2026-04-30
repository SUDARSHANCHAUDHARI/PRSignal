import { WebClient } from '@slack/web-api';
import { config } from '../config.js';
import { setSlackTs, touchAssignmentNotified } from './prs.js';
import { getUserByGithub } from './users.js';
import { getMessageTone, getSlackBody, getSlackIntro, getWaitingMinutes } from './messageTemplates.js';

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
}) {
  const user = getUserByGithub(input.reviewerGithub);
  if (!user?.slack_user_id) {
    console.warn(`[slack] No slack user mapping for GitHub user ${input.reviewerGithub}`);
    return;
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
  } catch (err) {
    console.warn(`[slack] DM failed for ${input.reviewerGithub}:`, err instanceof Error ? err.message : err);
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
}) {
  await sendReviewDm(input);
}
