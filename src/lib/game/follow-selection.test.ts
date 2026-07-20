import { describe, expect, it } from "vitest";

import { getDisabledFollowCardIds } from "./follow-selection";
import type { Card, StandardRank, StandardSuit } from "./types";

function card(
  id: string,
  originalSuit: StandardSuit,
  rank: StandardRank,
): Card {
  return {
    id,
    deckIndex: 0,
    originalSuit,
    rank,
  };
}

describe("getDisabledFollowCardIds", () => {
  it("disables non-lead-suit cards when the hand has enough cards to follow", () => {
    const hand = [
      card("s-7", "spades", "7"),
      card("s-8", "spades", "8"),
      card("h-9", "hearts", "9"),
      card("c-10", "clubs", "10"),
    ];

    expect(
      getDisabledFollowCardIds({
        hand,
        trumpSuit: "hearts",
        leadCategory: "spades",
        expectedCardCount: 2,
        shouldFollowLead: true,
      }),
    ).toEqual(["h-9", "c-10"]);
  });

  it("keeps every card selectable when the hand cannot fully follow", () => {
    const hand = [
      card("s-7", "spades", "7"),
      card("h-9", "hearts", "9"),
      card("c-10", "clubs", "10"),
    ];

    expect(
      getDisabledFollowCardIds({
        hand,
        trumpSuit: "hearts",
        leadCategory: "spades",
        expectedCardCount: 2,
        shouldFollowLead: true,
      }),
    ).toEqual([]);
  });

  it("keeps every card selectable when follow restriction is inactive", () => {
    const hand = [
      card("s-7", "spades", "7"),
      card("s-8", "spades", "8"),
      card("h-9", "hearts", "9"),
    ];

    expect(
      getDisabledFollowCardIds({
        hand,
        trumpSuit: "hearts",
        leadCategory: "spades",
        expectedCardCount: 2,
        shouldFollowLead: false,
      }),
    ).toEqual([]);
  });

  it("treats trump suit and always-trump ranks as followable trump cards", () => {
    const hand = [
      card("h-7", "hearts", "7"),
      card("s-2", "spades", "2"),
      card("c-a", "clubs", "A"),
      card("d-k", "diamonds", "K"),
    ];

    expect(
      getDisabledFollowCardIds({
        hand,
        trumpSuit: "hearts",
        leadCategory: "trump",
        expectedCardCount: 2,
        shouldFollowLead: true,
      }),
    ).toEqual(["c-a", "d-k"]);
  });
});
