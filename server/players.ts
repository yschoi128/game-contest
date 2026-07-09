import { Player } from '../src/shared/types.js';

const players = new Map<string, Player>();

export function addPlayer(id: string, nickname: string): Player {
  const player: Player = { id, nickname, alive: true, eliminatedRound: null };
  players.set(id, player);
  return player;
}

export function getPlayer(id: string): Player | undefined {
  return players.get(id);
}

export function getAlivePlayers(): Player[] {
  return [...players.values()].filter(p => p.alive);
}

export function getAllPlayers(): Player[] {
  return [...players.values()];
}

export function getPlayerCount(): number {
  return players.size;
}

export function eliminatePlayer(id: string, round: number): void {
  const p = players.get(id);
  if (p) {
    p.alive = false;
    p.eliminatedRound = round;
  }
}

export function revivePlayers(ids: string[]): void {
  for (const id of ids) {
    const p = players.get(id);
    if (p) {
      p.alive = true;
      p.eliminatedRound = null;
    }
  }
}

export function resetPlayers(): void {
  players.clear();
}

// Revive every player without removing them (used to restart a game with the
// same roster: eliminated players become alive again, join list is preserved).
export function reviveAll(): void {
  for (const p of players.values()) {
    p.alive = true;
    p.eliminatedRound = null;
  }
}

export function getRankings(): { nickname: string; eliminatedRound: number | null }[] {
  return [...players.values()]
    .sort((a, b) => {
      // Winner (alive) first, then by eliminated round descending
      if (a.alive && !b.alive) return -1;
      if (!a.alive && b.alive) return 1;
      if (a.eliminatedRound === null && b.eliminatedRound === null) return 0;
      if (a.eliminatedRound === null) return -1;
      if (b.eliminatedRound === null) return 1;
      return b.eliminatedRound - a.eliminatedRound;
    })
    .map(p => ({ nickname: p.nickname, eliminatedRound: p.eliminatedRound }));
}
