import { describe, expect, it } from "vitest";

import { calculateHandLayout, splitCardsIntoRows } from "./hand-layout";

function cards(count: number): Array<{ id: string }> {
  return Array.from({ length: count }, (_, index) => ({ id: `card-${index}` }));
}

describe("calculateHandLayout", () => {
  it("lays out 52 cards in two dense rows without negative values", () => {
    const layout = calculateHandLayout({
      cardCount: 52,
      availableWidth: 720,
      availableHeight: 142,
    });

    expect(layout.rowCount).toBe(2);
    expect(layout.cardsPerRow).toBeGreaterThan(0);
    expect(layout.cardWidth).toBeGreaterThan(0);
    expect(layout.cardHeight).toBeGreaterThan(0);
    expect(layout.overlapOffset).toBeGreaterThan(0);
    expect(layout.rowOffset).toBeGreaterThan(0);
  });

  it("uses two rows for 60 cards", () => {
    const layout = calculateHandLayout({
      cardCount: 60,
      availableWidth: 760,
      availableHeight: 150,
    });

    expect(layout.rowCount).toBe(2);
  });

  it("shrinks the overlap offset when available width is smaller", () => {
    const wide = calculateHandLayout({
      cardCount: 60,
      availableWidth: 820,
      availableHeight: 142,
    });
    const narrow = calculateHandLayout({
      cardCount: 60,
      availableWidth: 620,
      availableHeight: 142,
    });

    expect(wide.rowCount).toBe(narrow.rowCount);
    expect(narrow.overlapOffset).toBeLessThanOrEqual(wide.overlapOffset);
  });

  it("splits cards without mutating or duplicating ids", () => {
    const original = cards(52);
    const before = original.map((card) => card.id);
    const rows = splitCardsIntoRows(original, 2);
    const flattened = rows.flat().map((card) => card.id);

    expect(original.map((card) => card.id)).toEqual(before);
    expect(flattened).toHaveLength(52);
    expect(new Set(flattened)).toHaveLength(52);
    expect(flattened).toEqual(before);
  });
});
