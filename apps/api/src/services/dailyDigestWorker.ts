import { config, githubToken } from '../config.js';
import { runDailyDigestIfDue } from './dailyDigest.js';
import { getLastDailyDigestDate, recordDailyDigestSent } from './dailyDigestRuns.js';
import { fetchOpenPullRequests, parseMonitoredRepositories } from './githubPullRequests.js';
import { postDailyDigest } from './slack.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startDailyDigestWorker(): void {
  if (!config.DAILY_DIGEST_ENABLED || timer) return;

  const reviewerGithub = config.DAILY_DIGEST_REVIEWER_GITHUB;
  const repositoriesValue = config.DAILY_DIGEST_REPOSITORIES;
  const channelId = config.DAILY_DIGEST_CHANNEL_ID;
  if (!githubToken || !reviewerGithub || !repositoriesValue || !channelId) {
    throw new Error('Daily digest is enabled but its required configuration is missing');
  }
  const repositories = parseMonitoredRepositories(repositoriesValue);
  const settings = { githubToken, reviewerGithub, channelId };

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const result = await runDailyDigestIfDue(
        {
          now: new Date(),
          timeZone: config.DAILY_DIGEST_TIMEZONE,
          scheduledTime: config.DAILY_DIGEST_TIME,
          lastSentDate: getLastDailyDigestDate(),
          reviewerGithub: settings.reviewerGithub
        },
        {
          fetchPullRequests: () => fetchOpenPullRequests(repositories, settings.githubToken),
          postDigest: (message) => postDailyDigest(settings.channelId, message),
          recordSent: async (localDate, openPrCount) => recordDailyDigestSent(localDate, openPrCount)
        }
      );

      if (result.status === 'sent') {
        console.log(`[daily-digest] Sent ${result.openPrCount} open PRs for ${result.localDate}`);
      } else if (result.status === 'post_failed') {
        console.warn(`[daily-digest] Slack rejected the digest for ${result.localDate}; it will be retried`);
      }
    } catch (error) {
      console.error('[daily-digest] Worker failed:', error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  }

  const intervalMs = config.DAILY_DIGEST_WORKER_SECONDS * 1000;
  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
  console.log(
    `[daily-digest] Monitoring ${repositories.length} repositories at ${config.DAILY_DIGEST_TIME} ${config.DAILY_DIGEST_TIMEZONE}`
  );
}
