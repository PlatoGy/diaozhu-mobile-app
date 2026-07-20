import type { Card } from "./types";

function sameOriginalSuitAndRank(cards: readonly Card[]): boolean {
  const firstCard = cards[0];

  if (!firstCard) {
    return false;
  }

  return cards.every(
    (card) => card.originalSuit === firstCard.originalSuit && card.rank === firstCard.rank,
  );
}

export function isSingle(cards: readonly Card[]): boolean {
  return cards.length === 1;
}

export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && sameOriginalSuitAndRank(cards);
}

export function isTriple(cards: readonly Card[]): boolean {
  return cards.length === 3 && sameOriginalSuitAndRank(cards);
}

export function isQuad(cards: readonly Card[]): boolean {
  return cards.length === 4 && sameOriginalSuitAndRank(cards);
}
