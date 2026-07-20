import type { Seat } from "../game/types";

export type GameActionType =
  | "SET_READY"
  | "PREPARE_NEXT_ROUND"
  | "CHOOSE_DEALER"
  | "RESOLVE_DEALER_SELECTION"
  | "START_NEXT_ROUND"
  | "START_ROUND"
  | "DEAL_CARDS"
  | "RESOLVE_HEAVENLY_TRUMP"
  | "PLACE_TRUMP_BID"
  | "SKIP_TRUMP_BID"
  | "RESOLVE_TRUMP"
  | "SUBMIT_TRIBUTE"
  | "SUBMIT_RETURN_TRIBUTE"
  | "TAKE_BOTTOM"
  | "BURY_BOTTOM"
  | "PLAY_CARDS"
  | "RESOLVE_CURRENT_TRICK";

export type ClientWebSocketMessage =
  | {
      type: "AUTH";
      roomId: string;
      playerToken: string;
    }
  | {
      type: "PING";
    };

export type ServerWebSocketMessage =
  | {
      type: "AUTH_OK";
      roomId: string;
      seat: Seat;
      stateVersion: number;
    }
  | {
      type: "ROOM_STATE_CHANGED";
      roomId: string;
      stateVersion: number;
      actionType: GameActionType;
    }
  | {
      type: "PONG";
    }
  | {
      type: "ERROR";
      code: string;
      message: string;
    };

export function parseClientWebSocketMessage(
  value: unknown,
): ClientWebSocketMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (record.type === "PING") {
    return { type: "PING" };
  }

  if (
    record.type === "AUTH" &&
    typeof record.roomId === "string" &&
    typeof record.playerToken === "string"
  ) {
    return {
      type: "AUTH",
      roomId: record.roomId,
      playerToken: record.playerToken,
    };
  }

  return null;
}

export function serializeServerMessage(message: ServerWebSocketMessage): string {
  return JSON.stringify(message);
}
