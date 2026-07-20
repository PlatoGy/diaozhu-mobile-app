import { REGULAR_RANK_STRENGTH } from "./constants";
import { getEffectiveSuit } from "./trump";
import type { Card, CardStrength, CardStrengthCategory, StandardRank, StandardSuit } from "./types";

const CATEGORY_STRENGTH: Readonly<Record<CardStrengthCategory, number>> = {
  regular_suit: 1,
  regular_trump: 2,
  offsuit_two: 3,
  trump_two: 4,
  offsuit_three: 5,
  trump_three: 6,
  offsuit_five: 7,
  small_joker: 8,
  big_joker: 9,
  trump_five: 10,
};

function isStandardRank(rank: Card["rank"]): rank is StandardRank {
  return rank !== "small_joker" && rank !== "big_joker";
}

export function getCardStrength(card: Card, trumpSuit: StandardSuit): CardStrength {
  const effectiveSuit = getEffectiveSuit(card, trumpSuit);

  if (card.rank === "big_joker") {
    return {
      category: "big_joker",
      value: 0,
      effectiveSuit,
    };
  }

  if (card.rank === "small_joker") {
    return {
      category: "small_joker",
      value: 0,
      effectiveSuit,
    };
  }

  if (card.rank === "5") {
    return {
      category: card.originalSuit === trumpSuit ? "trump_five" : "offsuit_five",
      value: 0,
      effectiveSuit,
    };
  }

  if (card.rank === "3") {
    return {
      category: card.originalSuit === trumpSuit ? "trump_three" : "offsuit_three",
      value: 0,
      effectiveSuit,
    };
  }

  if (card.rank === "2") {
    return {
      category: card.originalSuit === trumpSuit ? "trump_two" : "offsuit_two",
      value: 0,
      effectiveSuit,
    };
  }

  if (effectiveSuit === "trump") {
    return {
      category: "regular_trump",
      value: isStandardRank(card.rank) ? REGULAR_RANK_STRENGTH[card.rank] : 0,
      effectiveSuit,
    };
  }

  return {
    category: "regular_suit",
    value: isStandardRank(card.rank) ? REGULAR_RANK_STRENGTH[card.rank] : 0,
    effectiveSuit,
  };
}

export function compareCardStrength(
  challenger: CardStrength,
  currentWinner: CardStrength,
): number {
  if (
    challenger.category === "regular_suit" &&
    currentWinner.category === "regular_suit" &&
    challenger.effectiveSuit !== currentWinner.effectiveSuit
  ) {
    return 0;
  }

  const categoryDelta =
    CATEGORY_STRENGTH[challenger.category] - CATEGORY_STRENGTH[currentWinner.category];

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return challenger.value - currentWinner.value;
}

export function compareAbsoluteCardStrength(
  challenger: CardStrength,
  currentWinner: CardStrength,
): number {
  const categoryDelta =
    CATEGORY_STRENGTH[challenger.category] - CATEGORY_STRENGTH[currentWinner.category];

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return challenger.value - currentWinner.value;
}

export function compareCardsByAbsoluteStrength(
  challenger: Card,
  currentWinner: Card,
  trumpSuit: StandardSuit,
): number {
  return compareAbsoluteCardStrength(
    getCardStrength(challenger, trumpSuit),
    getCardStrength(currentWinner, trumpSuit),
  );
}

export function compareSingleCards(
  challenger: Card,
  currentWinner: Card,
  trumpSuit: StandardSuit,
): number {
  return compareCardStrength(
    getCardStrength(challenger, trumpSuit),
    getCardStrength(currentWinner, trumpSuit),
  );
}
