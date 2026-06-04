import { describe, it, expect } from 'vitest';
import { PHASE_THRESHOLDS, TIME_LIMITS, CHOICE_COUNTS, OPEN_DURATION, GRACE_PERIOD, MAX_FINAL_ROUNDS } from '../src/shared/constants.js';

describe('Constants (설계 문서 일치 검증)', () => {
  it('페이즈 기준: FINAL_MAX=5, LATE_MAX=15', () => {
    expect(PHASE_THRESHOLDS.FINAL_MAX).toBe(5);
    expect(PHASE_THRESHOLDS.LATE_MAX).toBe(15);
  });

  it('제한시간: early=20, late=15, final=10, sudden_death=10', () => {
    expect(TIME_LIMITS.early).toBe(20);
    expect(TIME_LIMITS.late).toBe(15);
    expect(TIME_LIMITS.final).toBe(10);
    expect(TIME_LIMITS.sudden_death).toBe(10);
  });

  it('선택지 수: early=3, late=2, final=3, sudden_death=2', () => {
    expect(CHOICE_COUNTS.early).toBe(3);
    expect(CHOICE_COUNTS.late).toBe(2);
    expect(CHOICE_COUNTS.final).toBe(3);
    expect(CHOICE_COUNTS.sudden_death).toBe(2);
  });

  it('오픈 시간=7초, Grace Period=2초', () => {
    expect(OPEN_DURATION).toBe(7);
    expect(GRACE_PERIOD).toBe(2);
  });

  it('결승 최대 라운드=5', () => {
    expect(MAX_FINAL_ROUNDS).toBe(5);
  });
});
