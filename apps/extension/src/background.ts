export {};

type PendingPr = {
  assignment_id: string;
  title: string;
  url: string;
  repo_full_name: string;
  pr_number: number;
  author_github: string;
  assigned_at: string;
};

async function getConfig(): Promise<{ apiUrl?: string; token?: string }> {
  return chrome.storage.sync.get(['apiUrl', 'token']);
}

async function fetchPending(): Promise<PendingPr[]> {
  const { apiUrl, token } = await getConfig();
  if (!apiUrl || !token) return [];
  const res = await fetch(`${apiUrl}/extension/prs`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.prs ?? [];
}

async function broadcastPending() {
  const prs = await fetchPending();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'PRSIGNAL_PENDING', prs }).catch(() => undefined);
  }
  if (prs.length > 0) {
    chrome.action.setBadgeText({ text: String(prs.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('poll-prs', { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll-prs') broadcastPending();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PRSIGNAL_REFRESH') {
    broadcastPending().then(() => sendResponse({ ok: true }));
    return true;
  }
});
