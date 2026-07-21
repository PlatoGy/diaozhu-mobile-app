import { describe, expect, it } from "vitest";

import { hashPlayerToken } from "../auth/player-token";
import { gameActionRequestSchema } from "../validation/game-action";

import type { GameQueryable } from "./queryable";
import { resolvePlayerAccess } from "./player-auth";
import { getPlayerStateForToken } from "./state-service";
import { toPlayerView } from "./state";
import type { JsonObject, Seat } from "./types";

const roomAId = "2f7d90e6-bde2-48aa-83a8-3c2efb14228f";
const roomBId = "5ea6f1a8-3283-414a-81e1-08a397c5caa2";

type FakePlayer = {
  id: string;
  roomId: string;
  seat: Seat;
  nickname: string;
  tokenHash: string;
  joinCode: string;
};

type FakeRoom = {
  id: string;
  status: "waiting";
  roundNumber: number;
  version: number;
  currentState: JsonObject;
};

function playerIdForSeat(seat: Seat): string {
  const ids: Record<Seat, string> = {
    0: "1f8e97f5-2fc2-4ae1-8d11-b6d221a2b9b0",
    1: "36530765-51d9-49b2-b093-62b6ef88f745",
    2: "2727ac6d-94d3-4d38-b8d9-0220370ce489",
    3: "af2ea6b4-0162-4bc7-a65a-6172d91e0682",
  };

  return ids[seat];
}

function createFakeQueryable(includeRoomA = true): {
  queryable: GameQueryable;
  tokensBySeat: Record<Seat, string>;
  roomBToken: string;
} {
  const tokensBySeat: Record<Seat, string> = {
    0: "room-a-seat-0-token",
    1: "room-a-seat-1-token",
    2: "room-a-seat-2-token",
    3: "room-a-seat-3-token",
  };
  const roomBToken = "room-b-seat-0-token";
  const rooms = new Map<string, FakeRoom>();

  if (includeRoomA) {
    rooms.set(roomAId, {
      id: roomAId,
      status: "waiting",
      roundNumber: 0,
      version: 1,
      currentState: {
        phase: "waiting_for_players",
        currentSeat: null,
        roundNumber: 0,
        publicState: {
          table: "public",
        },
        privateStateBySeat: {
          0: { secret: "seat-0-private" },
          1: { secret: "seat-1-private" },
          2: { secret: "seat-2-private" },
          3: { secret: "seat-3-private" },
        },
        actionHistory: [],
        version: 1,
      },
    });
  }

  rooms.set(roomBId, {
    id: roomBId,
    status: "waiting",
    roundNumber: 0,
    version: 1,
    currentState: {},
  });

  const players: FakePlayer[] = [
    {
      id: playerIdForSeat(0),
      roomId: roomAId,
      seat: 0,
      nickname: "Alice",
      tokenHash: hashPlayerToken(tokensBySeat[0]),
      joinCode: "12341",
    },
    {
      id: playerIdForSeat(1),
      roomId: roomAId,
      seat: 1,
      nickname: "Bob",
      tokenHash: hashPlayerToken(tokensBySeat[1]),
      joinCode: "12342",
    },
    {
      id: playerIdForSeat(2),
      roomId: roomAId,
      seat: 2,
      nickname: "Carol",
      tokenHash: hashPlayerToken(tokensBySeat[2]),
      joinCode: "12343",
    },
    {
      id: playerIdForSeat(3),
      roomId: roomAId,
      seat: 3,
      nickname: "Dave",
      tokenHash: hashPlayerToken(tokensBySeat[3]),
      joinCode: "12344",
    },
    {
      id: "f2c5342f-ee6f-4d9c-9702-28665b26e9b8",
      roomId: roomBId,
      seat: 0,
      nickname: "Other",
      tokenHash: hashPlayerToken(roomBToken),
      joinCode: "56781",
    },
  ];

  const queryable: GameQueryable = {
    async query(queryText, params) {
      if (queryText.includes("select id from rooms")) {
        const roomId = String(params[0]);
        const room = rooms.get(roomId);

        return room ? [{ id: room.id }] : [];
      }

      if (queryText.includes("from room_players")) {
        const roomId = String(params[0]);
        const tokenHash = String(params[1]);
        const joinCode = typeof params[2] === "string" ? params[2] : null;
        const player = players.find(
          (candidate) =>
            candidate.roomId === roomId &&
            (candidate.tokenHash === tokenHash || candidate.joinCode === joinCode) &&
            rooms.has(candidate.roomId),
        );

        return player
          ? [
              {
                id: player.id,
                room_id: player.roomId,
                seat: player.seat,
                nickname: player.nickname,
              },
            ]
          : [];
      }

      if (queryText.includes("rooms.current_state")) {
        const roomId = String(params[0]);
        const room = rooms.get(roomId);

        if (!room) {
          return [];
        }

        return [
          {
            id: room.id,
            status: room.status,
            round_number: room.roundNumber,
            version: room.version,
            current_state: room.currentState,
            players: players
              .filter((player) => player.roomId === roomId)
              .map((player) => ({
                seat: player.seat,
                nickname: player.nickname,
              })),
          },
        ];
      }

      return [];
    },
  };

  return {
    queryable,
    tokensBySeat,
    roomBToken,
  };
}

