import { getRoomWebSocketHub } from "./room-hub";
import type { GameActionType } from "./protocol";

type PublishRoomStateChangedInput = {
  roomId: string;
  stateVersion: number;
  actionType: string;
};

const GAME_ACTION_TYPES = new Set<string>([
  "SET_READY",
  "PREPARE_NEXT_ROUND",
  "CHOOSE_DEALER",
  "RESOLVE_DEALER_SELECTION",
  "START_NEXT_ROUND",
  "START_ROUND",
  "DEAL_CARDS",
  "RESOLVE_HEAVENLY_TRUMP",
  "PLACE_TRUMP_BID",
  "RESOLVE_TRUMP",
  "SUBMIT_TRIBUTE",
  "SUBMIT_RETURN_TRIBUTE",
  "TAKE_BOTTOM",
  "BURY_BOTTOM",
  "PLAY_CARDS",
  "RESOLVE_CURRENT_TRICK",
]);

export function publishRoomStateChanged(input: PublishRoomStateChangedInput): void {
  if (!GAME_ACTION_TYPES.has(input.actionType)) {
    return;
  }

  getRoomWebSocketHub().broadcastStateChanged({
    roomId: input.roomId,
    stateVersion: input.stateVersion,
    actionType: input.actionType as GameActionType,
  });
}
