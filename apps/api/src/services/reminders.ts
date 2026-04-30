import { config } from '../config.js';
import { formatWaiting, getWaitingMinutes } from './messageTemplates.js';
import { pendingAssignmentsForReminder, touchAssignmentReminded } from './prs.js';
import { postEscalation, sendReviewReminderDm } from './slack.js';

let timer: NodeJS.Timeout | null = null;

export function startReminderWorker() {
  if (timer) return;

  const intervalMs = Math.max(60, config.REMINDER_WORKER_SECONDS) * 1000;

  async function tick() {
    const due = pendingAssignmentsForReminder(config.REMINDER_AFTER_MINUTES) as Array<any>;

    for (const item of due) {
      const waitingMinutes = getWaitingMinutes(item.assigned_at);

      const sent = await sendReviewReminderDm({
        assignmentId: item.assignment_id,
        reviewerGithub: item.reviewer_github,
        prTitle: item.title,
        prUrl: item.url,
        repoFullName: item.repo_full_name,
        prNumber: item.pr_number,
        authorGithub: item.author_github,
        assignedAt: item.assigned_at,
        reminderCount: item.reminder_count
      });

      if (sent) touchAssignmentReminded(item.assignment_id);

      if (waitingMinutes >= config.ESCALATION_MINUTES) {
        await postEscalation({
          reviewerGithub: item.reviewer_github,
          prTitle: item.title,
          prUrl: item.url,
          waitingText: formatWaiting(waitingMinutes)
        });
      }
    }
  }

  timer = setInterval(() => {
    tick().catch((error) => console.error('[reminders] worker failed', error));
  }, intervalMs);

  tick().catch((error) => console.error('[reminders] initial worker failed', error));
  console.log(`[reminders] worker running every ${config.REMINDER_WORKER_SECONDS}s`);
}
