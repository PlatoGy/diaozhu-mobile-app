import { describe, expect, it } from "vitest";

import { compareSingleCards } from "./card-strength";
import { isPair, isQuad, isTriple } from "./combinations";
import { createDeck, shuffleDeck } from "./deck";
import { getCardPoints, getCardsPoints } from "./scoring";
import { getEffectiveSuit, isTrump } from "./trump";
import type { Card, CardRank, OriginalSuit, StandardSuit } from "./types";

const heartsTrump: StandardSuit = "hearts";

function findCard(
  cards: readonly Card[],
  originalSuit: OriginalSuit,
  rank: CardRank,
  deckIndex = 0,
): Card {
  const card = cards.find(
    (candidate) =>
      candidate.originalSuit === originalSuit &&
      candidate.rank === rank &&
      candidate.deckIndex === deckIndex,
  );

  if (!card) {
    throw new Error(`Missing card ${deckIndex}-${originalSuit}-${rank}`);
  }

  return card;
}

function findCards(
  cards: readonly Card[],
  originalSuit: OriginalSuit,
  rank: CardRank,
  count: number,
): Card[] {
  return cards
    .filter((card) => card.originalSuit === originalSuit && card.rank === rank)
    .slice(0, count);
}

describe("createDeck", () => {
  it("creates four full decks with stable unique ids", () => {
    const deck = createDeck();
    const ids = new Set(deck.map((card) => card.id));

    expect(deck).toHaveLength(216);
    expect(ids.size).toBe(216);

    for (const deckIndex of [0, 1, 2, 3]) {
      expect(deck.filter((card) => card.deckIndex === deckIndex)).toHaveLength(54);
    }

    expect(findCards(deck, "hearts", "A", 4)).toHaveLength(4);
    expect(findCards(deck, "joker", "big_joker", 4)).toHaveLength(4);
    expect(findCards(deck, "joker", "small_joker", 4)).toHaveLength(4);
  });

  it("does not shuffle automatically and supports unbiased injected shuffle randomness", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, () => 0);

    expect(shuffled).not.toBe(deck);
    expect(deck[0]?.id).toBe("deck-0-spades-2");
    expect(shuffled.map((card) => card.id).sort()).toEqual(
      deck.map((card) => card.id).sort(),
    );
  });

  it("has 400 total points across all cards", () => {
    expect(getCardsPoints(createDeck())).toBe(400);
  });
});

describe("trump", () => {
  it("identifies natural trumps, jokers, and trump suit cards", () => {
    const deck = createDeck();

    expect(isTrump(findCard(deck, "hearts", "A"), heartsTrump)).toBe(true);
    expect(isTrump(findCard(deck, "spades", "A"), heartsTrump)).toBe(false);
    expect(isTrump(findCard(deck, "spades", "2"), heartsTrump)).toBe(true);
    expect(isTrump(findCard(deck, "clubs", "3"), heartsTrump)).toBe(true);
    expect(isTrump(findCard(deck, "diamonds", "5"), heartsTrump)).toBe(true);
    expect(isTrump(findCard(deck, "joker", "big_joker"), heartsTrump)).toBe(true);
    expect(isTrump(findCard(deck, "joker", "small_joker"), heartsTrump)).toBe(true);
  });

  it("computes effective suit without mutating original suit", () => {
    const deck = createDeck();
    const heartAce = findCard(deck, "hearts", "A");
    const spadeAce = findCard(deck, "spades", "A");

    expect(getEffectiveSuit(heartAce, heartsTrump)).toBe("trump");
    expect(getEffectiveSuit(spadeAce, heartsTrump)).toBe("spades");
    expect(heartAce.originalSuit).toBe("hearts");
  });
});

describe("combinations", () => {
  it("recognizes pair only by original suit and rank", () => {
    const deck = createDeck();

    expect(isPair(findCards(deck, "hearts", "5", 2))).toBe(true);
    expect(isPair([findCard(deck, "hearts", "5"), findCard(deck, "clubs", "5")])).toBe(
      false,
    );
    expect(isPair([findCard(deck, "spades", "2"), findCard(deck, "hearts", "2")])).toBe(
      false,
    );
    expect(
      isPair([findCard(deck, "joker", "big_joker"), findCard(deck, "joker", "small_joker")]),
    ).toBe(false);
  });

  it("recognizes triples and quads only by original suit and rank", () => {
    const deck = createDeck();

    expect(isTriple(findCards(deck, "spades", "9", 3))).toBe(true);
    expect(isTriple([findCard(deck, "spades", "9"), findCard(deck, "hearts", "9"), findCard(deck, "spades", "9", 1)])).toBe(false);
    expect(isQuad(findCards(deck, "diamonds", "K", 4))).toBe(true);
  });
});

describe("card strength", () => {
  it("orders special trump cards according to the rules", () => {
    const deck = createDeck();

    expect(
      compareSingleCards(
        findCard(deck, "hearts", "5"),
        findCard(deck, "joker", "big_joker"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSingleCards(
        findCard(deck, "joker", "big_joker"),
        findCard(deck, "joker", "small_joker"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSingleCards(
        findCard(deck, "joker", "small_joker"),
        findCard(deck, "spades", "5"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSingleCards(
        findCard(deck, "spades", "5"),
        findCard(deck, "hearts", "3"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSingleCards(
        findCard(deck, "hearts", "3"),
        findCard(deck, "spades", "3"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSingleCards(
        findCard(deck, "spades", "3"),
        findCard(deck, "hearts", "2"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSingleCards(
        findCard(deck, "hearts", "2"),
        findCard(deck, "spades", "2"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
  });

  it("orders regular trump suit cards by normal rank", () => {
    const deck = createDeck();

    expect(
      compareSingleCards(
        findCard(deck, "hearts", "A"),
        findCard(deck, "hearts", "K"),
        heartsTrump,
      ),
    ).toBeGreaterThan(0);
  });

  it("does not let a later equal-strength card replace the current winner", () => {
    const deck = createDeck();

    expect(
      compareSingleCards(
        findCard(deck, "hearts", "A", 1),
        findCard(deck, "hearts", "A", 0),
        heartsTrump,
      ),
    ).toBe(0);
  });
});

describe("scoring", () => {
  it("scores only 5, 10, and K", () => {
    const deck = createDeck();

    expect(getCardPoints(findCard(deck, "spades", "5"))).toBe(5);
    expect(getCardPoints(findCard(deck, "spades", "10"))).toBe(10);
    expect(getCardPoints(findCard(deck, "spades", "K"))).toBe(10);
    expect(getCardPoints(findCard(deck, "spades", "A"))).toBe(0);
  });
});
