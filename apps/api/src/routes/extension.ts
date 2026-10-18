import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getUserById } from '../services/users.js';
import { pendingForGithub, markAssignmentStatus, snoozeAssignment, getAssignmentWithPr } from '../services/prs.js';
import { verifyExtensionJwt } from '../utils/auth.js';
import { getMessageTone, getOverlayCopy, getWaitingMinutes } from '../services/messageTemplates.js';

export const extensionRouter = Router();

function auth(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  const decoded = verifyExtensionJwt(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });
  const user = getUserById(decoded.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}

// 404 (not 403) for foreign ids so callers cannot probe which assignment ids exist.
function ownAssignment(req: any, res: any, next: any) {
  const row = getAssignmentWithPr(req.params.id) as { reviewer_github: string } | undefined;
  if (!row || row.reviewer_github !== req.user.github_username) return res.status(404).json({ error: 'Assignment not found' });
  next();
}

extensionRouter.get('/me', auth, (req: any, res) => {
  res.json({ githubUsername: req.user.github_username, displayName: req.user.display_name, pollSeconds: config.OVERLAY_POLL_SECONDS });
});

extensionRouter.get('/prs', auth, (req: any, res) => {
  const prs = pendingForGithub(req.user.github_username).map((pr: any) => {
    const waitingMinutes = getWaitingMinutes(pr.assigned_at);
    return {
      ...pr,
      waiting_minutes: waitingMinutes,
      message_tone: getMessageTone(waitingMinutes),
      overlay_copy: getOverlayCopy({
        title: pr.title,
        url: pr.url,
        repoFullName: pr.repo_full_name,
        prNumber: pr.pr_number,
        authorGithub: pr.author_github,
        waitingMinutes
      })
    };
  });
  res.json({ prs });
});

extensionRouter.post('/assignments/:id/ack', auth, ownAssignment, (req, res) => {
  const row = markAssignmentStatus(req.params.id, 'acknowledged');
  res.json({ assignment: row });
});

extensionRouter.post('/assignments/:id/complete', auth, ownAssignment, (req, res) => {
  const row = markAssignmentStatus(req.params.id, 'completed');
  res.json({ assignment: row });
});

extensionRouter.post('/assignments/:id/snooze', auth, ownAssignment, (req, res) => {
  const body = z.object({ minutes: z.number().min(5).max(1440).default(config.DEFAULT_SNOOZE_MINUTES) }).parse(req.body ?? {});
  const row = snoozeAssignment(req.params.id, body.minutes);
  res.json({ assignment: row });
});
