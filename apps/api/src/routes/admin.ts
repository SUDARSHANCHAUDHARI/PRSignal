import { Router } from 'express';
import { z } from 'zod';
import { upsertUserByGithub, listUsers } from '../services/users.js';

export const adminRouter = Router();

adminRouter.get('/users', (_req, res) => {
  res.json({ users: listUsers() });
});

adminRouter.post('/users', (req, res) => {
  const body = z.object({
    githubUsername: z.string().min(1),
    slackUserId: z.string().optional(),
    displayName: z.string().optional()
  }).parse(req.body);

  const user = upsertUserByGithub(body);
  res.json({ user, extensionToken: user.extension_token });
});
