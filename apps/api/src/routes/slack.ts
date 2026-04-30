import { Router } from 'express';
import { config } from '../config.js';
import { markAssignmentStatus, snoozeAssignment } from '../services/prs.js';
import { verifySlackSignature } from '../utils/crypto.js';

export const slackRouter = Router();

slackRouter.post('/interactions', async (req: any, res) => {
  try {
    const ok = verifySlackSignature(req.rawBody, req.header('x-slack-request-timestamp'), req.header('x-slack-signature'), config.SLACK_SIGNING_SECRET);
    if (!ok) return res.status(401).send('Invalid Slack signature');

    const payload = JSON.parse(req.body.payload);
    const action = payload.actions?.[0];
    const assignmentId = action?.value;

    if (!action || !assignmentId) return res.status(400).send('Invalid payload');

    if (action.action_id === 'ack_assignment') {
      markAssignmentStatus(assignmentId, 'acknowledged');
      return res.json({ text: 'Acknowledged. The extension will stop blocking until this becomes due again.' });
    }

    if (action.action_id === 'snooze_assignment') {
      snoozeAssignment(assignmentId, config.DEFAULT_SNOOZE_MINUTES);
      return res.json({ text: `Snoozed for ${config.DEFAULT_SNOOZE_MINUTES} minutes.` });
    }

    if (action.action_id === 'review_now') {
      markAssignmentStatus(assignmentId, 'acknowledged');
      return res.status(200).send();
    }

    return res.status(200).send();
  } catch (err) {
    console.error('[slack] interaction error:', err instanceof Error ? err.message : err);
    res.status(500).send('Internal server error');
  }
});
