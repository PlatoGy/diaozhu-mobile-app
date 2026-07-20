import { describe, expect, it } from "vitest";

import { getReconnectDelayMs } from "./use-game-room-socket";

describe("getReconnectDelayMs", () => {
  it("backs off and caps at 10 seconds", () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(getReconnectDelayMs)).toEqual([
      500,
      1000,
      2000,
      4000,
      8000,
      10_000,
      10_000,
    ]);
  });
});
