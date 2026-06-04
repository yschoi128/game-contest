export const PHASE_THRESHOLDS = {
  FINAL_MAX: 5,
  LATE_MAX: 15,
} as const;

export const TIME_LIMITS = {
  early: 20,
  late: 15,
  final: 10,
  sudden_death: 10,
} as const;

export const CHOICE_COUNTS = {
  early: 3,
  late: 2,
  final: 3,
  sudden_death: 2,
} as const;

export const OPEN_DURATION = 7; // seconds where vote counts are visible
export const GRACE_PERIOD = 2; // seconds after timer ends
export const MAX_FINAL_ROUNDS = 5;
