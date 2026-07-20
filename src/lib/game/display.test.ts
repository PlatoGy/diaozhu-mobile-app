import { describe, expect, it } from "vitest";

import { createDeck } from "./deck";
import { getRelativeTablePosition, sortHandForDisplay } from "./display";
import type { Card, CardRank, OriginalSuit, Seat } from "./types";

function card(originalSuit: OriginalSuit, rank: CardRank, deckIndex = 0): Card {
  const found = createDeck().find(
    (candidate) =>
      candidate.originalSuit === originalSuit &&
      candidate.rank === rank &&
      candidate.deckIndex === deckIndex,
  );

  if (!found) {
    throw new Error(`Missing card ${originalSuit}-${rank}`);
  }

  return found;
}

describe("getRelativeTablePosition", () => {
  it("maps every viewer seat to bottom/top/left/right", () => {
    for (const viewerSeat of [0, 1, 2, 3] as const satisfies readonly Seat[]) {
      expect(getRelativeTablePosition(viewerSeat, viewerSeat)).toBe("bottom");
      expect(getRelativeTablePosition(viewerSeat, ((viewerSeat + 2) % 4) as Seat)).toBe("top");
      expect(getRelativeTablePosition(viewerSeat, ((viewerSeat + 3) % 4) as Seat)).toBe("left");
      expect(getRelativeTablePosition(viewerSeat, ((viewerSeat + 1) % 4) as Seat)).toBe("right");
    }
  });
});

describe("sortHandForDisplay", () => {
  it("sorts clubs trump as always-trump, clubs regular trump, diamonds, spades, hearts", () => {
    const input = [
      card("hearts", "A"),
      card("diamonds", "A"),
      card("clubs", "A"),
      card("spades", "A"),
      card("clubs", "5"),
      card("joker", "big_joker"),
      card("hearts", "2"),
      card("clubs", "4"),
      card("diamonds", "4"),
    ];
    const originalIds = input.map((item) => item.id);
    const sorted = sortHandForDisplay(input, "clubs");

    expect(sorted.map((item) => item.id)).toEqual([
      card("clubs", "5").id,
      card("joker", "big_joker").id,
      card("hearts", "2").id,
      card("clubs", "A").id,
      card("clubs", "4").id,
      card("diamonds", "A").id,
      card("diamonds", "4").id,
      card("spades", "A").id,
      card("hearts", "A").id,
    ]);
    expect(input.map((item) => item.id)).toEqual(originalIds);
  });

  it("sorts identical cards by deckIndex", () => {
    const sorted = sortHandForDisplay(
      [card("spades", "A", 3), card("spades", "A", 0), card("spades", "A", 2)],
      "hearts",
    );

    expect(sorted.map((item) => item.deckIndex)).toEqual([0, 2, 3]);
  });
});
