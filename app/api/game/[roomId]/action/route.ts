import { NextResponse } from "next/server";

import { apiErrorResponse, type ApiError } from "@/src/lib/api/errors";
import { configurationErrorResponse } from "@/src/lib/api/room-errors";
import { playerAccessErrorResponse } from "@/src/lib/api/player-errors";
import { executeGameAction } from "@/src/lib/game/game-actions";
import { resolvePlayerAccess } from "@/src/lib/game/player-auth";
import type { PlayerGameStateView } from "@/src/lib/game/player-view";
import { publishRoomStateChanged } from "@/src/lib/realtime/publisher";
import { gameActionRequestSchema } from "@/src/lib/validation/game-action";

export const dynamic = "force-dynamic";

type ActionRouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function POST(
  request: Request,
  context: ActionRouteContext,
): Promise<NextResponse<PlayerGameStateView | ApiError>> {
  const { roomId } = await context.params;
  const rawToken = request.headers.get("x-player-token");

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsedBody = gameActionRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return apiErrorResponse("INVALID_REQUEST", "Action request is invalid.", 400);
  }

  try {
    const access = await resolvePlayerAccess(roomId, rawToken);

    if (!access.ok) {
      return playerAccessErrorResponse(access.reason);
    }

    const result = await executeGameAction({
      roomId,
      player: access.player,
      requestId: parsedBody.data.requestId,
      expectedVersion: parsedBody.data.expectedVersion,
      actionType: parsedBody.data.actionType,
      payload: parsedBody.data.payload,
    });

    if (!result.ok) {
      const badRequestCodes = new Set([
        "RULE_ERROR",
        "INVALID_ACTION",
        "GAME_STATE_NOT_INITIALIZED",
        "BETWEEN_ROUNDS_STATE_NOT_FOUND",
        "NOT_DEALER_CANDIDATE",
        "DEALER_ALREADY_RESOLVED",
        "DEALER_NOT_RESOLVED",
        "INVALID_DEALER_CANDIDATES",
      ]);
      const status =
        result.error.code === "STATE_VERSION_CONFLICT"
          ? 409
          : result.error.code === "ROOM_NOT_FOUND"
            ? 404
            : badRequestCodes.has(result.error.code)
              ? 400
              : 500;

      return apiErrorResponse(
        result.error.ruleErrorCode ?? result.error.code,
        result.error.message,
        status,
      );
    }

    if (!result.duplicate) {
      publishRoomStateChanged({
        roomId,
        stateVersion: result.view.stateVersion,
        actionType: parsedBody.data.actionType,
      });
    }

    return NextResponse.json(result.view);
  } catch (error) {
    const configResponse = configurationErrorResponse(error);

    if (configResponse) {
      return configResponse;
    }

    return apiErrorResponse("GAME_ACTION_FAILED", "Game action could not be handled.", 500);
  }
}
