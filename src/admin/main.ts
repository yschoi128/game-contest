export {};
const API = `${location.protocol}//${location.host}/api/admin`;
const statusEl = document.getElementById('status')!;
const controlsEl = document.getElementById('controls')!;
const customInput = document.getElementById('customChoices') as HTMLInputElement;

async function api(path: string, body?: any) {
  const opts: RequestInit = { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${API}${path}`, opts).then(r => r.json());
}

async function refresh() {
  const s = await api('/status');
  statusEl.innerHTML = `
    <p><strong>상태:</strong> ${s.state}</p>
    <p><strong>라운드:</strong> ${s.roundNum}</p>
    <p><strong>생존자:</strong> ${s.survivorCount}명 / 전체 ${s.totalPlayers}명</p>
    <p><strong>페이즈:</strong> ${s.phase}</p>
    <p><strong>일시정지:</strong> ${s.paused ? '⏸ 예' : '아니오'}</p>
  `;
  renderControls(s.state);
}

function renderControls(state: string) {
  const btns: string[] = [];

  if (state === 'LOBBY') {
    btns.push(`<button class="btn btn-green" onclick="doStart()">🎬 게임 시작</button>`);
  }
  if (state === 'ROUND_RESULT' || state === 'FINAL_RESULT') {
    btns.push(`<button class="btn btn-green" onclick="doNext()">▶ 다음 라운드</button>`);
    btns.push(`<button class="btn btn-blue" onclick="doNextCustom()">✏️ 즉석 선택지로 다음</button>`);
  }
  if (state === 'ROUND_ACTIVE' || state === 'ROUND_BLIND' || state === 'FINAL_ACTIVE') {
    btns.push(`<button class="btn btn-yellow" onclick="doPause()">⏸ 일시정지</button>`);
    btns.push(`<button class="btn btn-yellow" onclick="doInvalidate()">🚫 라운드 무효</button>`);
  }
  btns.push(`<button class="btn btn-red" onclick="doEnd()">⛔ 강제 종료</button>`);

  controlsEl.innerHTML = btns.join('');
}

// Expose to global for inline onclick
(window as any).doStart = async () => { await api('/start', {}); refresh(); };
(window as any).doNext = async () => { await api('/next', {}); refresh(); };
(window as any).doNextCustom = async () => {
  const raw = customInput.value.trim();
  if (!raw) return;
  const choices = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (choices.length < 2) return;
  await api('/next', { choices });
  customInput.value = '';
  refresh();
};
(window as any).doPause = async () => { await api('/pause', {}); refresh(); };
(window as any).doInvalidate = async () => { await api('/invalidate', {}); refresh(); };
(window as any).doEnd = async () => { if (confirm('정말 강제 종료?')) { await api('/end', {}); refresh(); } };

// Poll status
refresh();
setInterval(refresh, 2000);