describe("player access", () => {
  it("resolves four valid links to seats 0, 1, 2, and 3", async () => {
    const { queryable, tokensBySeat } = createFakeQueryable();

    await Promise.all(
      ([0, 1, 2, 3] as Seat[]).map(async (seat) => {
        const result = await resolvePlayerAccess(roomAId, tokensBySeat[seat], queryable);

        expect(result.ok).toBe(true);

        if (result.ok) {
          expect(result.player.seat).toBe(seat);
        }
      }),
    );
  });

  it("rejects a wrong token", async () => {
    const { queryable } = createFakeQueryable();
    const result = await resolvePlayerAccess(roomAId, "wrong-token", queryable);

    expect(result).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("resolves five-digit join codes to fixed player seats", async () => {
    const { queryable } = createFakeQueryable();

    await Promise.all(
      ([0, 1, 2, 3] as Seat[]).map(async (seat) => {
        const result = await resolvePlayerAccess(roomAId, `1234${seat + 1}`, queryable);

        expect(result.ok).toBe(true);

        if (result.ok) {
          expect(result.player.seat).toBe(seat);
        }
      }),
    );
  });

  it("rejects another room's five-digit join code", async () => {
    const { queryable } = createFakeQueryable();
    const result = await resolvePlayerAccess(roomAId, "56781", queryable);

    expect(result).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("does not allow a token from one room to enter another room", async () => {
    const { queryable, tokensBySeat } = createFakeQueryable();
    const result = await resolvePlayerAccess(roomBId, tokensBySeat[0], queryable);

    expect(result).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("treats deleted rooms as inaccessible", async () => {
    const { queryable, tokensBySeat } = createFakeQueryable(false);
    const result = await getPlayerStateForToken(roomAId, tokensBySeat[0], queryable);

    expect(result).toEqual({
      ok: false,
      reason: "room_not_found",
    });
  });
});

describe("player-visible state", () => {
  it("does not include other seats' private state", () => {
    const view = toPlayerView(
      {
        phase: "waiting_for_players",
        currentSeat: null,
        roundNumber: 0,
        publicState: { table: "public" },
        privateStateBySeat: {
          0: { secret: "seat-0-private" },
          1: { secret: "seat-1-private" },
          2: { secret: "seat-2-private" },
          3: { secret: "seat-3-private" },
        },
        actionHistory: [],
        version: 1,
      },
      0,
    );
    const serializedView = JSON.stringify(view);

    expect(serializedView).toContain("seat-0-private");
    expect(serializedView).not.toContain("seat-1-private");
    expect(serializedView).not.toContain("seat-2-private");
    expect(serializedView).not.toContain("seat-3-private");
  });

  it("does not include raw tokens in normal state responses", async () => {
    const { queryable, tokensBySeat } = createFakeQueryable();
    const result = await getPlayerStateForToken(roomAId, tokensBySeat[0], queryable);
    const serializedResult = JSON.stringify(result);

    expect(result.ok).toBe(true);
    expect(serializedResult).not.toContain(tokensBySeat[0]);
    expect(serializedResult).not.toContain(hashPlayerToken(tokensBySeat[0]));
  });
});

describe("gameActionRequestSchema", () => {
  it("rejects attempts to submit a complete current_state override", () => {
    const result = gameActionRequestSchema.safeParse({
      actionType: "replace-state",
      payload: {},
      expectedVersion: 1,
      current_state: {
        phase: "cheat",
      },
    });

    expect(result.success).toBe(false);
  });
});
