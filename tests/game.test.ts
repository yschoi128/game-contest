import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Players from '../server/players.js';
import * as Game from '../server/game.js';

describe('Game 모듈', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Players.resetPlayers();
    Game.resetGame();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupPlayers(count: number) {
    for (let i = 0; i < count; i++) {
      Players.addPlayer(`p${i}`, `Player${i}`);
    }
  }

  describe('startGame', () => {
    it('LOBBY 상태에서만 시작 가능하다', () => {
      setupPlayers(20);
      expect(Game.startGame()).toBe(true);
      expect(Game.getState()).not.toBe('LOBBY');
    });

    it('LOBBY가 아닌 상태에서는 시작 불가하다', () => {
      setupPlayers(20);
      Game.startGame();
      expect(Game.startGame()).toBe(false);
    });
  });

  describe('submitVote', () => {
    it('활성 라운드에서 유효한 투표를 수락한다', () => {
      setupPlayers(20);
      Game.startGame();
      expect(Game.submitVote('p0', 0)).toBe(true);
    });

    it('범위 밖 선택지는 거부한다', () => {
      setupPlayers(20);
      Game.startGame();
      expect(Game.submitVote('p0', -1)).toBe('invalid_choice');
      expect(Game.submitVote('p0', 99)).toBe('invalid_choice');
    });

    it('탈락한 플레이어의 투표를 거부한다', () => {
      setupPlayers(20);
      Game.startGame();
      Players.eliminatePlayer('p0', 1);
      expect(Game.submitVote('p0', 0)).toBe('eliminated');
    });

    it('존재하지 않는 플레이어의 투표를 거부한다', () => {
      setupPlayers(20);
      Game.startGame();
      expect(Game.submitVote('없는ID', 0)).toBe('eliminated');
    });

    it('LOBBY 상태에서는 투표 불가하다', () => {
      setupPlayers(20);
      expect(Game.submitVote('p0', 0)).toBe('not_active');
    });
  });

  describe('getGameStatus', () => {
    it('현재 게임 상태를 반환한다', () => {
      setupPlayers(5);
      const status = Game.getGameStatus();
      expect(status.state).toBe('LOBBY');
      expect(status.totalPlayers).toBe(5);
      expect(status.survivorCount).toBe(5);
    });
  });

  describe('togglePause', () => {
    it('일시정지를 토글한다', () => {
      setupPlayers(20);
      Game.startGame();
      const paused = Game.togglePause();
      expect(paused).toBe(true);
      const resumed = Game.togglePause();
      expect(resumed).toBe(false);
    });

    it('일시정지 중에는 투표가 거부된다', () => {
      setupPlayers(20);
      Game.startGame();
      Game.togglePause();
      expect(Game.submitVote('p0', 0)).toBe('paused');
    });
  });

  describe('invalidateRound', () => {
    it('활성 라운드를 무효 처리한다', () => {
      setupPlayers(20);
      Game.startGame();
      expect(Game.invalidateRound()).toBe(true);
      expect(Game.getState()).toBe('ROUND_RESULT');
    });

    it('LOBBY 상태에서는 무효 처리 불가하다', () => {
      setupPlayers(20);
      expect(Game.invalidateRound()).toBe(false);
    });
  });

  describe('forceEnd', () => {
    it('게임을 즉시 종료한다', () => {
      setupPlayers(20);
      Game.startGame();
      Game.forceEnd();
      expect(Game.getState()).toBe('END');
    });
  });

  describe('라운드 진행 - 타이머 기반', () => {
    it('ROUND_ACTIVE → ROUND_BLIND (7초 후)', () => {
      setupPlayers(20);
      Game.startGame();
      expect(Game.getState()).toBe('ROUND_ACTIVE');
      vi.advanceTimersByTime(7000);
      expect(Game.getState()).toBe('ROUND_BLIND');
    });

    it('ROUND_BLIND → ROUND_CLOSED (나머지 시간 후)', () => {
      setupPlayers(20);
      Game.startGame();
      vi.advanceTimersByTime(7000); // → BLIND
      vi.advanceTimersByTime(13000); // 20-7=13초 → CLOSED
      expect(Game.getState()).toBe('ROUND_CLOSED');
    });

    it('ROUND_CLOSED → ROUND_RESULT (Grace Period 2초 후)', () => {
      setupPlayers(20);
      Game.startGame();
      // 모든 플레이어가 투표해야 전원 탈락 방지
      for (let i = 0; i < 20; i++) {
        Game.submitVote(`p${i}`, i % 3);
      }
      vi.advanceTimersByTime(7000);  // → BLIND
      vi.advanceTimersByTime(13000); // → CLOSED
      vi.advanceTimersByTime(2000);  // → RESULT
      expect(Game.getState()).toBe('ROUND_RESULT');
    });
  });

  describe('탈락 규칙', () => {
    it('미선택자는 자동 탈락한다', () => {
      setupPlayers(20);
      Game.startGame();
      // p0~p9만 투표 (0번 선택), p10~p19는 미투표
      for (let i = 0; i < 10; i++) Game.submitVote(`p${i}`, 0);
      for (let i = 10; i < 15; i++) Game.submitVote(`p${i}`, 1);
      // p15~p19는 미투표
      vi.advanceTimersByTime(22000); // 전체 타이머 경과 (7+13+2)
      // 미투표자 5명은 탈락
      for (let i = 15; i < 20; i++) {
        expect(Players.getPlayer(`p${i}`)?.alive).toBe(false);
      }
    });

    it('가장 적은 인원이 선택한 쪽만 생존한다 (초반/후반)', () => {
      setupPlayers(20);
      Game.startGame();
      // 선택지 3개: 0번에 2명, 1번에 8명, 2번에 10명
      for (let i = 0; i < 2; i++) Game.submitVote(`p${i}`, 0);
      for (let i = 2; i < 10; i++) Game.submitVote(`p${i}`, 1);
      for (let i = 10; i < 20; i++) Game.submitVote(`p${i}`, 2);
      vi.advanceTimersByTime(22000);
      // 0번(2명)이 최소 → 생존
      expect(Players.getPlayer('p0')?.alive).toBe(true);
      expect(Players.getPlayer('p1')?.alive).toBe(true);
      // 나머지 탈락
      expect(Players.getPlayer('p2')?.alive).toBe(false);
      expect(Players.getPlayer('p10')?.alive).toBe(false);
    });

    it('동점 처리: 최소 인원이 동점이면 모두 생존', () => {
      setupPlayers(20);
      Game.startGame();
      // 0번에 5명, 1번에 5명, 2번에 10명 → 0,1번 동점 최소 → 둘 다 생존
      for (let i = 0; i < 5; i++) Game.submitVote(`p${i}`, 0);
      for (let i = 5; i < 10; i++) Game.submitVote(`p${i}`, 1);
      for (let i = 10; i < 20; i++) Game.submitVote(`p${i}`, 2);
      vi.advanceTimersByTime(22000);
      // 0번, 1번 선택자 생존
      for (let i = 0; i < 10; i++) {
        expect(Players.getPlayer(`p${i}`)?.alive).toBe(true);
      }
      // 2번 선택자 탈락
      for (let i = 10; i < 20; i++) {
        expect(Players.getPlayer(`p${i}`)?.alive).toBe(false);
      }
    });

    it('전원 같은 선택 시 라운드 무효', () => {
      setupPlayers(20);
      Game.startGame();
      // 전원 0번 선택
      for (let i = 0; i < 20; i++) Game.submitVote(`p${i}`, 0);
      vi.advanceTimersByTime(22000);
      // 전원 생존 (라운드 무효)
      expect(Players.getAlivePlayers()).toHaveLength(20);
      expect(Game.getState()).toBe('ROUND_RESULT');
    });

    it('일반 라운드에서 아무도 투표하지 않으면 무효 처리 후 전원 생존', () => {
      setupPlayers(20);
      Game.startGame();
      // 아무도 투표하지 않음
      vi.advanceTimersByTime(22000);
      // 전원 생존, 데드락 없이 다음 라운드 진행 가능
      expect(Players.getAlivePlayers()).toHaveLength(20);
      expect(Game.getState()).toBe('ROUND_RESULT');
      expect(Game.advanceToNextRound()).toBe(true);
    });

    it('결승 라운드에서 아무도 투표하지 않으면 무효 처리 후 전원 생존', () => {
      setupPlayers(4);
      Game.startGame();
      // 4명 → 결승 (FINAL_ACTIVE)
      expect(Game.getState()).toBe('FINAL_ACTIVE');
      // 아무도 투표하지 않음
      vi.advanceTimersByTime(12000); // 10초 + 2초 grace
      // 전원 생존, 생존자 0명 데드락이 발생하지 않음
      expect(Players.getAlivePlayers()).toHaveLength(4);
      expect(Game.getState()).toBe('FINAL_RESULT');
      expect(Game.advanceToNextRound()).toBe(true);
    });
  });

  describe('결승전 규칙', () => {
    it('유일한 선택자가 있으면 우승', () => {
      setupPlayers(4);
      Game.startGame();
      // 4명 → final 페이즈 (FINAL_ACTIVE)
      expect(Game.getState()).toBe('FINAL_ACTIVE');
      // p0만 0번, 나머지 1번 → p0이 유일한 선택자
      Game.submitVote('p0', 0);
      Game.submitVote('p1', 1);
      Game.submitVote('p2', 1);
      Game.submitVote('p3', 1);
      vi.advanceTimersByTime(12000); // 10초 + 2초 grace
      expect(Game.getState()).toBe('END');
      expect(Players.getPlayer('p0')?.alive).toBe(true);
    });

    it('유일한 선택자가 없으면 전원 생존 후 다음 라운드', () => {
      setupPlayers(4);
      Game.startGame();
      // 전원 같은 선택 → 유일한 선택자 없음
      Game.submitVote('p0', 0);
      Game.submitVote('p1', 0);
      Game.submitVote('p2', 1);
      Game.submitVote('p3', 1);
      vi.advanceTimersByTime(12000);
      expect(Game.getState()).toBe('FINAL_RESULT');
      // 전원 생존
      expect(Players.getAlivePlayers()).toHaveLength(4);
    });
  });

  describe('advanceToNextRound', () => {
    it('ROUND_RESULT 상태에서 다음 라운드로 진행한다', () => {
      setupPlayers(20);
      Game.startGame();
      // 전원 같은 선택 → 무효 → ROUND_RESULT
      for (let i = 0; i < 20; i++) Game.submitVote(`p${i}`, 0);
      vi.advanceTimersByTime(22000);
      expect(Game.getState()).toBe('ROUND_RESULT');
      expect(Game.advanceToNextRound()).toBe(true);
      expect(Game.getState()).toBe('ROUND_ACTIVE');
    });

    it('ROUND_ACTIVE 상태에서는 진행 불가하다', () => {
      setupPlayers(20);
      Game.startGame();
      expect(Game.advanceToNextRound()).toBe(false);
    });

    it('커스텀 선택지로 다음 라운드를 시작할 수 있다', () => {
      setupPlayers(20);
      Game.startGame();
      for (let i = 0; i < 20; i++) Game.submitVote(`p${i}`, 0);
      vi.advanceTimersByTime(22000);
      expect(Game.advanceToNextRound(['커스텀A', '커스텀B'])).toBe(true);
    });
  });

  describe('resetGame', () => {
    it('게임을 초기 상태로 리셋한다', () => {
      setupPlayers(20);
      Game.startGame();
      Game.resetGame();
      expect(Game.getState()).toBe('LOBBY');
    });
  });
});
