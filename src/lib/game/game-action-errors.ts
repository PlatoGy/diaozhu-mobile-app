import type { GameRuleError } from "./types";

export type ServerGameErrorCode =
  | "ROOM_NOT_FOUND"
  | "PLAYER_NOT_FOUND"
  | "SEAT_ACCESS_DENIED"
  | "GAME_STATE_NOT_INITIALIZED"
  | "INVALID_PERSISTED_STATE"
  | "STATE_VERSION_CONFLICT"
  | "DUPLICATE_REQUEST"
  | "DATABASE_ERROR"
  | "INVALID_ACTION"
  | "RULE_ERROR"
  | "BETWEEN_ROUNDS_STATE_NOT_FOUND"
  | "NOT_DEALER_CANDIDATE"
  | "DEALER_ALREADY_RESOLVED"
  | "DEALER_NOT_RESOLVED"
  | "INVALID_DEALER_CANDIDATES";

export type ServerGameActionError = {
  code: ServerGameErrorCode;
  ruleErrorCode?: string;
  message: string;
  details?: unknown;
};

export function ruleError(error: GameRuleError): ServerGameActionError {
  return {
    code: "RULE_ERROR",
    ruleErrorCode: error.code,
    message: error.message,
    details: error,
  };
}
