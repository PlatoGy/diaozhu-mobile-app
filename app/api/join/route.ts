import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, type ApiError } from "@/src/lib/api/errors";
import { configurationErrorResponse } from "@/src/lib/api/room-errors";
import { getSql } from "@/src/lib/db";
import type { Seat } from "@/src/lib/game/types";
import { joinCodeSchema, parseJoinCodeSeat } from "@/src/lib/validation/join-code";

export const dynamic = "force-dynamic";

type JoinRoomResponse = {
  roomId: string;
  seat: Seat;
  nickname: string;
  playerPath: string;
};

const joinRoomRequestSchema = z
  .object({
    joinCode: joinCodeSchema,
  })
  .strict();

const joinRoomRowsSchema = z.array(
  z.object({
    room_id: z.uuid(),
    seat: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    nickname: z.string(),
  }),
);

export async function POST(
  request: Request,
): Promise<NextResponse<JoinRoomResponse | ApiError>> {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = joinRoomRequestSchema.safeParse(requestBody);

  if (!parsed.success || parseJoinCodeSeat(parsed.data.joinCode) === null) {
    return apiErrorResponse("INVALID_JOIN_CODE", "请输入有效的五位房间号。", 400);
  }

  try {
    const sql = getSql();
    const rows = await sql`
      select room_players.room_id, room_players.seat, room_players.nickname
      from room_players
      join rooms on rooms.id = room_players.room_id
      where room_players.join_code = ${parsed.data.joinCode}
      limit 1
    `;
    const parsedRows = joinRoomRowsSchema.parse(rows);
    const row = parsedRows[0];

    if (!row) {
      return apiErrorResponse("JOIN_CODE_NOT_FOUND", "没有找到这个房间号。", 404);
    }

    return NextResponse.json({
      roomId: row.room_id,
      seat: row.seat,
      nickname: row.nickname,
      playerPath: `/game/${row.room_id}/${parsed.data.joinCode}`,
    });
  } catch (error) {
    const configResponse = configurationErrorResponse(error);

    if (configResponse) {
      return configResponse;
    }

    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        "DATABASE_RESPONSE_INVALID",
        "Database returned an unexpected join code shape.",
        500,
      );
    }

    return apiErrorResponse("JOIN_ROOM_FAILED", "进入房间失败。", 500);
  }
}
