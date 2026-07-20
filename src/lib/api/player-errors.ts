import { apiErrorResponse } from "@/src/lib/api/errors";
import type { PlayerAccessFailureReason } from "@/src/lib/game/player-auth";

export function playerAccessErrorResponse(
  reason: PlayerAccessFailureReason | "invalid_persisted_state",
) {
  if (reason === "invalid_persisted_state") {
    return apiErrorResponse(
      "INVALID_PERSISTED_STATE",
      "Stored game state is invalid.",
      500,
    );
  }

  if (reason === "room_not_found") {
    return apiErrorResponse("ROOM_NOT_FOUND", "Room does not exist.", 404);
  }

  if (reason === "invalid_room_id") {
    return apiErrorResponse("INVALID_ROOM_ID", "Room ID must be a valid UUID.", 400);
  }

  return apiErrorResponse("INVALID_PLAYER_LINK", "Player link is invalid.", 403);
}
