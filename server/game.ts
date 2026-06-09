import { GameState, RoundData, WsMessage } from '../src/shared/types.js';
import { GRACE_PERIOD, MAX_FINAL_ROUNDS, OPEN_DURATION } from '../src/shared/constants.js';
import * as Players from './players.js';
import { getNextRound, getPhase, createCustomRound, resetRounds } from './rounds.js';
import { WebSocket } from 'ws';

let state: GameState = 'LOBBY';
let roundNum = 0;
let currentRound: RoundData | null = null;
let votes = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let paused = false;
let finalRoundCount = 0;
let isSuddenDeath = false;

// Timer tracking for pause/resume and client countdown
let roundStartedAt = 0; // epoch ms when current timer phase started
let currentTimerDuration = 0; // total ms for current timer phase
let remainingMsOnPause = 0; // ms left when paused
type TimerPhase = 'open' | 'blind' | 'grace' | 'final'; // which timer phase we're in

const hostClients = new Set<WebSocket>();

export function registerHostClient(ws: WebSocket): void {
  hostClients.add(ws);
  ws.on('close', () => hostClients.delete(ws));
  ws.send(JSON.stringify({ type: 'state_sync', state, data: getFullState() }));
}

function broadcast(msg: WsMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of hostClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function getFullState() {
  return {
    state,
    roundNum,
    currentRound,
    survivorCount: Players.getAlivePlayers().length,
    totalPlayers: Players.getPlayerCount(),
    votes: currentRound ? getVoteCounts() : [],
    paused,
    remainingTime: getRemainingTimeSec(),
    nicknames: Players.getAllPlayers().map(p => p.nickname),
  };
}

export function getGameStatus() {
  return {
    state,
    roundNum,
    survivorCount: Players.getAlivePlayers().length,
    totalPlayers: Players.getPlayerCount(),
    phase: currentRound?.phase ?? getPhase(Players.getAlivePlayers().length),
    currentPrompt: currentRound?.prompt ?? '',
    currentChoices: currentRound?.choices ?? [],
    paused,
    remainingTime: getRemainingTimeSec(),
    timeLimit: currentRound?.timeLimit ?? 0,
  };
}

function getRemainingTimeSec(): number {
  if (!currentRound) return 0;
  if (paused) return Math.ceil(remainingMsOnPause / 1000);
  if (roundStartedAt === 0) return 0;
  const elapsed = Date.now() - roundStartedAt;
  const remaining = currentTimerDuration - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function notifyPlayerJoined(nickname: string): void {
  broadcast({ type: 'player_joined', count: Players.getPlayerCount(), nickname });
}

export function startGame(): boolean {
  if (state !== 'LOBBY') return false;
  roundNum = 0;
  finalRoundCount = 0;
  isSuddenDeath = false;
  resetRounds();
  startNextRound();
  return true;
}

export function startNextRound(customChoices?: string[], customPrompt?: string): void {
  roundNum++;
  votes = new Map();

  const survivors = Players.getAlivePlayers();
  const phase = getPhase(survivors.length);

  if (phase === 'final') {
    finalRoundCount++;
    if (finalRoundCount > MAX_FINAL_ROUNDS) isSuddenDeath = true;
  }

  currentRound = customChoices
    ? createCustomRound(roundNum, customChoices, survivors.length, customPrompt ?? '')
    : getNextRound(roundNum, survivors.length, isSuddenDeath);

  state = (currentRound.phase === 'final' || currentRound.phase === 'sudden_death')
    ? 'FINAL_ACTIVE' : 'ROUND_ACTIVE';

  broadcast({
    type: 'round_start',
    roundNum: currentRound.roundNum,
    prompt: currentRound.prompt,
    choices: currentRound.choices,
    timeLimit: currentRound.timeLimit,
    phase: currentRound.phase,
  });

  startTimer();
}

function startTimer(): void {
  if (!currentRound) return;
  const timeLimit = currentRound.timeLimit;

  if (state === 'ROUND_ACTIVE') {
    // Open phase: first OPEN_DURATION seconds
    currentTimerDuration = OPEN_DURATION * 1000;
    roundStartedAt = Date.now();
    timer = setTimeout(() => {
      state = 'ROUND_BLIND';
      broadcast({ type: 'state_sync', state, data: null });
      // Blind phase: remaining time
      currentTimerDuration = (timeLimit - OPEN_DURATION) * 1000;
      roundStartedAt = Date.now();
      timer = setTimeout(() => closeRound(), (timeLimit - OPEN_DURATION) * 1000);
    }, OPEN_DURATION * 1000);
  } else {
    // FINAL_ACTIVE: entire timeLimit
    currentTimerDuration = timeLimit * 1000;
    roundStartedAt = Date.now();
    timer = setTimeout(() => closeRound(), timeLimit * 1000);
  }
}

function closeRound(): void {
  state = 'ROUND_CLOSED';
  broadcast({ type: 'state_sync', state, data: null });
  currentTimerDuration = GRACE_PERIOD * 1000;
  roundStartedAt = Date.now();
  timer = setTimeout(() => resolveRound(), GRACE_PERIOD * 1000);
}

function resolveRound(): void {
  if (!currentRound) return;

  const survivors = Players.getAlivePlayers();
  const choiceCounts = getVoteCounts();
  const phase = currentRound.phase;

  const voterIds = new Set(votes.keys());
  const voters = survivors.filter(p => voterIds.has(p.id));

  // Safety: nobody voted at all → invalidate round, everyone survives.
  // (Without this, eliminating all non-voters would leave 0 survivors and
  // deadlock the game, since advanceToNextRound requires >=1 alive player.)
  if (voters.length === 0) {
    state = (phase === 'final' || phase === 'sudden_death') ? 'FINAL_RESULT' : 'ROUND_RESULT';
    broadcast({ type: 'round_invalid', reason: '아무도 투표하지 않아 라운드를 무효 처리했습니다' });
    return;
  }

  // Eliminate non-voters
  const nonVoters = survivors.filter(p => !voterIds.has(p.id));
  for (const p of nonVoters) Players.eliminatePlayer(p.id, roundNum);

  if (phase === 'final' || phase === 'sudden_death') {
    resolveFinalRound(voters, choiceCounts);
  } else {
    resolveNormalRound(voters, choiceCounts);
  }
}

function resolveNormalRound(voters: { id: string; nickname: string }[], choiceCounts: number[]): void {
  const nonZeroCounts = choiceCounts.filter(c => c > 0);

  if (nonZeroCounts.length <= 1) {
    // All chose same → revive non-voters, invalidate
    const eliminated = Players.getAllPlayers().filter(p => !p.alive && p.eliminatedRound === roundNum);
    Players.revivePlayers(eliminated.map(p => p.id));
    state = 'ROUND_RESULT';
    broadcast({ type: 'round_invalid', reason: '전원 같은 선택! 라운드 무효' });
    return;
  }

  const minCount = Math.min(...choiceCounts.filter(c => c > 0));
  const survivorChoiceIndices = choiceCounts
    .map((c, i) => ({ count: c, index: i }))
    .filter(x => x.count === minCount)
    .map(x => x.index);

  const eliminatedIds: string[] = [];
  for (const player of voters) {
    const choice = votes.get(player.id);
    if (choice === undefined || !survivorChoiceIndices.includes(choice)) {
      eliminatedIds.push(player.id);
      Players.eliminatePlayer(player.id, roundNum);
    }
  }

  // Safety: if all eliminated, invalidate
  if (Players.getAlivePlayers().length === 0) {
    Players.revivePlayers(eliminatedIds);
    const nonVoterEliminated = Players.getAllPlayers().filter(p => !p.alive && p.eliminatedRound === roundNum);
    Players.revivePlayers(nonVoterEliminated.map(p => p.id));
    state = 'ROUND_RESULT';
    broadcast({ type: 'round_invalid', reason: '전원 탈락 방지 - 라운드 무효' });
    return;
  }

  state = 'ROUND_RESULT';
  broadcast({
    type: 'round_result',
    survivors: Players.getAlivePlayers().map(p => p.nickname),
    eliminated: eliminatedIds.map(id => {
      const p = Players.getPlayer(id);
      return p?.nickname ?? '';
    }),
    choiceCounts,
  });
}

function resolveFinalRound(voters: { id: string; nickname: string }[], choiceCounts: number[]): void {
  const uniqueIndices = choiceCounts
    .map((c, i) => ({ count: c, index: i }))
    .filter(x => x.count === 1)
    .map(x => x.index);

  // Only declare a winner if exactly one player is a unique chooser
  if (uniqueIndices.length === 1) {
    let winnerId: string | null = null;
    for (const [playerId, choice] of votes) {
      if (choice === uniqueIndices[0]) {
        winnerId = playerId;
        break;
      }
    }

    if (winnerId) {
      for (const player of voters) {
        if (player.id !== winnerId) Players.eliminatePlayer(player.id, roundNum);
      }
      state = 'END';
      const winner = Players.getPlayer(winnerId);
      broadcast({ type: 'game_end', winner: winner?.nickname ?? null, rankings: Players.getRankings() });
      return;
    }
  }

  // Multiple unique choosers or no unique chooser → all survive, next round
  state = 'FINAL_RESULT';
  broadcast({
    type: 'round_result',
    survivors: voters.map(v => v.nickname),
    eliminated: [],
    choiceCounts,
  });
}

function getVoteCounts(): number[] {
  if (!currentRound) return [];
  const counts = new Array(currentRound.choices.length).fill(0) as number[];
  for (const choice of votes.values()) {
    if (choice >= 0 && choice < counts.length) counts[choice]++;
  }
  return counts;
}

export type VoteRejectReason = 'not_active' | 'paused' | 'invalid_choice' | 'eliminated';

export function submitVote(playerId: string, choice: number): true | VoteRejectReason {
  const validStates: GameState[] = ['ROUND_ACTIVE', 'ROUND_BLIND', 'ROUND_CLOSED', 'FINAL_ACTIVE'];
  if (!validStates.includes(state) || !currentRound) return 'not_active';
  if (paused) return 'paused';
  if (choice < 0 || choice >= currentRound.choices.length) return 'invalid_choice';

  const player = Players.getPlayer(playerId);
  if (!player || !player.alive) return 'eliminated';

  votes.set(playerId, choice);

  if (state === 'ROUND_ACTIVE') {
    broadcast({ type: 'vote_update', counts: getVoteCounts() });
  }
  return true;
}

export function advanceToNextRound(customChoices?: string[], customPrompt?: string): boolean {
  if (state !== 'ROUND_RESULT' && state !== 'FINAL_RESULT') return false;
  if (Players.getAlivePlayers().length <= 0) return false;
  startNextRound(customChoices, customPrompt);
  return true;
}

export function invalidateRound(): boolean {
  if (state !== 'ROUND_ACTIVE' && state !== 'ROUND_BLIND' && state !== 'ROUND_CLOSED') return false;
  if (timer) clearTimeout(timer);
  const eliminated = Players.getAllPlayers().filter(p => !p.alive && p.eliminatedRound === roundNum);
  Players.revivePlayers(eliminated.map(p => p.id));
  state = 'ROUND_RESULT';
  broadcast({ type: 'round_invalid', reason: '운영자가 라운드를 무효 처리했습니다' });
  return true;
}

export function togglePause(): boolean {
  paused = !paused;
  if (paused) {
    // Save remaining time and stop timer
    const elapsed = Date.now() - roundStartedAt;
    remainingMsOnPause = Math.max(0, currentTimerDuration - elapsed);
    if (timer) { clearTimeout(timer); timer = null; }
  } else {
    // Resume: restart timer with remaining time
    resumeTimer();
  }
  broadcast({ type: 'pause', paused });
  return paused;
}

function resumeTimer(): void {
  if (remainingMsOnPause <= 0) return;
  roundStartedAt = Date.now();
  currentTimerDuration = remainingMsOnPause;

  if (state === 'ROUND_ACTIVE') {
    // Was in open phase, remaining open time
    timer = setTimeout(() => {
      state = 'ROUND_BLIND';
      broadcast({ type: 'state_sync', state, data: null });
      if (!currentRound) return;
      const blindDuration = (currentRound.timeLimit - OPEN_DURATION) * 1000;
      currentTimerDuration = blindDuration;
      roundStartedAt = Date.now();
      timer = setTimeout(() => closeRound(), blindDuration);
    }, remainingMsOnPause);
  } else if (state === 'ROUND_BLIND' || state === 'FINAL_ACTIVE') {
    timer = setTimeout(() => closeRound(), remainingMsOnPause);
  } else if (state === 'ROUND_CLOSED') {
    timer = setTimeout(() => resolveRound(), remainingMsOnPause);
  }
}

export function forceEnd(): void {
  if (timer) clearTimeout(timer);
  state = 'END';
  broadcast({ type: 'game_end', winner: null, rankings: Players.getRankings() });
}

export function getState(): GameState { return state; }

export function resetGame(): void {
  if (timer) clearTimeout(timer);
  state = 'LOBBY';
  roundNum = 0;
  currentRound = null;
  votes = new Map();
  paused = false;
  finalRoundCount = 0;
  isSuddenDeath = false;
  roundStartedAt = 0;
  currentTimerDuration = 0;
  remainingMsOnPause = 0;
  Players.resetPlayers();
  resetRounds();
  broadcast({ type: 'state_sync', state, data: getFullState() });
}
