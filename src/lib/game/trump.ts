import { ALWAYS_TRUMP_RANKS } from "./constants";
import type { Card, EffectiveSuit, StandardSuit } from "./types";

export function isTrump(card: Card, trumpSuit: StandardSuit): boolean {
  if (card.originalSuit === "joker") {
    return true;
  }

  return (
    ALWAYS_TRUMP_RANKS.some((rank) => rank === card.rank) ||
    card.originalSuit === trumpSuit
  );
}

export function getEffectiveSuit(card: Card, trumpSuit: StandardSuit): EffectiveSuit {
  if (isTrump(card, trumpSuit)) {
    return "trump";
  }

  if (card.originalSuit === "joker") {
    return "trump";
  }

  return card.originalSuit;
}
