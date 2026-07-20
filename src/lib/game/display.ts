import { compareCardsByAbsoluteStrength } from "./card-strength";
import { getPartnerSeat, getPreviousSeat } from "./teams";
import type { Card, Seat, StandardRank, StandardSuit } from "./types";

export type RelativeTablePosition = "bottom" | "top" | "left" | "right";

const SUIT_ORDER: readonly StandardSuit[] = ["spades", "hearts", "clubs", "diamonds"];
const REGULAR_RANK_ORDER: readonly StandardRank[] = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "4",
];
export function getRelativeTablePosition(
  viewerSeat: Seat,
  targetSeat: Seat,
): RelativeTablePosition {
  if (targetSeat === viewerSeat) {
    return "bottom";
  }

  if (targetSeat === getPartnerSeat(viewerSeat)) {
    return "top";
  }

  if (targetSeat === getPreviousSeat(viewerSeat)) {
    return "left";
  }

  return "right";
}

function isAlwaysTrump(card: Card): boolean {
  return card.originalSuit === "joker" || card.rank === "2" || card.rank === "3" || card.rank === "5";
}

function regularRankIndex(rank: Card["rank"]): number {
  const index = REGULAR_RANK_ORDER.indexOf(rank as StandardRank);

  return index === -1 ? REGULAR_RANK_ORDER.length : index;
}

function suitCycleFrom(trumpSuit: StandardSuit | null): StandardSuit[] {
  if (!trumpSuit) {
    return [...SUIT_ORDER];
  }

  const start = SUIT_ORDER.indexOf(trumpSuit);
  const ordered = [
    ...SUIT_ORDER.slice(start + 1),
    ...SUIT_ORDER.slice(0, start),
  ];

  return ordered.filter((suit) => suit !== trumpSuit);
}

function suitIndex(suit: StandardSuit, orderedSuits: readonly StandardSuit[]): number {
  const index = orderedSuits.indexOf(suit);

  return index === -1 ? orderedSuits.length : index;
}

export function sortHandForDisplay(
  cards: readonly Card[],
  trumpSuit: StandardSuit | null,
  provisionalTrumpSuit: StandardSuit | null = null,
): Card[] {
  const effectiveTrumpSuit = trumpSuit ?? provisionalTrumpSuit;
  const secondarySuits = trumpSuit ? suitCycleFrom(trumpSuit) : SUIT_ORDER;

  return [...cards].sort((left, right) => {
    const leftAlwaysTrump = isAlwaysTrump(left);
    const rightAlwaysTrump = isAlwaysTrump(right);

    if (leftAlwaysTrump || rightAlwaysTrump) {
      if (leftAlwaysTrump !== rightAlwaysTrump) {
        return leftAlwaysTrump ? -1 : 1;
      }

      const trump = effectiveTrumpSuit ?? "spades";
      const strengthComparison = compareCardsByAbsoluteStrength(right, left, trump);

      if (strengthComparison !== 0) {
        return strengthComparison;
      }

      if (left.originalSuit !== right.originalSuit) {
        return suitIndex(left.originalSuit as StandardSuit, suitCycleFrom(effectiveTrumpSuit)) -
          suitIndex(right.originalSuit as StandardSuit, suitCycleFrom(effectiveTrumpSuit));
      }

      return left.deckIndex - right.deckIndex;
    }

    if (trumpSuit && (left.originalSuit === trumpSuit || right.originalSuit === trumpSuit)) {
      if (left.originalSuit !== right.originalSuit) {
        return left.originalSuit === trumpSuit ? -1 : 1;
      }

      const rankComparison = regularRankIndex(left.rank) - regularRankIndex(right.rank);

      return rankComparison === 0 ? left.deckIndex - right.deckIndex : rankComparison;
    }

    if (left.originalSuit !== right.originalSuit) {
      return suitIndex(left.originalSuit as StandardSuit, secondarySuits) -
        suitIndex(right.originalSuit as StandardSuit, secondarySuits);
    }

    const rankComparison = regularRankIndex(left.rank) - regularRankIndex(right.rank);

    if (rankComparison !== 0) {
      return rankComparison;
    }

    return left.deckIndex - right.deckIndex;
  });
}
