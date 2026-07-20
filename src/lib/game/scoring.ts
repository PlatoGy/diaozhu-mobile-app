import type { Card } from "./types";

export function getCardPoints(card: Card): number {
  if (card.rank === "5") {
    return 5;
  }

  if (card.rank === "10" || card.rank === "K") {
    return 10;
  }

  return 0;
}

export function getCardsPoints(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + getCardPoints(card), 0);
}
