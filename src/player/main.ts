export {};
const app = document.getElementById('app')!;
const API = `${location.protocol}//${location.host}`;

let playerId = localStorage.getItem('ms_playerId') || crypto.randomUUID();
localStorage.setItem('ms_playerId', playerId);

let nickname = '';
let alive = true;
let pollInterval: number | null = null;

// Start
init();

async function init() {
  // Try reconnect
  const res = await fetch(`${API}/api/status?playerId=${playerId}`).then(r => r.json()).catch(() => null);
  if (res?.player) {
    nickname = res.player.nickname;
    alive = res.player.alive;
    if (res.state === 'LOBBY') renderWaiting();
    else if (!alive) renderEliminated();
    else renderPlaying(res);
    startPolling();
  } else {
    renderJoin();
  }
}

function renderJoin() {
  app.innerHTML = `
    <div class="title">소수결 서바이벌</div>
    <input type="text" id="nickname" placeholder="닉네임 (최대 10자)" maxlength="10">
    <button class="btn btn-primary" id="joinBtn">참가하기</button>
  `;
  document.getElementById('joinBtn')!.onclick = join;
  document.getElementById('nickname')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') join();
  });
}

async function join() {
  const input = document.getElementById('nickname') as HTMLInputElement;
  const name = input.value.trim();
  if (!name) return;

  const res = await fetch(`${API}/api/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, nickname: name }),
  }).then(r => r.json()).catch(() => null);

  if (res?.success) {
    nickname = res.player.nickname;
    renderWaiting();
    startPolling();
  }
}

function renderWaiting() {
  app.innerHTML = `
    <div class="title">소수결 서바이벌</div>
    <div class="nickname-display">${nickname}</div>
    <div class="status">곧 시작합니다!</div>
  `;
}

let currentChoices: string[] = [];
let currentPrompt = '';
let voted = false;
let timerInterval: number | null = null;
let timeLeft = 0;

function renderPlaying(data: { currentChoices: string[]; currentPrompt?: string; state: string; remainingTime?: number }) {
  if (data.currentChoices.length === 0) {
    renderWaiting();
    return;
  }
  currentChoices = data.currentChoices;
  currentPrompt = data.currentPrompt ?? '';
  voted = false;
  timeLeft = data.remainingTime ?? 0;
  renderChoices();
  startPlayerCountdown();
}

function renderChoices() {
  app.innerHTML = `
    <div class="timer" id="timer">${timeLeft > 0 ? timeLeft : ''}</div>
    <div class="nickname-display">${nickname}</div>
    ${currentPrompt ? `<div class="prompt">${currentPrompt}</div>` : ''}
    ${currentChoices.map((c, i) => `
      <button class="btn btn-choice" data-idx="${i}">${c}</button>
    `).join('')}
    ${voted ? '<div class="status">선택 완료! ✓</div>' : ''}
  `;

  if (!voted) {
    app.querySelectorAll('.btn-choice').forEach(btn => {
      btn.addEventListener('click', () => vote(parseInt((btn as HTMLElement).dataset.idx!)));
    });
  }
}

function startPlayerCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    timeLeft--;
    const el = document.getElementById('timer');
    if (el) el.textContent = timeLeft > 0 ? String(timeLeft) : '마감!';
    if (timeLeft <= 0 && timerInterval) clearInterval(timerInterval);
  }, 1000);
}

async function vote(choice: number, retries = 3) {
  voted = true;
  // Optimistic UI
  renderChoices();
  app.querySelectorAll('.btn-choice').forEach((btn, i) => {
    (btn as HTMLButtonElement).disabled = true;
    if (i === choice) btn.classList.add('selected');
  });

  try {
    const res = await fetch(`${API}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, choice }),
    }).then(r => r.json());

    // Only retry on network-level issues, not server rejections
    if (!res.success && res.reason && retries > 0) {
      // Don't retry for explicit server rejections
      // (paused, eliminated, invalid_choice, not_active)
    }
  } catch {
    // Network error: retry
    if (retries > 0) setTimeout(() => vote(choice, retries - 1), 1000);
  }
}

function renderEliminated() {
  app.innerHTML = `
    <div class="title">소수결 서바이벌</div>
    <div class="nickname-display">${nickname}</div>
    <div class="eliminated">탈락했습니다 😢</div>
    <div class="status">관전 모드</div>
  `;
}

function renderWinner() {
  app.innerHTML = `
    <div class="title">소수결 서바이벌</div>
    <div class="winner">🎉 축하합니다! 🎉</div>
    <div class="nickname-display">${nickname}</div>
  `;
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = window.setInterval(async () => {
    try {
      const res = await fetch(`${API}/api/status?playerId=${playerId}`).then(r => r.json());
      handleStatusUpdate(res);
    } catch { /* ignore */ }
  }, 1500);
}

let lastState = '';

function handleStatusUpdate(res: any) {
  if (!res) return;
  const player = res.player;
  if (player) alive = player.alive;

  // Include `alive` in the key so that a restart (which revives the player
  // server-side) is detected and the eliminated/winner screen is refreshed
  // automatically — no manual page reload needed.
  const stateKey = `${res.state}-${res.roundNum}-${alive}`;
  if (stateKey === lastState) return;
  lastState = stateKey;

  if (res.state === 'END') {
    // NOTE: keep polling alive here. When the operator picks "같은 인원으로 다시"
    // the server returns to LOBBY and starts a new game; polling must stay on so
    // the client transitions out of the winner/eliminated screen by itself.
    if (timerInterval) clearInterval(timerInterval);
    if (alive) renderWinner();
    else renderEliminated();
    return;
  }

  if (!alive) {
    if (timerInterval) clearInterval(timerInterval);
    renderEliminated();
    return;
  }

  if (res.state === 'LOBBY') {
    renderWaiting();
  } else if (res.state === 'ROUND_ACTIVE' || res.state === 'ROUND_BLIND' || res.state === 'FINAL_ACTIVE') {
    currentChoices = res.currentChoices;
    currentPrompt = res.currentPrompt ?? '';
    voted = false;
    timeLeft = res.remainingTime ?? 0;
    renderChoices();
    startPlayerCountdown();
  } else if (res.state === 'ROUND_RESULT' || res.state === 'FINAL_RESULT') {
    if (timerInterval) clearInterval(timerInterval);
    app.innerHTML = `
      <div class="title">소수결 서바이벌</div>
      <div class="nickname-display">${nickname}</div>
      <div class="status">결과 확인 중...</div>
    `;
  }
}
