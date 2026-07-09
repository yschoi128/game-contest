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

    it('결승에서도 소수결 적용: [1,2,1]이면 소수쪽 2명 생존, 다수쪽 2명 탈락', () => {
      setupPlayers(4);
      Game.startGame();
      expect(Game.getState()).toBe('FINAL_ACTIVE');
      // 0번:p0(1명), 1번:p1,p2(2명), 2번:p3(1명) → 최소는 0번/2번(각 1명)
      Game.submitVote('p0', 0);
      Game.submitVote('p1', 1);
      Game.submitVote('p2', 1);
      Game.submitVote('p3', 2);
      vi.advanceTimersByTime(12000);
      expect(Game.getState()).toBe('FINAL_RESULT');
      // 소수(0번/2번) 생존, 다수(1번) 탈락
      expect(Players.getPlayer('p0')?.alive).toBe(true);
      expect(Players.getPlayer('p3')?.alive).toBe(true);
      expect(Players.getPlayer('p1')?.alive).toBe(false);
      expect(Players.getPlayer('p2')?.alive).toBe(false);
      expect(Players.getAlivePlayers()).toHaveLength(2);
      // 2명 남았으므로 다음은 가위바위보
      expect(Game.advanceToNextRound()).toBe(true);
      expect(Game.getGameStatus().phase).toBe('rps');
    });

    it('결승 소수결 결과 생존자가 1명이면 즉시 우승(END)', () => {
      setupPlayers(3);
      Game.startGame();
      expect(Game.getState()).toBe('FINAL_ACTIVE');
      // 0번:p0(1명), 1번:p1,p2(2명) → 소수 p0만 생존 → 최후 1인 우승
      Game.submitVote('p0', 0);
      Game.submitVote('p1', 1);
      Game.submitVote('p2', 1);
      vi.advanceTimersByTime(12000);
      expect(Game.getState()).toBe('END');
      expect(Players.getPlayer('p0')?.alive).toBe(true);
    });
  });

  describe('가위바위보 결투 (생존자 2명)', () => {
    it('생존자 2명이면 rps 라운드(FINAL_ACTIVE)로 시작한다', () => {
      setupPlayers(2);
      Game.startGame();
      expect(Game.getState()).toBe('FINAL_ACTIVE');
      const status = Game.getGameStatus();
      expect(status.phase).toBe('rps');
      expect(status.currentChoices).toEqual(['가위', '바위', '보']);
    });

    it('다른 손을 내면 가위바위보 승패로 우승자가 결정된다 (가위 vs 보)', () => {
      setupPlayers(2);
      Game.startGame();
      // p0=가위(0), p1=보(2) → 가위가 보를 이김 → p0 우승
      Game.submitVote('p0', 0);
      Game.submitVote('p1', 2);
      vi.advanceTimersByTime(12000); // 10초 + 2초 grace
      expect(Game.getState()).toBe('END');
      expect(Players.getPlayer('p0')?.alive).toBe(true);
      expect(Players.getPlayer('p1')?.alive).toBe(false);
    });

    it('바위 vs 가위 → 바위 우승', () => {
      setupPlayers(2);
      Game.startGame();
      Game.submitVote('p0', 1); // 바위
      Game.submitVote('p1', 0); // 가위
      vi.advanceTimersByTime(12000);
      expect(Game.getState()).toBe('END');
      expect(Players.getPlayer('p0')?.alive).toBe(true);
      expect(Players.getPlayer('p1')?.alive).toBe(false);
    });

    it('같은 손을 내면 무승부 → 재대결 (FINAL_RESULT, 둘 다 생존)', () => {
      setupPlayers(2);
      Game.startGame();
      Game.submitVote('p0', 1); // 바위
      Game.submitVote('p1', 1); // 바위
      vi.advanceTimersByTime(12000);
      expect(Game.getState()).toBe('FINAL_RESULT');
      expect(Players.getAlivePlayers()).toHaveLength(2);
      // 재대결도 rps 라운드여야 함
      expect(Game.advanceToNextRound()).toBe(true);
      expect(Game.getGameStatus().phase).toBe('rps');
    });

    it('한 명만 투표하면 투표자가 자동 우승한다', () => {
      setupPlayers(2);
      Game.startGame();
      Game.submitVote('p0', 0); // p1은 미투표
      vi.advanceTimersByTime(12000);
      expect(Game.getState()).toBe('END');
      expect(Players.getPlayer('p0')?.alive).toBe(true);
      expect(Players.getPlayer('p1')?.alive).toBe(false);
    });

    it('둘 다 미투표면 무효 처리 후 둘 다 생존 (재대결 가능)', () => {
      setupPlayers(2);
      Game.startGame();
      // 아무도 투표하지 않음
      vi.advanceTimersByTime(12000);
      expect(Game.getState()).toBe('FINAL_RESULT');
      expect(Players.getAlivePlayers()).toHaveLength(2);
      expect(Game.advanceToNextRound()).toBe(true);
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

    it('참가자를 전부 제거한다', () => {
      setupPlayers(20);
      Game.startGame();
      Game.resetGame();
      expect(Players.getPlayerCount()).toBe(0);
    });
  });

  describe('restartGame (같은 인원 유지 재시작)', () => {
    it('로비로 돌아가되 참가자는 유지한다', () => {
      setupPlayers(20);
      Game.startGame();
      Game.forceEnd();
      expect(Game.getState()).toBe('END');
      Game.restartGame();
      expect(Game.getState()).toBe('LOBBY');
      // 참가자는 그대로 유지되어 재접속이 필요 없다
      expect(Players.getPlayerCount()).toBe(20);
    });

    it('탈락자 전원을 부활시킨다', () => {
      setupPlayers(20);
      Game.startGame();
      // 절반 탈락시킨 뒤 게임 종료
      for (let i = 0; i < 10; i++) Players.eliminatePlayer(`p${i}`, 1);
      Game.forceEnd();
      Game.restartGame();
      // 전원 부활
      expect(Players.getAlivePlayers()).toHaveLength(20);
      for (let i = 0; i < 20; i++) {
        expect(Players.getPlayer(`p${i}`)?.alive).toBe(true);
        expect(Players.getPlayer(`p${i}`)?.eliminatedRound).toBeNull();
      }
    });

    it('재시작 후 같은 인원으로 새 게임을 시작할 수 있다', () => {
      setupPlayers(20);
      Game.startGame();
      Game.forceEnd();
      Game.restartGame();
      // 로비 상태이므로 다시 시작 가능
      expect(Game.startGame()).toBe(true);
      expect(Game.getState()).toBe('ROUND_ACTIVE');
      expect(Game.getGameStatus().totalPlayers).toBe(20);
      expect(Game.getGameStatus().survivorCount).toBe(20);
      expect(Game.getGameStatus().roundNum).toBe(1);
    });
  });
});
