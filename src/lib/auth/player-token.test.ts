import { describe, expect, it } from "vitest";

import { generatePlayerToken, hashPlayerToken } from "./player-token";

describe("player tokens", () => {
  it("generates high entropy URL-safe tokens", () => {
    const first = generatePlayerToken();
    const second = generatePlayerToken();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes tokens with SHA-256 hex output", () => {
    expect(hashPlayerToken("player-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPlayerToken("player-token")).toBe(hashPlayerToken("player-token"));
    expect(hashPlayerToken("player-token")).not.toBe(hashPlayerToken("other-token"));
  });
});
