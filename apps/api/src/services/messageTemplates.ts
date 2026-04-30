export type MessageTone = 'clean' | 'friendly' | 'epic' | 'dramatic' | 'direct';

export type PrMessageInput = {
  title: string;
  url: string;
  repoFullName: string;
  prNumber: number;
  authorGithub: string;
  reviewerGithub?: string;
  waitingMinutes?: number;
};

export function getWaitingMinutes(assignedAt?: string | Date | null) {
  if (!assignedAt) return 0;
  const assigned = assignedAt instanceof Date ? assignedAt : new Date(assignedAt);
  const diff = Date.now() - assigned.getTime();
  if (Number.isNaN(diff) || diff < 0) return 0;
  return Math.floor(diff / 60_000);
}

export function formatWaiting(minutes = 0) {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function getMessageTone(waitingMinutes = 0): MessageTone {
  if (waitingMinutes < 30) return 'clean';
  if (waitingMinutes < 90) return 'friendly';
  if (waitingMinutes < 180) return 'epic';
  if (waitingMinutes < 360) return 'dramatic';
  return 'direct';
}

export function summarizeTitle(title: string) {
  const [ticketPart, ...rest] = title.split(':');
  const hasTicket = /^[A-Z]+-[0-9]+$/i.test(ticketPart.trim());
  return {
    ticket: hasTicket ? ticketPart.trim() : undefined,
    summary: hasTicket ? rest.join(':').trim() || title : title
  };
}

export function getSlackIntro(tone: MessageTone) {
  switch (tone) {
    case 'clean':
      return ':eyes: *PR review requested*';
    case 'friendly':
      return ':bell: *Small PR nudge*';
    case 'epic':
      return ':sparkles::telescope: *The stars have aligned for this singular moment.*';
    case 'dramatic':
      return ':wilted_flower::headstone: *I am but a hollow shell of a human in need of a review.*';
    case 'direct':
      return ':rotating_light: *This PR is blocked on review.*';
  }
}

export function getSlackBody(input: PrMessageInput, tone: MessageTone) {
  const waiting = formatWaiting(input.waitingMinutes ?? 0);
  const { ticket, summary } = summarizeTitle(input.title);
  const titleLine = ticket ? `*${ticket}:* ${summary}` : `*${input.title}*`;

  switch (tone) {
    case 'clean':
      return `${titleLine}\nRepository: \`${input.repoFullName}\` · PR #${input.prNumber}\nAuthor: @${input.authorGithub}\nWaiting: ${waiting}`;
    case 'friendly':
      return `${titleLine}\nThis one is waiting for your eyes. A quick ack, snooze, or review keeps the team unblocked.\nWaiting: ${waiting}`;
    case 'epic':
      return `${titleLine}\nA review has appeared at the exact point where destiny, CI, and caffeine intersect.\nWaiting: ${waiting}`;
    case 'dramatic':
      return `${titleLine}\nMy pride is gone; only my PR remains. If you have even the tiniest crumb of mercy left, please review.\nWaiting: ${waiting}`;
    case 'direct':
      return `${titleLine}\nReviewer: ${input.reviewerGithub ? `@${input.reviewerGithub}` : 'you'}\nWaiting: ${waiting}\nThis is now past the comfortable review window.`;
  }
}

export function getOverlayCopy(input: PrMessageInput & { assignedAt?: string }) {
  const waitingMinutes = input.waitingMinutes ?? getWaitingMinutes(input.assignedAt);
  const tone = getMessageTone(waitingMinutes);
  const waiting = formatWaiting(waitingMinutes);
  const { ticket, summary } = summarizeTitle(input.title);

  const base = {
    tone,
    waiting,
    ticket,
    title: ticket ? `${ticket}: ${summary}` : input.title
  };

  switch (tone) {
    case 'clean':
      return { ...base, headline: 'PR waiting for your review', message: 'You were requested as a reviewer. Choose one action so the team knows what is happening.' };
    case 'friendly':
      return { ...base, headline: 'Tiny PR nudge', message: 'This PR is waiting for your eyes. Review now, snooze it, or acknowledge it so nobody has to guess.' };
    case 'epic':
      return { ...base, headline: 'The stars have aligned', message: 'A review moment has appeared. Be the hero this PR deserves.' };
    case 'dramatic':
      return { ...base, headline: 'Only the PR remains', message: 'I am but a hollow shell of a human in need of a review. Please show mercy.' };
    case 'direct':
      return { ...base, headline: 'PR blocked on review', message: 'This has waited long enough. Review, snooze, or mark it done.' };
  }
}
