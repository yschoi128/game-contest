export const PHASE_THRESHOLDS = {
  FINAL_MAX: 5,
  LATE_MAX: 15,
} as const;

export const TIME_LIMITS = {
  early: 20,
  late: 15,
  final: 10,
  sudden_death: 10,
  rps: 10,
} as const;

export const CHOICE_COUNTS = {
  early: 3,
  late: 2,
  final: 3,
  sudden_death: 2,
  rps: 3,
} as const;

export const OPEN_DURATION = 7; // seconds where vote counts are visible
export const GRACE_PERIOD = 2; // seconds after timer ends
export const MAX_FINAL_ROUNDS = 5;

// When exactly this many survivors remain, force a rock-paper-scissors duel.
export const RPS_SURVIVOR_COUNT = 2;
// Fixed choices for the RPS duel round. Index order matters for rpsBeats():
// 0 = 가위(scissors), 1 = 바위(rock), 2 = 보(paper).
export const RPS_CHOICES = ['가위', '바위', '보'] as const;
export const RPS_PROMPT = '⚔️ 최종 결투! 가위바위보!';
