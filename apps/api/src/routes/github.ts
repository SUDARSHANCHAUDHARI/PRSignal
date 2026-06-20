import { Router } from 'express';
import { config } from '../config.js';
import { verifyGitHubSignature } from '../utils/crypto.js';
import { createOrKeepAssignment, markPrClosed, upsertPullRequest } from '../services/prs.js';
import { sendReviewDm } from '../services/slack.js';
import { extractRequestedReviewers } from '../services/githubEvents.js';

export const githubRouter = Router();

githubRouter.post('/webhook', async (req: any, res) => {
  try {
    const rawBody = req.rawBody as Buffer;
    const ok = verifyGitHubSignature(rawBody, req.header('x-hub-signature-256'), config.GITHUB_WEBHOOK_SECRET);
    if (!ok) return res.status(401).json({ error: 'Invalid GitHub signature' });

    const event = req.header('x-github-event');
    const payload = req.body;

    if (event !== 'pull_request') return res.json({ ignored: true, reason: `Unsupported event ${event}` });

    const action = payload.action as string;
    const pr = payload.pull_request;
    const repo = payload.repository;

    if (!pr || !repo) return res.status(400).json({ error: 'Invalid pull_request payload' });

    if (['closed'].includes(action)) {
      markPrClosed(repo.full_name, pr.number);
      return res.json({ ok: true, action });
    }

    const savedPr = upsertPullRequest({
      repoFullName: repo.full_name,
      prNumber: pr.number,
      title: pr.title,
      url: pr.html_url,
      authorGithub: pr.user.login,
      state: pr.state
    });

    const reviewers = extractRequestedReviewers(payload);

    const assignments = [];
    for (const reviewerGithub of reviewers) {
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

    res.json({ ok: true, action, assignments });
  } catch (err) {
    console.error('[github] webhook error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
