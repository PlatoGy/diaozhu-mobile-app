import { isPair, isQuad, isTriple } from "./combinations";
import { getEffectiveSuit } from "./trump";
import type {
  Card,
  GroupPrivileges,
  GroupType,
  LeadPrivileges,
  PlayCategory,
  PlayerPrivileges,
  PrivilegeLoss,
  Seat,
  StandardSuit,
} from "./types";

const PLAY_CATEGORIES: readonly PlayCategory[] = [
  "trump",
  "spades",
  "hearts",
  "clubs",
  "diamonds",
];

const SEATS: readonly Seat[] = [0, 1, 2, 3];

function createInitialGroupPrivileges(): GroupPrivileges {
  return {
    pair: true,
    triple: true,
    quad: true,
  };
}

export function createInitialLeadPrivileges(): LeadPrivileges {
  return {
    trump: createInitialGroupPrivileges(),
    spades: createInitialGroupPrivileges(),
    hearts: createInitialGroupPrivileges(),
    clubs: createInitialGroupPrivileges(),
    diamonds: createInitialGroupPrivileges(),
  };
}

export function createInitialPlayerPrivileges(): PlayerPrivileges {
  return {
    0: createInitialLeadPrivileges(),
    1: createInitialLeadPrivileges(),
    2: createInitialLeadPrivileges(),
    3: createInitialLeadPrivileges(),
  };
}

export function getPlayCategory(card: Card, trumpSuit: StandardSuit): PlayCategory {
  return getEffectiveSuit(card, trumpSuit);
}

export function getPlayCategoryForCards(
  cards: readonly Card[],
  trumpSuit: StandardSuit,
): PlayCategory | "mixed" {
  const firstCard = cards[0];

  if (!firstCard) {
    return "mixed";
  }

  const firstCategory = getPlayCategory(firstCard, trumpSuit);

  return cards.every((card) => getPlayCategory(card, trumpSuit) === firstCategory)
    ? firstCategory
    : "mixed";
}

export function getCardsInCategory(
  hand: readonly Card[],
  category: PlayCategory,
  trumpSuit: StandardSuit,
): Card[] {
  return hand.filter((card) => getPlayCategory(card, trumpSuit) === category);
}

export function getRequiredFollowCount(
  hand: readonly Card[],
  leadCategory: PlayCategory,
  expectedCardCount: number,
  trumpSuit: StandardSuit,
): number {
  return Math.min(
    getCardsInCategory(hand, leadCategory, trumpSuit).length,
    expectedCardCount,
  );
}

export function hasGroupPrivilege(
  privileges: LeadPrivileges,
  category: PlayCategory,
  groupType: GroupType,
): boolean {
  return privileges[category][groupType];
}

function requiredGroupSize(groupType: GroupType): number {
  if (groupType === "pair") {
    return 2;
  }

  if (groupType === "triple") {
    return 3;
  }

  return 4;
}

function groupKey(card: Card): string {
  return `${card.originalSuit}:${card.rank}`;
}

export function canFormGroupInCategory(
  hand: readonly Card[],
  category: PlayCategory,
  groupType: GroupType,
  trumpSuit: StandardSuit,
  privileges: LeadPrivileges,
): boolean {
  if (!hasGroupPrivilege(privileges, category, groupType)) {
    return false;
  }

  const groupedCards = new Map<string, Card[]>();

  for (const card of getCardsInCategory(hand, category, trumpSuit)) {
    const key = groupKey(card);
    groupedCards.set(key, [...(groupedCards.get(key) ?? []), card]);
  }

  return [...groupedCards.values()].some(
    (cards) => cards.length >= requiredGroupSize(groupType),
  );
}

export function cardsFormDeclaredGroup(
  cards: readonly Card[],
  groupType: GroupType,
): boolean {
  if (groupType === "pair") {
    return isPair(cards);
  }

  if (groupType === "triple") {
    return isTriple(cards);
  }

  return isQuad(cards);
}

export function applyPrivilegeLosses(
  privileges: PlayerPrivileges,
  losses: readonly PrivilegeLoss[],
): PlayerPrivileges {
  const nextPrivileges: PlayerPrivileges = {
    0: structuredClone(privileges[0]),
    1: structuredClone(privileges[1]),
    2: structuredClone(privileges[2]),
    3: structuredClone(privileges[3]),
  };

  for (const loss of losses) {
    nextPrivileges[loss.seat][loss.category][loss.groupType] = false;
  }

  return nextPrivileges;
}

export function resetAllPrivileges(): PlayerPrivileges {
  return createInitialPlayerPrivileges();
}

export function categories(): readonly PlayCategory[] {
  return PLAY_CATEGORIES;
}

export function seats(): readonly Seat[] {
  return SEATS;
}
