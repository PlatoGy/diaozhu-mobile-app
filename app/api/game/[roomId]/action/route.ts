import type { NextResponse } from "next/server";

import { apiErrorResponse, type ApiError } from "@/src/lib/api/errors";
import { configurationErrorResponse } from "@/src/lib/api/room-errors";
import { playerAccessErrorResponse } from "@/src/lib/api/player-errors";
import { getPlayerStateForToken } from "@/src/lib/game/state-service";
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
): Promise<NextResponse<ApiError>> {
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
    const stateResult = await getPlayerStateForToken(roomId, rawToken);

    if (!stateResult.ok) {
      return playerAccessErrorResponse(stateResult.reason);
    }

    if (parsedBody.data.expectedVersion !== stateResult.state.room.version) {
      return apiErrorResponse(
        "VERSION_CONFLICT",
        "Game state version does not match expectedVersion.",
        409,
      );
    }

    return apiErrorResponse(
      "GAME_RULES_NOT_CONFIGURED",
      "Game rules are not configured.",
      501,
    );
  } catch (error) {
    const configResponse = configurationErrorResponse(error);

    if (configResponse) {
      return configResponse;
    }

    return apiErrorResponse("GAME_ACTION_FAILED", "Game action could not be handled.", 500);
  }
}
