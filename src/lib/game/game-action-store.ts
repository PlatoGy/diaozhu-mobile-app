import { z } from "zod";

import { withDatabaseTransaction } from "../db";

import type { PlayerGameStateView } from "./player-view";
import type { ServerGameState, RoomStatus, Seat } from "./types";
import type { ServerGameActionError } from "./game-action-errors";

export type GameRoomActionRecord = {
  roomId: string;
  status: RoomStatus;
  roundNumber: number;
  stateVersion: number;
  currentState: unknown;
  players: Array<{
    seat: Seat;
    nickname: string;
  }>;
};

export type GameActionExecution = {
  nextState: ServerGameState;
  nextRoomStatus: RoomStatus;
  nextRoundNumber: number;
  view: PlayerGameStateView;
};

export type GameActionStoreResult =
  | {
      ok: true;
      view: PlayerGameStateView;
      duplicate: boolean;
    }
  | {
      ok: false;
      error: ServerGameActionError;
    };

export type GameActionStoreCallbackResult =
  | GameActionStoreResult
  | {
      ok: true;
      execution: GameActionExecution;
    };

export type GameActionStoreInput = {
  roomId: string;
  requestId: string;
  seat: Seat;
  actionType: string;
  expectedVersion: number;
  execute: (record: GameRoomActionRecord) =>
    | GameActionStoreCallbackResult
    | Promise<GameActionStoreCallbackResult>;
};

export interface GameActionStore {
  execute(input: GameActionStoreInput): Promise<GameActionStoreResult>;
}

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const versionSchema = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform((value) => Number(value))
  .pipe(z.number().int().nonnegative());

const roomRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(["waiting", "active", "round_finished", "archived"]),
  round_number: z.number().int().nonnegative(),
  version: versionSchema,
  current_state: z.unknown(),
});
const playersRowSchema = z.array(
  z.object({
    seat: seatSchema,
    nickname: z.string(),
  }),
);

const requestRowSchema = z.object({
  result: z.unknown(),
});

function databaseError(message = "Game action database operation failed."): GameActionStoreResult {
  return {
    ok: false,
    error: {
      code: "DATABASE_ERROR",
      message,
    },
  };
}

export class NeonGameActionStore implements GameActionStore {
  async execute(input: GameActionStoreInput): Promise<GameActionStoreResult> {
    try {
      return await withDatabaseTransaction(async (client) => {
        const existingRequest = await client.query(
          `
            select result
            from game_action_requests
            where room_id = $1 and request_id = $2
            limit 1
          `,
          [input.roomId, input.requestId],
        );
        const parsedExisting = requestRowSchema.safeParse(existingRequest.rows[0]);

        if (parsedExisting.success) {
          return {
            ok: true,
            view: parsedExisting.data.result as PlayerGameStateView,
            duplicate: true,
          };
        }

        const roomRows = await client.query(
          `
            select
              id,
              status,
              round_number,
              version,
              current_state
            from rooms
            where id = $1
            for update
          `,
          [input.roomId],
        );
        const parsedRoom = roomRowSchema.safeParse(roomRows.rows[0]);

        if (!parsedRoom.success) {
          return {
            ok: false,
            error: {
              code: "ROOM_NOT_FOUND",
              message: "Room does not exist.",
            },
          };
        }

        const playerRows = await client.query(
          `
            select seat, nickname
            from room_players
            where room_id = $1
            order by seat
          `,
          [input.roomId],
        );
        const parsedPlayers = playersRowSchema.safeParse(playerRows.rows);

        if (!parsedPlayers.success) {
          return databaseError("Room players have an unexpected shape.");
        }

        if (parsedRoom.data.version !== input.expectedVersion) {
          return {
            ok: false,
            error: {
              code: "STATE_VERSION_CONFLICT",
              message: "Game state version does not match expectedVersion.",
              details: {
                currentVersion: parsedRoom.data.version,
                expectedVersion: input.expectedVersion,
              },
            },
          };
        }

        const executionResult = await input.execute({
          roomId: parsedRoom.data.id,
          status: parsedRoom.data.status,
          roundNumber: parsedRoom.data.round_number,
          stateVersion: parsedRoom.data.version,
          currentState: parsedRoom.data.current_state,
          players: parsedPlayers.data,
        });

        if (!executionResult.ok) {
          return executionResult;
        }

        if (!("execution" in executionResult)) {
          return executionResult;
        }

        const stateVersionAfter = parsedRoom.data.version + 1;

        await client.query(
          `
            update rooms
            set
              status = $2,
              round_number = $3,
              current_state = $4::jsonb,
              version = $5
            where id = $1
          `,
          [
            input.roomId,
            executionResult.execution.nextRoomStatus,
            executionResult.execution.nextRoundNumber,
            JSON.stringify(executionResult.execution.nextState),
            stateVersionAfter,
          ],
        );
        const view = {
          ...executionResult.execution.view,
          stateVersion: stateVersionAfter,
        };

        await client.query(
          `
            insert into game_action_requests (
              room_id,
              request_id,
              seat,
              action_type,
              state_version_before,
              state_version_after,
              result
            )
            values ($1, $2, $3, $4, $5, $6, $7::jsonb)
          `,
          [
            input.roomId,
            input.requestId,
            input.seat,
            input.actionType,
            parsedRoom.data.version,
            stateVersionAfter,
            JSON.stringify(view),
          ],
        );

        return {
          ok: true,
          view,
          duplicate: false,
        };
      });
    } catch {
      return databaseError();
    }
  }
}

let defaultGameActionStore: GameActionStore | null = null;

export function getGameActionStore(): GameActionStore {
  if (!defaultGameActionStore) {
    defaultGameActionStore = new NeonGameActionStore();
  }

  return defaultGameActionStore;
}
