import { z } from "zod";

import type { GameQueryable } from "./queryable";
import { getGameQueryable } from "./queryable";
import {
  resolvePlayerAccess,
  type PlayerAccessFailureReason,
} from "./player-auth";
import { parsePersistedGameState } from "./game-state-schema";
import { createPlayerGameView, type PlayerGameStateView } from "./player-view";
import type { RoomStatus, Seat } from "./types";

export type PlayerStateResponse = {
  room: {
    id: string;
    status: RoomStatus;
    roundNumber: number;
    version: number;
  };
  me: {
    seat: Seat;
    nickname: string;
  };
  players: Array<{
    seat: Seat;
    nickname: string;
  }>;
  game: PlayerGameStateView;
};

export type PlayerStateResult =
  | {
      ok: true;
      state: PlayerStateResponse;
    }
  | {
      ok: false;
      reason: PlayerAccessFailureReason | "invalid_persisted_state";
    };

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const dbPositiveIntegerSchema = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform((value) => Number(value))
  .pipe(z.number().int().nonnegative());

const roomStateRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(["waiting", "active", "round_finished", "archived"]),
  round_number: z.number().int().nonnegative(),
  version: dbPositiveIntegerSchema,
  current_state: z.unknown(),
  players: z.array(
    z.object({
      seat: seatSchema,
      nickname: z.string(),
    }),
  ),
});

export async function getPlayerStateForToken(
  roomId: string,
  rawToken: string | null,
  queryable: GameQueryable = getGameQueryable(),
): Promise<PlayerStateResult> {
  const access = await resolvePlayerAccess(roomId, rawToken, queryable);

  if (!access.ok) {
    return {
      ok: false,
      reason: access.reason,
    };
  }

  const rows = await queryable.query(
    `
      select
        rooms.id,
        rooms.status,
        rooms.round_number,
        rooms.version,
        rooms.current_state,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'seat', room_players.seat,
              'nickname', room_players.nickname
            )
            order by room_players.seat
          ) filter (where room_players.id is not null),
          '[]'::jsonb
        ) as players
      from rooms
      left join room_players on room_players.room_id = rooms.id
      where rooms.id = $1
      group by rooms.id
      limit 1
    `,
    [access.player.roomId],
  );
  const parsedRow = roomStateRowSchema.safeParse(rows[0]);

  if (!parsedRow.success) {
    return {
      ok: false,
      reason: "room_not_found",
    };
  }

  const gameState = parsePersistedGameState(parsedRow.data.current_state);

  if (!gameState) {
    return {
      ok: false,
      reason: "invalid_persisted_state",
    };
  }

  const game = createPlayerGameView(
    parsedRow.data.id,
    gameState,
    access.player.seat,
    parsedRow.data.version,
  );

  return {
    ok: true,
    state: {
      room: {
        id: parsedRow.data.id,
        status: parsedRow.data.status,
        roundNumber: parsedRow.data.round_number,
        version: parsedRow.data.version,
      },
      me: {
        seat: access.player.seat,
        nickname: access.player.nickname,
      },
      players: parsedRow.data.players,
      game,
    },
  };
}
