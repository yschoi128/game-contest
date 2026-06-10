import { describe, it, expect } from 'vitest';
import { getPhase, getNextRound, createCustomRound, resetRounds } from '../server/rounds.js';

describe('Rounds 모듈', () => {
  describe('getPhase', () => {
    it('16명 이상이면 early', () => {
      expect(getPhase(16)).toBe('early');
      expect(getPhase(100)).toBe('early');
    });

    it('6~15명이면 late', () => {
      expect(getPhase(6)).toBe('late');
      expect(getPhase(15)).toBe('late');
    });

    it('5명 이하면 final', () => {
      expect(getPhase(5)).toBe('final');
      expect(getPhase(1)).toBe('final');
    });
  });

  describe('getNextRound', () => {
    it('early 페이즈에서 3개 선택지와 20초 제한시간을 반환한다', () => {
      resetRounds();
      const round = getNextRound(1, 50, false);
      expect(round.phase).toBe('early');
      expect(round.choices).toHaveLength(3);
      expect(round.timeLimit).toBe(20);
      expect(round.roundNum).toBe(1);
    });

    it('late 페이즈에서 2개 선택지와 15초 제한시간을 반환한다', () => {
      resetRounds();
      const round = getNextRound(2, 10, false);
      expect(round.phase).toBe('late');
      expect(round.choices).toHaveLength(2);
      expect(round.timeLimit).toBe(15);
    });

    it('final 페이즈에서 3~4개 선택지와 10초 제한시간을 반환한다', () => {
      resetRounds();
      const round = getNextRound(3, 4, false);
      expect(round.phase).toBe('final');
      expect(round.choices.length).toBeGreaterThanOrEqual(3);
      expect(round.choices.length).toBeLessThanOrEqual(4);
      expect(round.timeLimit).toBe(10);
    });

    it('sudden_death에서 2개 선택지를 반환한다', () => {
      resetRounds();
      const round = getNextRound(10, 3, true);
      expect(round.phase).toBe('sudden_death');
      expect(round.choices).toHaveLength(2);
      expect(round.timeLimit).toBe(10);
    });

    it('질문 제목(prompt)을 포함한다', () => {
      resetRounds();
      const round = getNextRound(1, 50, false);
      expect(typeof round.prompt).toBe('string');
      expect(round.prompt.length).toBeGreaterThan(0);
    });

    it('생존자 2명이면 가위바위보(rps) 라운드를 강제한다', () => {
      resetRounds();
      const round = getNextRound(7, 2, false);
      expect(round.phase).toBe('rps');
      expect(round.choices).toEqual(['가위', '바위', '보']);
      expect(round.timeLimit).toBe(10);
    });

    it('생존자 2명이면 서든데스보다 rps가 우선한다', () => {
      resetRounds();
      const round = getNextRound(8, 2, true);
      expect(round.phase).toBe('rps');
      expect(round.choices).toEqual(['가위', '바위', '보']);
    });
  });

  describe('createCustomRound', () => {
    it('커스텀 선택지로 라운드를 생성한다', () => {
      const round = createCustomRound(5, ['A', 'B', 'C'], 20);
      expect(round.choices).toEqual(['A', 'B', 'C']);
      expect(round.roundNum).toBe(5);
      expect(round.phase).toBe('early');
    });

    it('커스텀 제목을 전달하면 prompt에 반영된다', () => {
      const round = createCustomRound(5, ['A', 'B'], 20, '직접 고른 질문');
      expect(round.prompt).toBe('직접 고른 질문');
    });

    it('제목을 생략하면 빈 문자열이다', () => {
      const round = createCustomRound(5, ['A', 'B'], 20);
      expect(round.prompt).toBe('');
    });

    it('생존자 2명이면 커스텀 선택지를 무시하고 rps를 강제한다', () => {
      const round = createCustomRound(5, ['A', 'B'], 2, '즉석 질문');
      expect(round.phase).toBe('rps');
      expect(round.choices).toEqual(['가위', '바위', '보']);
    });
  });

  describe('resetRounds', () => {
    it('에러 없이 리셋된다', () => {
      expect(() => resetRounds()).not.toThrow();
    });
  });
});
