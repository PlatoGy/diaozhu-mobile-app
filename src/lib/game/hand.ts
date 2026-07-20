import type { Card, GameActionResult } from "./types";

function ok<T>(value: T): GameActionResult<T> {
  return {
    ok: true,
    value,
  };
}

function err<T>(
  code: "DUPLICATE_CARD_ID" | "CARD_NOT_IN_HAND",
  message: string,
): GameActionResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export function hasDuplicateCardIds(cardIds: readonly string[]): boolean {
  return new Set(cardIds).size !== cardIds.length;
}

export function getCardsByIds(
  hand: readonly Card[],
  cardIds: readonly string[],
): GameActionResult<Card[]> {
  if (hasDuplicateCardIds(cardIds)) {
    return err("DUPLICATE_CARD_ID", "Card ids must be unique.");
  }

  const cardsById = new Map(hand.map((card) => [card.id, card]));
  const cards = cardIds.map((cardId) => cardsById.get(cardId));

  if (cards.some((card) => !card)) {
    return err("CARD_NOT_IN_HAND", "Selected card is not in the player's hand.");
  }

  return ok(cards.filter((card): card is Card => Boolean(card)));
}

export function removeCardsFromHand(
  hand: readonly Card[],
  cardIds: readonly string[],
): GameActionResult<Card[]> {
  if (hasDuplicateCardIds(cardIds)) {
    return err("DUPLICATE_CARD_ID", "Card ids must be unique.");
  }

  const handCardIds = new Set(hand.map((card) => card.id));

  if (cardIds.some((cardId) => !handCardIds.has(cardId))) {
    return err("CARD_NOT_IN_HAND", "Selected card is not in the player's hand.");
  }

  const removedCardIds = new Set(cardIds);

  return ok(hand.filter((card) => !removedCardIds.has(card.id)));
}
