import { describe, expect, it } from "vitest";

import { createRoomRequestSchema, roomIdSchema } from "./rooms";

describe("createRoomRequestSchema", () => {
  it("trims nicknames and accepts exactly four players", () => {
    const result = createRoomRequestSchema.parse({
      adminSecret: "secret",
      players: [
        { nickname: " Alice " },
        { nickname: "Bob" },
        { nickname: "Carol" },
        { nickname: "Dave" },
      ],
    });

    expect(result.players[0]?.nickname).toBe("Alice");
  });

  it("rejects fewer than four players", () => {
    const result = createRoomRequestSchema.safeParse({
      adminSecret: "secret",
      players: [{ nickname: "Alice" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects blank and overlong nicknames", () => {
    expect(
      createRoomRequestSchema.safeParse({
        adminSecret: "secret",
        players: [
          { nickname: "Alice" },
          { nickname: "" },
          { nickname: "Carol" },
          { nickname: "Dave" },
        ],
      }).success,
    ).toBe(false);

    expect(
      createRoomRequestSchema.safeParse({
        adminSecret: "secret",
        players: [
          { nickname: "Alice" },
          { nickname: "Bob" },
          { nickname: "Carol" },
          { nickname: "x".repeat(25) },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("roomIdSchema", () => {
  it("accepts UUIDs only", () => {
    expect(roomIdSchema.safeParse("2f7d90e6-bde2-48aa-83a8-3c2efb14228f").success).toBe(
      true,
    );
    expect(roomIdSchema.safeParse("not-a-room-id").success).toBe(false);
  });
});
