export type GameState =
  | 'LOBBY'
  | 'ROUND_ACTIVE'
  | 'ROUND_BLIND'
  | 'ROUND_CLOSED'
  | 'ROUND_RESULT'
  | 'FINAL_ACTIVE'
  | 'FINAL_RESULT'
  | 'SUDDEN_DEATH'
  | 'END';

export type Phase = 'early' | 'late' | 'final' | 'sudden_death';

export interface Player {
  id: string;
  nickname: string;
  alive: boolean;
  eliminatedRound: number | null;
}

export interface RoundData {
  roundNum: number;
  prompt: string;
  choices: string[];
  timeLimit: number;
  phase: Phase;
}

export interface VoteRequest {
  playerId: string;
  choice: number; // index of the choice
}

export interface VoteResponse {
  success: boolean;
  reason?: 'not_active' | 'paused' | 'invalid_choice' | 'eliminated' | 'invalid_request';
}

// WebSocket messages from server to host/spectators
export type WsMessage =
  | { type: 'player_joined'; count: number; nickname: string }
  | { type: 'round_start'; roundNum: number; prompt: string; choices: string[]; timeLimit: number; phase: Phase }
  | { type: 'vote_update'; counts: number[] }
  | { type: 'round_result'; survivors: string[]; eliminated: string[]; choiceCounts: number[] }
  | { type: 'game_end'; winner: string | null; rankings: { nickname: string; eliminatedRound: number | null }[] }
  | { type: 'state_sync'; state: GameState; data: unknown }
  | { type: 'round_invalid'; reason: string }
  | { type: 'pause'; paused: boolean };

export interface GameStatus {
  state: GameState;
  roundNum: number;
  survivorCount: number;
  totalPlayers: number;
  phase: Phase;
  currentPrompt: string;
  currentChoices: string[];
  paused: boolean;
}

export interface PlayerStatus {
  alive: boolean;
  state: GameState;
  roundNum: number;
  prompt: string;
  choices: string[];
  timeLimit: number;
  phase: Phase;
}
