const apiUrl = document.getElementById('apiUrl') as HTMLInputElement;
const token = document.getElementById('token') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLElement;
const save = document.getElementById('save') as HTMLButtonElement;

chrome.storage.sync.get(['apiUrl', 'token'], (data) => {
  apiUrl.value = data.apiUrl ?? 'http://localhost:4000';
  token.value = data.token ?? '';
});

save.addEventListener('click', async () => {
  await chrome.storage.sync.set({ apiUrl: apiUrl.value.replace(/\/$/, ''), token: token.value });
  statusEl.textContent = 'Saved.';
});
