"use client";

import type { PlayerStateResponse } from "../game/state-service";
import type { PlayerGameStateView } from "../game/player-view";
import type { GameActionType } from "../realtime/protocol";

export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
  };
};

export class GameApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorPayload).error.code === "string" &&
    typeof (value as ApiErrorPayload).error.message === "string"
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchGameState(
  roomId: string,
  playerToken: string,
): Promise<PlayerStateResponse> {
  const response = await fetch(`/api/game/${roomId}/state`, {
    headers: {
      "x-player-token": playerToken,
    },
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorPayload(payload)) {
      throw new GameApiError(payload.error.code, payload.error.message);
    }

    throw new GameApiError("GAME_STATE_FAILED", "牌局状态读取失败");
  }

  return payload as PlayerStateResponse;
}

export async function submitGameAction(input: {
  roomId: string;
  playerToken: string;
  requestId: string;
  expectedVersion: number;
  actionType: GameActionType;
  payload?: unknown;
}): Promise<PlayerGameStateView> {
  const response = await fetch(`/api/game/${input.roomId}/action`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-player-token": input.playerToken,
    },
    body: JSON.stringify({
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      actionType: input.actionType,
      payload: input.payload ?? {},
    }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiErrorPayload(payload)) {
      throw new GameApiError(payload.error.code, payload.error.message);
    }

    throw new GameApiError("GAME_ACTION_FAILED", "操作失败");
  }

  return payload as PlayerGameStateView;
}

export function ruleErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    STATE_VERSION_CONFLICT: "状态已更新，请重新操作",
    NOT_CURRENT_TURN: "还没轮到你",
    MUST_FOLLOW_CATEGORY: "必须跟首出花色",
    MUST_EXHAUST_LEAD_CATEGORY: "必须先出完首出花色",
    INVALID_CARD_COUNT: "出牌张数不正确",
    NOT_DEALER: "只有庄家可以操作",
    CARD_NOT_HIGHEST: "必须进贡当前最大的牌",
    INVALID_RETURN_OPTION: "这张牌不能用于回贡",
    CARD_NOT_IN_HAND: "选择的牌不在手牌中",
    NOT_DEALER_CANDIDATE: "你不是本局庄家候选人",
  };

  return messages[code] ?? "操作失败，请检查当前状态";
}
