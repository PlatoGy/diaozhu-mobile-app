import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, type ApiError } from "@/src/lib/api/errors";
import {
  configurationErrorResponse,
  validationErrorMessage,
} from "@/src/lib/api/room-errors";
import { readAdminSecretHeader, verifyAdminSecret } from "@/src/lib/auth/admin";
import { generatePlayerToken, hashPlayerToken } from "@/src/lib/auth/player-token";
import { getSql } from "@/src/lib/db";
import { createInitialGameState } from "@/src/lib/game/initial-state";
import type { RoomStatus, Seat } from "@/src/lib/game/types";
import { generateRoomCode } from "@/src/lib/room-code";
import { joinCodeForSeat, roomCodeSchema } from "@/src/lib/validation/join-code";
import { createRoomRequestSchema } from "@/src/lib/validation/rooms";

export const dynamic = "force-dynamic";

type CreatedRoomPlayer = {
  seat: Seat;
  nickname: string;
  joinCode: string;
  playerPath: string;
};

type CreateRoomResponse = {
  roomId: string;
  roomCode: string;
  players: CreatedRoomPlayer[];
};

type RoomListPlayer = {
  seat: Seat;
  nickname: string;
  joinCode: string | null;
};

type RoomListItem = {
  id: string;
  roomCode: string | null;
  status: RoomStatus;
  roundNumber: number;
  createdAt: string;
  updatedAt: string;
  players: RoomListPlayer[];
};

type ListRoomsResponse = {
  rooms: RoomListItem[];
};

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const createdRoomRowsSchema = z
  .array(
    z.object({
      room_id: z.uuid(),
      room_code: roomCodeSchema,
      seat: seatSchema,
      nickname: z.string(),
      join_code: z.string().regex(/^\d{5}$/),
    }),
  )
  .length(4);

const roomListRowsSchema = z.array(
  z.object({
    id: z.uuid(),
    room_code: roomCodeSchema.nullable(),
    status: z.enum(["waiting", "active", "round_finished", "archived"]),
    round_number: z.number().int().nonnegative(),
    created_at: z.string(),
    updated_at: z.string(),
    players: z.array(
      z.object({
        seat: seatSchema,
        nickname: z.string(),
        joinCode: z.string().regex(/^\d{5}$/).nullable(),
      }),
    ),
  }),
);

function unauthorizedResponse() {
  return apiErrorResponse("UNAUTHORIZED", "Invalid admin secret.", 401);
}

function insertPayloadForPlayers(players: { nickname: string }[]) {
  return players.map((player, seat) => {
    const rawToken = generatePlayerToken();
    const resolvedSeat = seat as Seat;

    return {
      seat: resolvedSeat,
      nickname: player.nickname,
      rawToken,
      tokenHash: hashPlayerToken(rawToken),
    };
  });
}

async function insertRoomWithPlayers(
  players: { nickname: string }[],
): Promise<{
  rows: unknown[];
}> {
  const sql = getSql();
  const playersWithTokens = insertPayloadForPlayers(players);
  const initialState = createInitialGameState();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const roomCode = generateRoomCode();
    const insertPlayersJson = JSON.stringify(
      playersWithTokens.map((player) => ({
        seat: player.seat,
        nickname: player.nickname,
        token_hash: player.tokenHash,
        join_code: joinCodeForSeat(roomCode, player.seat),
      })),
    );
    const rows = await sql`
      with new_room as (
        insert into rooms (room_code, status, round_number, current_state, version)
        values (${roomCode}, 'waiting', 0, ${JSON.stringify(initialState)}::jsonb, 0)
        on conflict (room_code) do nothing
        returning id, room_code
      ),
      new_players as (
        insert into room_players (room_id, seat, nickname, token_hash, join_code)
        select new_room.id, player.seat, player.nickname, player.token_hash, player.join_code
        from new_room
        cross join jsonb_to_recordset(${insertPlayersJson}::jsonb)
          as player(seat smallint, nickname text, token_hash text, join_code text)
        returning room_id, seat, nickname, join_code
      )
      select
        new_room.id as room_id,
        new_room.room_code,
        new_players.seat,
        new_players.nickname,
        new_players.join_code
      from new_room
      join new_players on new_players.room_id = new_room.id
      order by new_players.seat
    `;

    if (rows.length === 4) {
      return {
        rows,
      };
    }
  }

  return {
    rows: [],
  };
}

export async function POST(
  request: Request,
): Promise<NextResponse<CreateRoomResponse | ApiError>> {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = createRoomRequestSchema.safeParse(requestBody);

  if (!parsed.success) {
    return apiErrorResponse(
      "INVALID_REQUEST",
      validationErrorMessage(parsed.error),
      400,
    );
  }

  try {
    if (!verifyAdminSecret(parsed.data.adminSecret)) {
      return unauthorizedResponse();
    }

    const { rows } = await insertRoomWithPlayers(parsed.data.players);

    if (rows.length !== 4) {
      return apiErrorResponse("ROOM_CODE_EXHAUSTED", "Room code could not be allocated.", 503);
    }

    const createdRows = createdRoomRowsSchema.parse(rows);
    const roomId = createdRows[0]?.room_id;
    const roomCode = createdRows[0]?.room_code;

    if (!roomId || !roomCode) {
      return apiErrorResponse("ROOM_CREATE_FAILED", "Room was not created.", 500);
    }

    return NextResponse.json({
      roomId,
      roomCode,
      players: createdRows.map((row) => ({
        seat: row.seat,
        nickname: row.nickname,
        joinCode: row.join_code,
        playerPath: `/game/${roomId}/${row.join_code}`,
      })),
    });
  } catch (error) {
    const configResponse = configurationErrorResponse(error);

    if (configResponse) {
      return configResponse;
    }

    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        "DATABASE_RESPONSE_INVALID",
        "Database returned an unexpected room shape.",
        500,
      );
    }

    return apiErrorResponse("ROOM_CREATE_FAILED", "Room was not created.", 500);
  }
}

export async function GET(
  request: Request,
): Promise<NextResponse<ListRoomsResponse | ApiError>> {
  const adminSecret = readAdminSecretHeader(request);

  if (!adminSecret) {
    return unauthorizedResponse();
  }

  try {
    if (!verifyAdminSecret(adminSecret)) {
      return unauthorizedResponse();
    }

    const sql = getSql();
    const rows = await sql`
      select
        rooms.id,
        rooms.room_code,
        rooms.status,
        rooms.round_number,
        rooms.created_at::text as created_at,
        rooms.updated_at::text as updated_at,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'seat', room_players.seat,
              'nickname', room_players.nickname,
              'joinCode', room_players.join_code
            )
            order by room_players.seat
          ) filter (where room_players.id is not null),
          '[]'::jsonb
        ) as players
      from rooms
      left join room_players on room_players.room_id = rooms.id
      group by rooms.id
      order by rooms.created_at desc
    `;

    const roomRows = roomListRowsSchema.parse(rows);

    return NextResponse.json({
      rooms: roomRows.map((row) => ({
        id: row.id,
        roomCode: row.room_code,
        status: row.status,
        roundNumber: row.round_number,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        players: row.players,
      })),
    });
  } catch (error) {
    const configResponse = configurationErrorResponse(error);

    if (configResponse) {
      return configResponse;
    }

    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        "DATABASE_RESPONSE_INVALID",
        "Database returned an unexpected room shape.",
        500,
      );
    }

    return apiErrorResponse("ROOM_LIST_FAILED", "Rooms could not be loaded.", 500);
  }
}
