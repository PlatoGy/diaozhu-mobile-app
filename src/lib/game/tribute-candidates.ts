import { compareCardsByAbsoluteStrength } from "./card-strength";
import { hasDuplicateCardIds } from "./hand";
import { isTrump } from "./trump";
import type {
  Card,
  GameActionResult,
  GameRuleError,
  GameRuleErrorCode,
  StandardSuit,
  TributeCandidateLayer,
} from "./types";

function ok<T>(value: T): GameActionResult<T> {
  return {
    ok: true,
    value,
  };
}

function err<T>(
  code: GameRuleErrorCode,
  message: string,
  context: Omit<GameRuleError, "code" | "message"> = {},
): GameActionResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...context,
    },
  };
}

function cardIdSet(cards: readonly Card[]): Set<string> {
  return new Set(cards.map((card) => card.id));
}

function getCardsByIdsInOrder(
  cards: readonly Card[],
  cardIds: readonly string[],
): GameActionResult<Card[]> {
  if (hasDuplicateCardIds(cardIds)) {
    return err("DUPLICATE_CARD_ID", "Card ids must be unique.");
  }

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const selectedCards = cardIds.map((cardId) => cardsById.get(cardId));

  if (selectedCards.some((card) => !card)) {
    return err("CARD_NOT_IN_HAND", "Selected card is not in the player's hand.");
  }

  return ok(selectedCards.filter((card): card is Card => Boolean(card)));
}

export function getHighestTributeCandidates(
  hand: readonly Card[],
  trumpSuit: StandardSuit,
): Card[] {
  const firstCard = hand[0];

  if (!firstCard) {
    return [];
  }

  let strongestCard = firstCard;

  for (const card of hand.slice(1)) {
    if (compareCardsByAbsoluteStrength(card, strongestCard, trumpSuit) > 0) {
      strongestCard = card;
    }
  }

  return hand.filter(
    (card) => compareCardsByAbsoluteStrength(card, strongestCard, trumpSuit) === 0,
  );
}

export function getRequiredTributeCandidateLayers(
  hand: readonly Card[],
  requiredCount: number,
  trumpSuit: StandardSuit,
): GameActionResult<TributeCandidateLayer[]> {
  if (!Number.isInteger(requiredCount) || requiredCount < 0) {
    return err("INVALID_TRIBUTE_COUNT", "Required tribute count must be a non-negative integer.");
  }

  if (requiredCount > hand.length) {
    return err("INSUFFICIENT_CARDS_FOR_TRIBUTE", "Not enough cards for tribute.");
  }

  let simulatedHand = [...hand];
  const layers: TributeCandidateLayer[] = [];

  for (let selectionIndex = 0; selectionIndex < requiredCount; selectionIndex += 1) {
    const candidates = getHighestTributeCandidates(simulatedHand, trumpSuit);
    layers.push({
      selectionIndex,
      candidates,
    });
    const firstCandidate = candidates[0];

    if (!firstCandidate) {
      return err("INSUFFICIENT_CARDS_FOR_TRIBUTE", "Not enough cards for tribute.");
    }

    simulatedHand = simulatedHand.filter((card) => card.id !== firstCandidate.id);
  }

  return ok(layers);
}

export function validateTributeSelectionSequence(
  hand: readonly Card[],
  cardIds: readonly string[],
  requiredCount: number,
  trumpSuit: StandardSuit,
): GameActionResult<Card[]> {
  if (cardIds.length !== requiredCount) {
    return err("INVALID_CARD_COUNT", "Tribute selection must match required count.");
  }

  if (hasDuplicateCardIds(cardIds)) {
    return err("DUPLICATE_CARD_ID", "Tribute card ids must be unique.");
  }

  const selectedCards = getCardsByIdsInOrder(hand, cardIds);

  if (!selectedCards.ok) {
    return selectedCards;
  }

  let simulatedHand = [...hand];
  const originalHandIds = cardIdSet(hand);

  for (const [selectionIndex, submittedCardId] of cardIds.entries()) {
    if (!originalHandIds.has(submittedCardId)) {
      return err("CARD_NOT_IN_HAND", "Tribute card is not in hand.");
    }

    const candidates = getHighestTributeCandidates(simulatedHand, trumpSuit);
    const allowedCandidateIds = candidates.map((card) => card.id);

    if (!allowedCandidateIds.includes(submittedCardId)) {
      return err("CARD_NOT_HIGHEST", "Tribute card must be selected from current highest candidates.", {
        selectionIndex,
        submittedCardId,
        allowedCandidateIds,
      });
    }

    simulatedHand = simulatedHand.filter((card) => card.id !== submittedCardId);
  }

  return selectedCards;
}

export function getReturnTributeOptions(
  hand: readonly Card[],
  requiredCount: number,
  trumpSuit: StandardSuit,
): Card[] {
  const trumpCards = hand.filter((card) => isTrump(card, trumpSuit));

  return trumpCards.length >= requiredCount ? trumpCards : [...hand];
}

export function validateReturnTributeSelection(
  hand: readonly Card[],
  cardIds: readonly string[],
  requiredCount: number,
  trumpSuit: StandardSuit,
): GameActionResult<Card[]> {
  if (cardIds.length !== requiredCount) {
    return err("INVALID_CARD_COUNT", "Return tribute selection must match required count.");
  }

  if (hasDuplicateCardIds(cardIds)) {
    return err("DUPLICATE_CARD_ID", "Return tribute card ids must be unique.");
  }

  const selectedCards = getCardsByIdsInOrder(hand, cardIds);

  if (!selectedCards.ok) {
    return selectedCards;
  }

  const optionIds = new Set(
    getReturnTributeOptions(hand, requiredCount, trumpSuit).map((card) => card.id),
  );
  const invalidCardId = cardIds.find((cardId) => !optionIds.has(cardId));

  if (invalidCardId) {
    return err("INVALID_RETURN_OPTION", "Return tribute card is not currently selectable.", {
      submittedCardId: invalidCardId,
      allowedCandidateIds: [...optionIds],
    });
  }

  return selectedCards;
}
