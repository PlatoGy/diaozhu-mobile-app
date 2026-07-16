export type Seat = 0 | 1 | 2 | 3;

export type RoomStatus = "waiting" | "active" | "round_finished" | "archived";

export type GamePhase = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface Room {
  id: string;
  status: RoomStatus;
  roundNumber: number;
  currentState: ServerGameState | JsonObject;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomPlayer {
  id: string;
  roomId: string;
  seat: Seat;
  nickname: string;
  tokenHash: string;
  createdAt: string;
}

export interface PlayerSummary {
  id: string;
  seat: Seat;
  nickname: string;
}

export interface GameActionRecord {
  id: string;
  seat: Seat | null;
  phase: GamePhase;
  type: string;
  payload: JsonObject;
  createdAt: string;
}

export interface ServerGameState {
  phase: GamePhase;
  currentSeat: Seat | null;
  roundNumber: number;
  publicState: JsonObject;
  privateStateBySeat: Record<Seat, JsonObject>;
  actionHistory: JsonValue[];
  version: number;
}

export interface PlayerGameView {
  room: Room;
  player: PlayerSummary;
  players: PlayerSummary[];
  phase: GamePhase;
  currentSeat: Seat | null;
  roundNumber: number;
  publicState: JsonObject;
  privateState: JsonObject;
  actionHistory: JsonValue[];
  version: number;
}

export interface RoundRecord {
  id: string;
  roomId: string;
  roundNumber: number;
  record: JsonObject;
  createdAt: string;
}
