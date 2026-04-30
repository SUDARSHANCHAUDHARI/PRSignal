# Prompt: Improve PRSignal tone-based notification system

You are working inside the PRSignal Hybrid MVP repo.

Goal:
Improve the message personality system without breaking the working app.

Requirements:
1. Keep all tone logic inside `apps/api/src/services/messageTemplates.ts`.
2. Support five tones: clean, friendly, epic, dramatic, direct.
3. Tone must depend on waiting time.
4. Slack messages and Chrome extension overlay must use the same tone engine.
5. Do not hardcode copy in Slack route or extension unless it is pure presentation fallback.
6. Keep Slack Block Kit messages short and scannable.
7. Keep dramatic/funny copy for later reminders, not immediate first notification.
8. Do not remove Review now, Acknowledge, Snooze 30m, or Mark done actions.
9. Run typecheck before final response.

Desired personality examples:

Epic:
The stars have aligned for this singular moment. :sparkles::telescope:

Dramatic:
I am but a hollow shell of a human in need of a review. My pride is gone; only my PR remains. If you have even the tiniest crumb of mercy left in your heart, please...

Direct:
This PR has been waiting longer than it should. It will not merge itself.

Deliverables:
- Updated messageTemplates.ts
- Updated Slack Block Kit builder if needed
- Updated extension overlay copy if needed
- Short explanation of changes
