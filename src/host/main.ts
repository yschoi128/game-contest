export {};
const app = document.getElementById('app')!;

let ws: WebSocket;
let timerInterval: number | null = null;
let timeLeft = 0;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connect, 2000);
}

function handleMessage(msg: any) {
  switch (msg.type) {
    case 'state_sync':
      handleStateSync(msg);
      break;
    case 'player_joined':
      renderLobby({ totalPlayers: msg.count, nickname: msg.nickname });
      break;
    case 'round_start':
      renderRound(msg);
      break;
    case 'vote_update':
      updateBars(msg.counts);
      break;
    case 'round_result':
      renderResult(msg);
      break;
    case 'round_invalid':
      renderInvalid(msg.reason);
      break;
    case 'game_end':
      renderWinner(msg);
      break;
    case 'pause':
      if (msg.paused) showPaused();
      else removePaused();
      break;
  }
}

function handleStateSync(msg: any) {
  const { state, data } = msg;
  if (state === 'LOBBY') {
    lobbyNicknames = data?.nicknames ?? [];
    lobbyCount = data?.totalPlayers ?? 0;
    renderLobby({ totalPlayers: lobbyCount });
  } else if (state === 'ROUND_BLIND') {
    showBlind();
  } else if (state === 'ROUND_CLOSED') {
    showClosed();
  } else if (state === 'ROUND_ACTIVE' || state === 'FINAL_ACTIVE') {
    if (data?.currentRound) {
      renderRound({
        roundNum: data.currentRound.roundNum,
        choices: data.currentRound.choices,
        timeLimit: data.remainingTime ?? data.currentRound.timeLimit,
        phase: data.currentRound.phase,
      });
      if (data.votes && state === 'ROUND_ACTIVE') updateBars(data.votes);
    }
  } else if (state === 'ROUND_RESULT' || state === 'FINAL_RESULT') {
    if (data?.currentRound) {
      currentChoices = data.currentRound.choices;
    }
    renderResult({ survivors: [], eliminated: [], choiceCounts: data?.votes ?? [] });
  } else if (state === 'END') {
    renderWinner({ winner: null, rankings: [] });
  }
}

let lobbyCount = 0;
let lobbyNicknames: string[] = [];

function renderLobby(data: any) {
  if (data.totalPlayers !== undefined) lobbyCount = data.totalPlayers;
  if (data.nickname) lobbyNicknames.push(data.nickname);
  // Keep max 50 nicknames displayed
  if (lobbyNicknames.length > 50) lobbyNicknames = lobbyNicknames.slice(-50);

  const port = location.port ? `:${location.port}` : '';
  const url = `${location.protocol}//${location.hostname}${port}/player/`;
  app.innerHTML = `
    <div class="title">소수결 서바이벌</div>
    <div class="subtitle">스마트폰으로 접속하세요</div>
    <div class="subtitle">${url}</div>
    <div class="count">${lobbyCount}명</div>
    <div class="nicknames">${lobbyNicknames.join(' · ')}</div>
  `;
}

let currentChoices: string[] = [];
let barCounts: number[] = [];
let isBlind = false;

function renderRound(data: { roundNum: number; choices: string[]; timeLimit: number; phase: string }) {
  currentChoices = data.choices;
  barCounts = new Array(data.choices.length).fill(0);
  isBlind = false;
  timeLeft = data.timeLimit;

  const phaseLabel = data.phase === 'final' ? '🏆 결승' : data.phase === 'sudden_death' ? '⚡ 서든데스' : '';

  app.innerHTML = `
    ${phaseLabel ? `<div class="phase-badge">${phaseLabel}</div>` : ''}
    <div class="round-num">Round ${data.roundNum}</div>
    <div class="timer" id="timer">${timeLeft}</div>
    <div class="choices" id="choices">
      ${data.choices.map((c, i) => `
        <div class="choice-bar">
          <div class="choice-label">${c}</div>
          <div class="bar-container"><div class="bar-fill" id="bar-${i}" style="height:0%"></div></div>
          <div class="bar-count" id="count-${i}">0</div>
        </div>
      `).join('')}
    </div>
  `;

  startCountdown();
}

function startCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    timeLeft--;
    const el = document.getElementById('timer');
    if (el) el.textContent = String(Math.max(0, timeLeft));
    if (timeLeft <= 0 && timerInterval) clearInterval(timerInterval);
  }, 1000);
}

function updateBars(counts: number[]) {
  if (isBlind) return;
  barCounts = counts;
  const max = Math.max(...counts, 1);
  counts.forEach((c, i) => {
    const bar = document.getElementById(`bar-${i}`);
    const countEl = document.getElementById(`count-${i}`);
    if (bar) bar.style.height = `${(c / max) * 100}%`;
    if (countEl) countEl.textContent = String(c);
  });
}

function showBlind() {
  isBlind = true;
  currentChoices.forEach((_, i) => {
    const countEl = document.getElementById(`count-${i}`);
    if (countEl) countEl.textContent = '???';
    const bar = document.getElementById(`bar-${i}`);
    if (bar) bar.style.height = '50%';
    if (bar) bar.style.background = '#555';
  });
}

function showClosed() {
  const el = document.getElementById('timer');
  if (el) el.textContent = '마감!';
  if (timerInterval) clearInterval(timerInterval);
}

function renderResult(data: { survivors: string[]; eliminated: string[]; choiceCounts: number[] }) {
  if (timerInterval) clearInterval(timerInterval);
  const max = Math.max(...data.choiceCounts, 1);

  app.innerHTML = `
    <div class="result-section">
      <div class="round-num">결과 발표</div>
      <div class="choices">
        ${currentChoices.map((c, i) => `
          <div class="choice-bar">
            <div class="choice-label">${c}</div>
            <div class="bar-container"><div class="bar-fill" style="height:${(data.choiceCounts[i] / max) * 100}%"></div></div>
            <div class="bar-count">${data.choiceCounts[i]}명</div>
          </div>
        `).join('')}
      </div>
      <div class="survivors-text">${data.survivors.length}명 생존!</div>
      ${data.eliminated.length > 0 ? `<div class="eliminated-text">탈락: ${data.eliminated.join(', ')}</div>` : ''}
    </div>
  `;
}

function renderInvalid(reason: string) {
  if (timerInterval) clearInterval(timerInterval);
  app.innerHTML = `<div class="invalid-msg">${reason}</div>`;
}

function renderWinner(data: { winner: string | null; rankings: { nickname: string; eliminatedRound: number | null }[] }) {
  if (timerInterval) clearInterval(timerInterval);
  if (data.winner) {
    app.innerHTML = `
      <div class="title">🎉 우승자 🎉</div>
      <div class="winner-name">${data.winner}</div>
      <div class="subtitle" style="margin-top:40px">최종 순위</div>
      <div class="nicknames">${data.rankings.slice(0, 10).map((r, i) => `${i + 1}. ${r.nickname}`).join(' · ')}</div>
    `;
  } else {
    app.innerHTML = `
      <div class="title">게임 종료</div>
      <div class="subtitle">우승자 없음</div>
      <div class="nicknames">${data.rankings.slice(0, 10).map((r, i) => `${i + 1}. ${r.nickname}`).join(' · ')}</div>
    `;
  }
}

function showPaused() {
  const existing = document.querySelector('.paused');
  if (!existing) {
    const el = document.createElement('div');
    el.className = 'paused';
    el.textContent = '⏸ 일시정지';
    app.prepend(el);
  }
}

function removePaused() {
  const el = document.querySelector('.paused');
  if (el) el.remove();
}

// Init
renderLobby({ totalPlayers: 0 });
connect();
