import { NextResponse } from "next/server";

import { apiErrorResponse, type ApiError } from "@/src/lib/api/errors";
import { configurationErrorResponse } from "@/src/lib/api/room-errors";
import { playerAccessErrorResponse } from "@/src/lib/api/player-errors";
import {
  getPlayerStateForToken,
  type PlayerStateResponse,
} from "@/src/lib/game/state-service";

export const dynamic = "force-dynamic";

type StateRouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function GET(
  request: Request,
  context: StateRouteContext,
): Promise<NextResponse<PlayerStateResponse | ApiError>> {
  const { roomId } = await context.params;
  const rawToken = request.headers.get("x-player-token");

  try {
    const result = await getPlayerStateForToken(roomId, rawToken);

    if (!result.ok) {
      return playerAccessErrorResponse(result.reason);
    }

    return NextResponse.json(result.state);
  } catch (error) {
    const configResponse = configurationErrorResponse(error);

    if (configResponse) {
      return configResponse;
    }

    return apiErrorResponse("GAME_STATE_FAILED", "Game state could not be loaded.", 500);
  }
}
