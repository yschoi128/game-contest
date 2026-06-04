import { Phase, RoundData } from '../src/shared/types.js';
import { PHASE_THRESHOLDS, TIME_LIMITS } from '../src/shared/constants.js';
import questions from '../data/questions.json' with { type: 'json' };

interface Question {
  phase: string;
  choices: string[];
}

const usedIndices = new Set<number>();

export function getPhase(survivorCount: number): Phase {
  if (survivorCount <= PHASE_THRESHOLDS.FINAL_MAX) return 'final';
  if (survivorCount <= PHASE_THRESHOLDS.LATE_MAX) return 'late';
  return 'early';
}

export function getNextRound(roundNum: number, survivorCount: number, isSuddenDeath: boolean): RoundData {
  const phase: Phase = isSuddenDeath ? 'sudden_death' : getPhase(survivorCount);
  const choices = pickQuestion(phase);
  return {
    roundNum,
    choices,
    timeLimit: TIME_LIMITS[phase],
    phase,
  };
}

function pickQuestion(phase: Phase): string[] {
  const candidates = questions
    .map((q, i) => ({ ...q, index: i }))
    .filter(q => q.phase === phase && !usedIndices.has(q.index));

  if (candidates.length === 0) {
    // All used, reset for this phase
    questions.forEach((q, i) => {
      if (q.phase === phase) usedIndices.delete(i);
    });
    return pickQuestion(phase);
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  usedIndices.add(pick.index);
  return pick.choices;
}

export function createCustomRound(roundNum: number, choices: string[], survivorCount: number): RoundData {
  const phase = getPhase(survivorCount);
  return {
    roundNum,
    choices,
    timeLimit: TIME_LIMITS[phase],
    phase,
  };
}

export function resetRounds(): void {
  usedIndices.clear();
}
