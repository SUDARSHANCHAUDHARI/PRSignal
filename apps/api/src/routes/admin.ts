import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { upsertUserByGithub, listUsers } from '../services/users.js';

export const adminRouter = Router();

// Bearer-token gate for all admin endpoints. Refuses outright if no token is configured.
function requireAdmin(req: any, res: any, next: any) {
  const configured = config.ADMIN_API_TOKEN;
  if (!configured) return res.status(503).json({ error: 'Admin API is not configured' });

  const header = req.headers.authorization;
  const provided = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!provided) return res.status(401).json({ error: 'Missing admin token' });

  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }

  next();
}

adminRouter.use(requireAdmin);

adminRouter.get('/users', (_req, res) => {
  // Never expose extension tokens in a list response.
  const users = listUsers().map(({ extension_token, ...rest }) => rest);
  res.json({ users });
});

adminRouter.post('/users', (req, res) => {
  let body;
  try {
    body = z
      .object({
        githubUsername: z.string().min(1),
        slackUserId: z.string().optional(),
        displayName: z.string().optional()
      })
      .parse(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid user payload' });
  }

  const user = upsertUserByGithub(body);
  const { extension_token, ...safe } = user;
  // The token is returned exactly once, here, for provisioning the extension.
  res.json({ user: safe, extensionToken: extension_token });
});
