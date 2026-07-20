import { getCardsInCategory } from "./privileges";
import type { Card, PlayCategory, StandardSuit } from "./types";

export function getDisabledFollowCardIds(input: {
  hand: readonly Card[];
  trumpSuit: StandardSuit | null;
  leadCategory: PlayCategory | null;
  expectedCardCount: number | null;
  shouldFollowLead: boolean;
}): string[] {
  const {
    hand,
    trumpSuit,
    leadCategory,
    expectedCardCount,
    shouldFollowLead,
  } = input;

  if (!shouldFollowLead || !trumpSuit || !leadCategory || !expectedCardCount) {
    return [];
  }

  const followCards = getCardsInCategory(hand, leadCategory, trumpSuit);

  if (followCards.length < expectedCardCount) {
    return [];
  }

  const followCardIds = new Set(followCards.map((card) => card.id));

  return hand
    .filter((card) => !followCardIds.has(card.id))
    .map((card) => card.id);
}
