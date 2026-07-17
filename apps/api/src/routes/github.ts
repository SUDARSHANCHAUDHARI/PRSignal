import { Router } from 'express';
import { config } from '../config.js';
import { getChannelNotification } from '../services/channelNotifications.js';
import {
  decideChannelFeedAction,
  extractRequestedReviewers,
  resolvePullRequestState
} from '../services/githubEvents.js';
import { prChannelFeed } from '../services/prChannelFeedRuntime.js';
import { createOrKeepAssignment, markPullRequestFinal, upsertPullRequest } from '../services/prs.js';
import { getEnabledRepositoryWatchByFullName } from '../services/repositoryWatches.js';
import { sendReviewDm } from '../services/slack.js';
import { verifyGitHubSignature } from '../utils/crypto.js';

type GitHubReviewer = { login?: string };
type PullRequestWebhookPayload = {
  action?: string;
  repository?: { full_name?: string };
  requested_reviewer?: GitHubReviewer | null;
  pull_request?: {
    number?: number;
    title?: string;
    html_url?: string;
    state?: string;
    draft?: boolean;
    merged?: boolean;
    merged_at?: string | null;
    user?: { login?: string };
    requested_reviewers?: GitHubReviewer[];
  };
};

export const githubRouter = Router();

githubRouter.post('/webhook', async (req: any, res) => {
  try {
    const rawBody = req.rawBody as Buffer;
    const signatureValid = verifyGitHubSignature(
      rawBody,
      req.header('x-hub-signature-256'),
      config.GITHUB_WEBHOOK_SECRET
    );
    if (!signatureValid) return res.status(401).json({ error: 'Invalid GitHub signature' });

    const event = req.header('x-github-event');
    if (event !== 'pull_request') {
      return res.json({ ignored: true, reason: `Unsupported event ${event}` });
    }

    const payload = req.body as PullRequestWebhookPayload;
    const action = payload.action;
    const pullRequest = payload.pull_request;
    const repoFullName = payload.repository?.full_name;
    if (
      !action || !pullRequest || !repoFullName || typeof pullRequest.number !== 'number' ||
      !pullRequest.title || !pullRequest.html_url || !pullRequest.user?.login
    ) {
      return res.status(400).json({ error: 'Invalid pull_request payload' });
    }

    const merged = Boolean(pullRequest.merged || pullRequest.merged_at);
    const isDraft = Boolean(pullRequest.draft);
    const requestedReviewers = extractRequestedReviewers(payload);
    const channelStatus = resolvePullRequestState({ action, isDraft, merged });
    let savedPr = upsertPullRequest({
      repoFullName,
      prNumber: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.html_url,
      authorGithub: pullRequest.user.login,
      state: channelStatus === 'closed' || channelStatus === 'merged' ? channelStatus : 'open',
      isDraft,
      requestedReviewers,
      mergedAt: pullRequest.merged_at ?? null
    });

    if (channelStatus === 'closed' || channelStatus === 'merged') {
      savedPr = markPullRequestFinal(
        repoFullName,
        pullRequest.number,
        channelStatus,
        pullRequest.merged_at ?? null
      ) ?? savedPr;
    }

    const watch = getEnabledRepositoryWatchByFullName(repoFullName);
    let channelNotification = 'not_watched';
    if (watch) {
      const existing = getChannelNotification(savedPr.id, watch.id);
      const decision = decideChannelFeedAction({
        action,
        isDraft,
        merged,
        notifyDrafts: Boolean(watch.notify_drafts),
        hasNotification: Boolean(existing)
      });
      const channelInput = {
        prId: savedPr.id,
        repoFullName: savedPr.repo_full_name,
        prNumber: savedPr.pr_number,
        title: savedPr.title,
        url: savedPr.url,
        authorGithub: savedPr.author_github,
        requestedReviewers,
        state: decision.status,
        isDraft
      };

      if (decision.kind === 'ensure') {
        channelNotification = (await prChannelFeed.ensureNotification(watch, channelInput)).status;
      } else if (decision.kind === 'update') {
        channelNotification = (await prChannelFeed.updateNotificationStatus(watch, channelInput)).status;
      } else {
        channelNotification = 'unchanged';
      }
    }

    const assignments = [];
    if (action !== 'closed') {
      for (const reviewerGithub of requestedReviewers) {
        const assignment = createOrKeepAssignment(savedPr.id, reviewerGithub);
        assignments.push(assignment);
        await sendReviewDm({
          assignmentId: assignment.id,
          reviewerGithub,
          prTitle: savedPr.title,
          prUrl: savedPr.url,
          repoFullName: savedPr.repo_full_name,
          prNumber: savedPr.pr_number,
          authorGithub: savedPr.author_github,
          assignedAt: assignment.assigned_at
        });
      }
    }

    return res.json({ ok: true, action, assignments, channelNotification });
  } catch (error) {
    console.error('[github] webhook error:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
