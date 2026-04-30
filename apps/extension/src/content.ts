type OverlayCopy = {
  tone: 'clean' | 'friendly' | 'epic' | 'dramatic' | 'direct';
  headline: string;
  message: string;
  waiting: string;
  title: string;
  ticket?: string;
};

type PendingPr = {
  assignment_id: string;
  title: string;
  url: string;
  repo_full_name: string;
  pr_number: number;
  author_github: string;
  assigned_at: string;
  waiting_minutes?: number;
  message_tone?: string;
  overlay_copy?: OverlayCopy;
};

let currentPr: PendingPr | null = null;

async function getConfig(): Promise<{ apiUrl?: string; token?: string }> {
  return chrome.storage.sync.get(['apiUrl', 'token']);
}

async function apiPost(path: string, body: unknown = {}) {
  const { apiUrl, token } = await getConfig();
  if (!apiUrl || !token) throw new Error('PRSignal is not configured');
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function removeOverlay() {
  document.getElementById('prsignal-overlay')?.remove();
  currentPr = null;
}

function fallbackCopy(pr: PendingPr): OverlayCopy {
  return {
    tone: 'clean',
    headline: 'PR waiting for your review',
    message: 'You were requested as a reviewer. Choose one action so the team knows what is happening.',
    waiting: 'unknown',
    title: pr.title
  };
}

function showOverlay(pr: PendingPr) {
  if (currentPr?.assignment_id === pr.assignment_id && document.getElementById('prsignal-overlay')) return;
  currentPr = pr;
  removeOverlay();
  currentPr = pr;

  const copy = pr.overlay_copy ?? fallbackCopy(pr);
  const overlay = document.createElement('div');
  overlay.id = 'prsignal-overlay';
  overlay.dataset.tone = copy.tone;
  overlay.innerHTML = `
    <div id="prsignal-card" data-tone="${escapeHtml(copy.tone)}">
      <div class="prsignal-kicker">PRSignal · ${escapeHtml(copy.tone.toUpperCase())} MODE</div>
      <h1>${headlineEmoji(copy.tone)} ${escapeHtml(copy.headline)}</h1>
      <p>${escapeHtml(copy.message)}</p>
      <div class="prsignal-meta">
        <strong>${escapeHtml(copy.title)}</strong><br />
        Repo: ${escapeHtml(pr.repo_full_name)} · PR #${pr.pr_number}<br />
        Author: @${escapeHtml(pr.author_github)}<br />
        Waiting: ${escapeHtml(copy.waiting)}
      </div>
      <div class="prsignal-actions">
        <button class="prsignal-primary" id="prsignal-review">Review now</button>
        <button class="prsignal-secondary" id="prsignal-snooze">Snooze 30m</button>
        <button class="prsignal-secondary" id="prsignal-ack">Acknowledge</button>
        <button class="prsignal-danger" id="prsignal-complete">Mark done</button>
      </div>
      <div class="prsignal-small">This overlay uses tone rotation. Early = clean, late = dramatic/direct. Snooze if you are busy.</div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('prsignal-review')?.addEventListener('click', async () => {
    await apiPost(`/extension/assignments/${pr.assignment_id}/ack`);
    window.open(pr.url, '_blank', 'noopener,noreferrer');
    removeOverlay();
    chrome.runtime.sendMessage({ type: 'PRSIGNAL_REFRESH' });
  });
  document.getElementById('prsignal-snooze')?.addEventListener('click', async () => {
    await apiPost(`/extension/assignments/${pr.assignment_id}/snooze`, { minutes: 30 });
    removeOverlay();
    chrome.runtime.sendMessage({ type: 'PRSIGNAL_REFRESH' });
  });
  document.getElementById('prsignal-ack')?.addEventListener('click', async () => {
    await apiPost(`/extension/assignments/${pr.assignment_id}/ack`);
    removeOverlay();
    chrome.runtime.sendMessage({ type: 'PRSIGNAL_REFRESH' });
  });
  document.getElementById('prsignal-complete')?.addEventListener('click', async () => {
    await apiPost(`/extension/assignments/${pr.assignment_id}/complete`);
    removeOverlay();
    chrome.runtime.sendMessage({ type: 'PRSIGNAL_REFRESH' });
  });
}

function headlineEmoji(tone: OverlayCopy['tone']) {
  switch (tone) {
    case 'epic': return '✨';
    case 'dramatic': return '🥀';
    case 'direct': return '🚨';
    case 'friendly': return '👀';
    default: return '🔔';
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] ?? c));
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'PRSIGNAL_PENDING') return;
  const prs = message.prs as PendingPr[];
  if (!prs || prs.length === 0) return removeOverlay();
  showOverlay(prs[0]);
});

chrome.runtime.sendMessage({ type: 'PRSIGNAL_REFRESH' });
