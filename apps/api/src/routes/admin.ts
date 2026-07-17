import { Router, type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { upsertUserByGithub, listUsers } from '../services/users.js';
import {
  createRepositoryWatch,
  DuplicateRepositoryWatchError,
  listRepositoryWatches,
  RepositoryWatchNotFoundError,
  updateRepositoryWatch
} from '../services/repositoryWatches.js';
import { normalizeRepositoryFullName, normalizeSlackChannelId } from '../services/repositoryWatchRules.js';
import {
  assertRepositorySyncConfigured,
  RepositorySyncConfigurationError,
  RepositorySyncDisabledError,
  syncRepositoryWatchById
} from '../services/repositorySyncRuntime.js';

export const adminRouter = Router();

// Bearer-token gate for all admin endpoints. Refuses outright if no token is configured.
function requireAdmin(req: Request, res: Response, next: NextFunction) {
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

function isValidRepository(value: string): boolean {
  try {
    normalizeRepositoryFullName(value);
    return true;
  } catch {
    return false;
  }
}

function isValidSlackChannel(value: string): boolean {
  try {
    normalizeSlackChannelId(value);
    return true;
  } catch {
    return false;
  }
}

const repositoryNameSchema = z.string().trim().refine(isValidRepository, 'Expected owner/repository');
const slackChannelSchema = z.string().trim().refine(isValidSlackChannel, 'Expected a Slack channel ID');
const createRepositorySchema = z.object({
  repoFullName: repositoryNameSchema,
  slackChannelId: slackChannelSchema,
  enabled: z.boolean().default(true),
  notifyDrafts: z.boolean().default(false),
  syncNow: z.boolean().default(false)
}).strict();
const updateRepositorySchema = z.object({
  repoFullName: repositoryNameSchema.optional(),
  slackChannelId: slackChannelSchema.optional(),
  enabled: z.boolean().optional(),
  notifyDrafts: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

function repositoryErrorResponse(error: unknown, res: Response): Response {
  if (error instanceof RepositoryWatchNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof DuplicateRepositoryWatchError) return res.status(409).json({ error: error.message });
  if (error instanceof RepositorySyncConfigurationError) return res.status(503).json({ error: error.message });
  if (error instanceof RepositorySyncDisabledError) return res.status(409).json({ error: error.message });
  console.error('[admin] Repository operation failed:', error instanceof Error ? error.message : error);
  return res.status(500).json({ error: 'Repository operation failed' });
}

adminRouter.get('/repositories', (_req, res) => {
  res.json({ repositories: listRepositoryWatches() });
});

adminRouter.post('/repositories', async (req, res) => {
  const parsed = createRepositorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid repository payload' });

  try {
    if (parsed.data.syncNow) assertRepositorySyncConfigured();
    const repository = createRepositoryWatch(parsed.data);
    if (!parsed.data.syncNow) return res.status(201).json({ repository });

    try {
      const sync = await syncRepositoryWatchById(repository.id);
      return res.status(201).json({ repository, sync });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initial synchronization failed';
      return res.status(201).json({ repository, sync: null, syncError: message });
    }
  } catch (error) {
    return repositoryErrorResponse(error, res);
  }
});

adminRouter.patch('/repositories/:id', (req, res) => {
  const parsed = updateRepositorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid repository payload' });
  try {
    return res.json({ repository: updateRepositoryWatch(req.params.id, parsed.data) });
  } catch (error) {
    return repositoryErrorResponse(error, res);
  }
});

adminRouter.post('/repositories/:id/sync', async (req, res) => {
  try {
    return res.json(await syncRepositoryWatchById(req.params.id));
  } catch (error) {
    if (error instanceof RepositorySyncConfigurationError || error instanceof RepositorySyncDisabledError) {
      return repositoryErrorResponse(error, res);
    }
    if (error instanceof RepositoryWatchNotFoundError) return repositoryErrorResponse(error, res);
    console.warn('[admin] Repository sync failed:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'Repository synchronization failed' });
  }
});
