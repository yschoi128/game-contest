import { Phase, RoundData } from '../src/shared/types.js';
import { PHASE_THRESHOLDS, TIME_LIMITS, RPS_SURVIVOR_COUNT, RPS_CHOICES, RPS_PROMPT } from '../src/shared/constants.js';
import questions from '../data/questions.json' with { type: 'json' };

interface Question {
  phase: string;
  prompt: string;
  choices: string[];
}

const usedIndices = new Set<number>();

export function getPhase(survivorCount: number): Phase {
  if (survivorCount <= PHASE_THRESHOLDS.FINAL_MAX) return 'final';
  if (survivorCount <= PHASE_THRESHOLDS.LATE_MAX) return 'late';
  return 'early';
}

// Fixed rock-paper-scissors duel round used when exactly 2 survivors remain.
export function createRpsRound(roundNum: number): RoundData {
  return {
    roundNum,
    prompt: RPS_PROMPT,
    choices: [...RPS_CHOICES],
    timeLimit: TIME_LIMITS.rps,
    phase: 'rps',
  };
}

export function getNextRound(roundNum: number, survivorCount: number, isSuddenDeath: boolean): RoundData {
  // 2 survivors → force a rock-paper-scissors duel. This takes precedence over
  // sudden death so the final 1v1 always reaches a decisive result.
  if (survivorCount === RPS_SURVIVOR_COUNT) {
    return createRpsRound(roundNum);
  }
  const phase: Phase = isSuddenDeath ? 'sudden_death' : getPhase(survivorCount);
  const question = pickQuestion(phase);
  return {
    roundNum,
    prompt: question.prompt,
    choices: question.choices,
    timeLimit: TIME_LIMITS[phase],
    phase,
  };
}

function pickQuestion(phase: Phase): Question {
  const candidates = (questions as Question[])
    .map((q, i) => ({ q, index: i }))
    .filter(x => x.q.phase === phase && !usedIndices.has(x.index));

  if (candidates.length === 0) {
    // All used, reset for this phase
    (questions as Question[]).forEach((q, i) => {
      if (q.phase === phase) usedIndices.delete(i);
    });
    return pickQuestion(phase);
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  usedIndices.add(pick.index);
  return pick.q;
}

export function createCustomRound(roundNum: number, choices: string[], survivorCount: number, prompt = ''): RoundData {
  // RPS-forced policy: with exactly 2 survivors, ignore custom choices and run
  // the rock-paper-scissors duel instead (guarantees a decisive 1v1 result).
  if (survivorCount === RPS_SURVIVOR_COUNT) {
    return createRpsRound(roundNum);
  }
  const phase = getPhase(survivorCount);
  return {
    roundNum,
    prompt,
    choices,
    timeLimit: TIME_LIMITS[phase],
    phase,
  };
}

export function resetRounds(): void {
  usedIndices.clear();
}
