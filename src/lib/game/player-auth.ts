import { z } from "zod";

import { hashPlayerToken } from "../auth/player-token";
import { roomIdSchema } from "../validation/rooms";

import type { GameQueryable } from "./queryable";
import { getGameQueryable } from "./queryable";
import type { Seat } from "./types";

export type ResolvedPlayer = {
  playerId: string;
  roomId: string;
  seat: Seat;
  nickname: string;
};

export type PlayerAccessFailureReason =
  | "invalid_room_id"
  | "missing_token"
  | "room_not_found"
  | "invalid_token";

export type PlayerAccessResult =
  | {
      ok: true;
      player: ResolvedPlayer;
    }
  | {
      ok: false;
      reason: PlayerAccessFailureReason;
    };

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const playerRowSchema = z.object({
  id: z.uuid(),
  room_id: z.uuid(),
  seat: seatSchema,
  nickname: z.string(),
});

const roomExistsRowSchema = z.object({
  id: z.uuid(),
});

export async function roomExists(
  roomId: string,
  queryable: GameQueryable = getGameQueryable(),
): Promise<boolean> {
  const parsedRoomId = roomIdSchema.safeParse(roomId);

  if (!parsedRoomId.success) {
    return false;
  }

  const rows = await queryable.query("select id from rooms where id = $1 limit 1", [
    parsedRoomId.data,
  ]);

  return rows.some((row) => roomExistsRowSchema.safeParse(row).success);
}

export async function resolvePlayer(
  roomId: string,
  rawToken: string,
  queryable: GameQueryable = getGameQueryable(),
): Promise<ResolvedPlayer | null> {
  const parsedRoomId = roomIdSchema.safeParse(roomId);

  if (!parsedRoomId.success || rawToken.length === 0) {
    return null;
  }

  const tokenHash = hashPlayerToken(rawToken);
  const rows = await queryable.query(
    `
      select id, room_id, seat, nickname
      from room_players
      where room_id = $1 and token_hash = $2
      limit 1
    `,
    [parsedRoomId.data, tokenHash],
  );
  const parsedRow = playerRowSchema.safeParse(rows[0]);

  if (!parsedRow.success) {
    return null;
  }

  return {
    playerId: parsedRow.data.id,
    roomId: parsedRow.data.room_id,
    seat: parsedRow.data.seat,
    nickname: parsedRow.data.nickname,
  };
}

export async function resolvePlayerAccess(
  roomId: string,
  rawToken: string | null,
  queryable: GameQueryable = getGameQueryable(),
): Promise<PlayerAccessResult> {
  const parsedRoomId = roomIdSchema.safeParse(roomId);

  if (!parsedRoomId.success) {
    return {
      ok: false,
      reason: "invalid_room_id",
    };
  }

  if (!rawToken) {
    return {
      ok: false,
      reason: "missing_token",
    };
  }

  if (!(await roomExists(parsedRoomId.data, queryable))) {
    return {
      ok: false,
      reason: "room_not_found",
    };
  }

  const player = await resolvePlayer(parsedRoomId.data, rawToken, queryable);

  if (!player) {
    return {
      ok: false,
      reason: "invalid_token",
    };
  }

  return {
    ok: true,
    player,
  };
}
