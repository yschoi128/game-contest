import { describe, it, expect, beforeEach } from 'vitest';
import * as Players from '../server/players.js';

describe('Players 모듈', () => {
  beforeEach(() => {
    Players.resetPlayers();
  });

  describe('addPlayer', () => {
    it('플레이어를 추가하고 반환한다', () => {
      const p = Players.addPlayer('p1', '테스터');
      expect(p).toEqual({ id: 'p1', nickname: '테스터', alive: true, eliminatedRound: null });
    });

    it('추가된 플레이어를 getPlayer로 조회할 수 있다', () => {
      Players.addPlayer('p1', '닉네임');
      expect(Players.getPlayer('p1')?.nickname).toBe('닉네임');
    });
  });

  describe('getAlivePlayers', () => {
    it('생존 플레이어만 반환한다', () => {
      Players.addPlayer('p1', 'A');
      Players.addPlayer('p2', 'B');
      Players.eliminatePlayer('p1', 1);
      const alive = Players.getAlivePlayers();
      expect(alive).toHaveLength(1);
      expect(alive[0].id).toBe('p2');
    });
  });

  describe('eliminatePlayer', () => {
    it('플레이어를 탈락시키고 라운드를 기록한다', () => {
      Players.addPlayer('p1', 'A');
      Players.eliminatePlayer('p1', 3);
      const p = Players.getPlayer('p1');
      expect(p?.alive).toBe(false);
      expect(p?.eliminatedRound).toBe(3);
    });

    it('존재하지 않는 플레이어에 대해 에러 없이 동작한다', () => {
      expect(() => Players.eliminatePlayer('없는ID', 1)).not.toThrow();
    });
  });

  describe('revivePlayers', () => {
    it('탈락한 플레이어를 부활시킨다', () => {
      Players.addPlayer('p1', 'A');
      Players.eliminatePlayer('p1', 2);
      Players.revivePlayers(['p1']);
      const p = Players.getPlayer('p1');
      expect(p?.alive).toBe(true);
      expect(p?.eliminatedRound).toBeNull();
    });
  });

  describe('getPlayerCount', () => {
    it('전체 플레이어 수를 반환한다', () => {
      Players.addPlayer('p1', 'A');
      Players.addPlayer('p2', 'B');
      expect(Players.getPlayerCount()).toBe(2);
    });
  });

  describe('getRankings', () => {
    it('생존자가 먼저, 늦게 탈락한 순으로 정렬한다', () => {
      Players.addPlayer('p1', 'A');
      Players.addPlayer('p2', 'B');
      Players.addPlayer('p3', 'C');
      Players.eliminatePlayer('p1', 1);
      Players.eliminatePlayer('p2', 3);
      const rankings = Players.getRankings();
      expect(rankings[0].nickname).toBe('C'); // alive
      expect(rankings[1].nickname).toBe('B'); // eliminated round 3
      expect(rankings[2].nickname).toBe('A'); // eliminated round 1
    });
  });

  describe('resetPlayers', () => {
    it('모든 플레이어를 제거한다', () => {
      Players.addPlayer('p1', 'A');
      Players.resetPlayers();
      expect(Players.getPlayerCount()).toBe(0);
    });
  });
});
