import { config, githubToken } from '../config.js';
import { syncAllEnabledRepositoryWatches } from './repositorySyncRuntime.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startRepositorySyncWorker(): void {
  if (!config.PR_SYNC_ENABLED || timer) return;
  if (!githubToken) {
    console.warn('[pr-sync] PR_SYNC_ENABLED=true but GITHUB_TOKEN is not configured; worker disabled');
    return;
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const results = await syncAllEnabledRepositoryWatches();
      for (const item of results) {
        if (item.result) {
          console.log(
            `[pr-sync] ${item.repository}: found=${item.result.found} created=${item.result.created} updated=${item.result.updated} skipped=${item.result.skipped} failed=${item.result.failed}`
          );
        } else {
          console.warn(`[pr-sync] ${item.repository}: ${item.error ?? 'synchronization failed'}`);
        }
      }
    } catch (error) {
      console.error('[pr-sync] Worker failed:', error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  }

  const intervalMs = Math.max(60, config.PR_SYNC_INTERVAL_SECONDS) * 1000;
  timer = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();
  console.log(`[pr-sync] Worker running every ${config.PR_SYNC_INTERVAL_SECONDS}s`);
}
