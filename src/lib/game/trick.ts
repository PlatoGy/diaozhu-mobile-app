import {
  cardsFormDeclaredGroup,
  applyPrivilegeLosses,
  getCardsInCategory,
  getPlayCategoryForCards,
  getRequiredFollowCount,
  hasGroupPrivilege,
} from "./privileges";
import { getCardsByIds, hasDuplicateCardIds, removeCardsFromHand } from "./hand";
import { getNextSeat } from "./teams";
import type {
  Card,
  DeclaredPlayType,
  EffectiveDeclaredPlayType,
  GameActionResult,
  GameRuleError,
  GameRuleErrorCode,
  GroupType,
  PlayCardsInput,
  PlayCategory,
  PlayRecord,
  PrivilegeLoss,
  RoundState,
  Seat,
  SeatHands,
  TrickState,
} from "./types";

const SEATS: readonly Seat[] = [0, 1, 2, 3];

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

function cloneHands(hands: SeatHands): SeatHands {
  return {
    0: [...hands[0]],
    1: [...hands[1]],
    2: [...hands[2]],
    3: [...hands[3]],
  };
}

function groupTypeForDeclaredType(declaredType: DeclaredPlayType): GroupType | null {
  if (declaredType === "pair" || declaredType === "triple" || declaredType === "quad") {
    return declaredType;
  }

  return null;
}

function expectedCountForLeadType(leadType: EffectiveDeclaredPlayType): 1 | 2 | 3 | 4 {
  if (leadType === "single") {
    return 1;
  }

  if (leadType === "pair") {
    return 2;
  }

  if (leadType === "triple") {
    return 3;
  }

  return 4;
}

function groupFormationError(groupType: GroupType): GameRuleErrorCode {
  if (groupType === "pair") {
    return "CARDS_DO_NOT_FORM_PAIR";
  }

  if (groupType === "triple") {
    return "CARDS_DO_NOT_FORM_TRIPLE";
  }

  return "CARDS_DO_NOT_FORM_QUAD";
}

function requiredGroupSize(groupType: GroupType): 2 | 3 | 4 {
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

function countGroupsInCategory(
  cards: readonly Card[],
  category: PlayCategory,
  groupType: GroupType,
  trumpSuit: NonNullable<RoundState["trumpSuit"]>,
): number {
  const groupSize = requiredGroupSize(groupType);
  const groupedCards = new Map<string, number>();

  for (const card of getCardsInCategory(cards, category, trumpSuit)) {
    const key = groupKey(card);
    groupedCards.set(key, (groupedCards.get(key) ?? 0) + 1);
  }

  return [...groupedCards.values()].reduce(
    (total, count) => total + Math.floor(count / groupSize),
    0,
  );
}

function canFollowGroupedPattern(input: {
  hand: readonly Card[];
  category: PlayCategory;
  groupType: GroupType;
  requiredGroupCount: number;
  trumpSuit: NonNullable<RoundState["trumpSuit"]>;
  roundState: RoundState;
  seat: Seat;
}): boolean {
  if (!hasGroupPrivilege(input.roundState.playerPrivileges[input.seat], input.category, input.groupType)) {
    return false;
  }

  return countGroupsInCategory(
    input.hand,
    input.category,
    input.groupType,
    input.trumpSuit,
  ) >= input.requiredGroupCount;
}

function selectedFollowsGroupedPattern(input: {
  cards: readonly Card[];
  category: PlayCategory;
  groupType: GroupType;
  requiredGroupCount: number;
  trumpSuit: NonNullable<RoundState["trumpSuit"]>;
}): boolean {
  return countGroupsInCategory(
    input.cards,
    input.category,
    input.groupType,
    input.trumpSuit,
  ) >= input.requiredGroupCount;
}

function collectLooseFollowPrivilegeLosses(input: {
  roundState: RoundState;
  seat: Seat;
  hand: readonly Card[];
  cards: readonly Card[];
  leadCategory: PlayCategory;
  leadGroupType: GroupType;
}): PrivilegeLoss[] {
  const trumpSuit = input.roundState.trumpSuit ?? "spades";
  const losses: PrivilegeLoss[] = [];
  const canFollowPattern = (groupType: GroupType, requiredGroupCount: number) =>
    canFollowGroupedPattern({
      hand: input.hand,
      category: input.leadCategory,
      groupType,
      requiredGroupCount,
      trumpSuit,
      roundState: input.roundState,
      seat: input.seat,
    });
  const followedPattern = (groupType: GroupType, requiredGroupCount: number) =>
    selectedFollowsGroupedPattern({
      cards: input.cards,
      category: input.leadCategory,
      groupType,
      requiredGroupCount,
      trumpSuit,
    });
  const pushLoss = (groupType: GroupType) => {
    losses.push({
      seat: input.seat,
      category: input.leadCategory,
      groupType,
    });
  };
  const addExactLooseLoss = (groupType: GroupType, requiredGroupCount: number) => {
    if (canFollowPattern(groupType, requiredGroupCount)) {
      pushLoss(groupType);
    }
  };
  const addSubPatternLoss = (groupType: GroupType, requiredGroupCount: number) => {
    const hasEnoughPattern = canFollowGroupedPattern({
      hand: input.hand,
      category: input.leadCategory,
      groupType,
      requiredGroupCount,
      trumpSuit,
      roundState: input.roundState,
      seat: input.seat,
    });

    if (!hasEnoughPattern) {
      return;
    }

    if (!followedPattern(groupType, requiredGroupCount)) {
      pushLoss(groupType);
    }
  };

  if (input.leadGroupType === "quad") {
    addExactLooseLoss("quad", 1);
    addSubPatternLoss("triple", 1);
    addSubPatternLoss("pair", 2);
    return losses;
  }

  if (input.leadGroupType === "triple") {
    addExactLooseLoss("triple", 1);
    addSubPatternLoss("pair", 1);
  }

  if (input.leadGroupType === "pair") {
    addExactLooseLoss("pair", 1);
  }

  return losses;
}

export function createTrick(trickNumber: number, leaderSeat: Seat): TrickState {
  return {
    trickNumber,
    leaderSeat,
    currentTurnSeat: leaderSeat,
    leadType: null,
    leadCategory: null,
    expectedCardCount: null,
    plays: [],
    status: "in_progress",
    resolution: null,
  };
}

export { getNextSeat } from "./teams";

function assertCommonPlayState(
  roundState: RoundState,
  input: PlayCardsInput,
): GameActionResult<{
  trick: TrickState;
  hand: Card[];
  cards: Card[];
}> {
  if (roundState.phase !== "playing") {
    return err("INVALID_PHASE", "Cards can only be played during playing phase.");
  }

  if (!roundState.trumpSuit) {
    return err("TRUMP_NOT_LOCKED", "Trump suit must be locked before playing cards.");
  }

  if (!roundState.currentTrick) {
    return err("TRICK_NOT_FOUND", "Current trick does not exist.");
  }

  if (roundState.currentTrick.status !== "in_progress") {
    return err("TRICK_ALREADY_COMPLETE", "Current trick is already complete.");
  }

  if (input.seat !== roundState.currentTrick.currentTurnSeat) {
    return err("NOT_CURRENT_TURN", "It is not this seat's turn to play.");
  }

  if (input.cardIds.length === 0) {
    return err("EMPTY_PLAY", "At least one card must be played.");
  }

  if (hasDuplicateCardIds(input.cardIds)) {
    return err("DUPLICATE_CARD_ID", "Played card ids must be unique.");
  }

  if (roundState.currentTrick.plays.some((play) => play.seat === input.seat)) {
    return err("PLAYER_ALREADY_PLAYED", "This player has already played in this trick.");
  }

  const hand = roundState.hands[input.seat];
  const cardsResult = getCardsByIds(hand, input.cardIds);

  if (!cardsResult.ok) {
    return cardsResult;
  }

  return ok({
    trick: roundState.currentTrick,
    hand,
    cards: cardsResult.value,
  });
}

function validateLeadPlay(
  roundState: RoundState,
  input: PlayCardsInput,
  cards: readonly Card[],
): GameActionResult<{
  leadType: EffectiveDeclaredPlayType;
  leadCategory: PlayCategory;
  expectedCardCount: 1 | 2 | 3 | 4;
  playCategory: PlayCategory;
}> {
  if (input.declaredType === "loose") {
    return err("LOOSE_CANNOT_LEAD", "Leader cannot declare loose.");
  }

  const expectedCardCount = expectedCountForLeadType(input.declaredType);

  if (cards.length !== expectedCardCount) {
    return err("INVALID_CARD_COUNT", "Lead play has invalid card count.");
  }

  const playCategory = getPlayCategoryForCards(cards, roundState.trumpSuit ?? "spades");

  if (playCategory === "mixed") {
    return err("INVALID_GROUP_CATEGORY", "Lead cards must share one play category.");
  }

  const groupType = groupTypeForDeclaredType(input.declaredType);

  if (groupType) {
    if (!cardsFormDeclaredGroup(cards, groupType)) {
      return err(groupFormationError(groupType), "Cards do not match declared group.");
    }

    if (!hasGroupPrivilege(roundState.playerPrivileges[input.seat], playCategory, groupType)) {
      return err("LEAD_PRIVILEGE_LOST", "Player has lost this lead privilege.");
    }
  }

  return ok({
    leadType: input.declaredType,
    leadCategory: playCategory,
    expectedCardCount,
    playCategory,
  });
}

function validateFollowCategoryCount(
  roundState: RoundState,
  trick: TrickState,
  hand: readonly Card[],
  cards: readonly Card[],
): GameActionResult<{
  selectedLeadCategoryCount: number;
  requiredFollowCount: number;
}> {
  if (!trick.leadCategory || !trick.expectedCardCount) {
    return err("INVALID_TRICK_STATE", "Trick is missing lead category or card count.");
  }

  const requiredFollowCount = getRequiredFollowCount(
    hand,
    trick.leadCategory,
    trick.expectedCardCount,
    roundState.trumpSuit ?? "spades",
  );
  const selectedLeadCategoryCount = getCardsInCategory(
    cards,
    trick.leadCategory,
    roundState.trumpSuit ?? "spades",
  ).length;

  if (selectedLeadCategoryCount !== requiredFollowCount) {
    const code =
      requiredFollowCount < trick.expectedCardCount
        ? "MUST_EXHAUST_LEAD_CATEGORY"
        : "MUST_FOLLOW_CATEGORY";

    return err(code, "Selected cards do not satisfy follow-category count.", {
      requiredCategory: trick.leadCategory,
      requiredCount: requiredFollowCount,
      selectedCount: selectedLeadCategoryCount,
    });
  }

  return ok({
    selectedLeadCategoryCount,
    requiredFollowCount,
  });
}

function validateFollowPlay(
  roundState: RoundState,
  input: PlayCardsInput,
  trick: TrickState,
  hand: readonly Card[],
  cards: readonly Card[],
): GameActionResult<{
  playCategory: PlayCategory | "mixed";
  privilegeLosses: PrivilegeLoss[];
}> {
  if (!trick.leadType || !trick.leadCategory || !trick.expectedCardCount) {
    return err("INVALID_TRICK_STATE", "Trick is missing lead data.");
  }

  if (cards.length !== trick.expectedCardCount) {
    return err("INVALID_CARD_COUNT", "Follow play must match lead card count.");
  }

  const followCountResult = validateFollowCategoryCount(roundState, trick, hand, cards);

  if (!followCountResult.ok) {
    return followCountResult;
  }

  if (trick.leadType === "single") {
    if (input.declaredType !== "single") {
      return err("INVALID_DECLARED_TYPE", "Single trick must be followed with single.");
    }

    return ok({
      playCategory: getPlayCategoryForCards(cards, roundState.trumpSuit ?? "spades"),
      privilegeLosses: [],
    });
  }

  const leadGroupType = trick.leadType;

  if (input.declaredType !== leadGroupType && input.declaredType !== "loose") {
    return err("INVALID_DECLARED_TYPE", "Follow declaration must match lead group or loose.");
  }

  const handLeadCategoryCount = getCardsInCategory(
    hand,
    trick.leadCategory,
    roundState.trumpSuit ?? "spades",
  ).length;
  const playCategory = getPlayCategoryForCards(cards, roundState.trumpSuit ?? "spades");
  let privilegeLosses: PrivilegeLoss[] = [];

  if (input.declaredType === "loose") {
    if (handLeadCategoryCount >= trick.expectedCardCount) {
      privilegeLosses = collectLooseFollowPrivilegeLosses({
        roundState,
        seat: input.seat,
        hand,
        cards,
        leadCategory: trick.leadCategory,
        leadGroupType,
      });
    }

    return ok({
      playCategory,
      privilegeLosses,
    });
  }

  if (!cardsFormDeclaredGroup(cards, leadGroupType)) {
    return err(groupFormationError(leadGroupType), "Cards do not match declared group.");
  }

  if (playCategory === "mixed") {
    return err("INVALID_GROUP_CATEGORY", "Declared group must share one play category.");
  }

  if (!hasGroupPrivilege(roundState.playerPrivileges[input.seat], playCategory, leadGroupType)) {
    return err("LEAD_PRIVILEGE_LOST", "Player has lost this group privilege.");
  }

  const followsLeadCategory = playCategory === trick.leadCategory;
  const canTrumpOffsuit =
    trick.leadCategory !== "trump" &&
    handLeadCategoryCount === 0 &&
    playCategory === "trump";

  if (!followsLeadCategory && !canTrumpOffsuit) {
    return err("INVALID_GROUP_CATEGORY", "Declared group cannot participate in this trick.");
  }

  return ok({
    playCategory,
    privilegeLosses,
  });
}

export function playCards(
  roundState: RoundState,
  input: PlayCardsInput,
): GameActionResult<RoundState> {
  const common = assertCommonPlayState(roundState, input);

  if (!common.ok) {
    return common;
  }

  const { trick, hand, cards } = common.value;
  const orderIndex = trick.plays.length as 0 | 1 | 2 | 3;
  const isLeadPlay = trick.plays.length === 0;
  let leadType = trick.leadType;
  let leadCategory = trick.leadCategory;
  let expectedCardCount = trick.expectedCardCount;
  let playCategory: PlayRecord["playCategory"];
  let privilegeLosses: PrivilegeLoss[] = [];

  if (isLeadPlay) {
    const validation = validateLeadPlay(roundState, input, cards);

    if (!validation.ok) {
      return validation;
    }

    leadType = validation.value.leadType;
    leadCategory = validation.value.leadCategory;
    expectedCardCount = validation.value.expectedCardCount;
    playCategory = validation.value.playCategory;
  } else {
    const validation = validateFollowPlay(roundState, input, trick, hand, cards);

    if (!validation.ok) {
      return validation;
    }

    playCategory = validation.value.playCategory;
    privilegeLosses = validation.value.privilegeLosses;
  }

  const removeResult = removeCardsFromHand(hand, input.cardIds);

  if (!removeResult.ok) {
    return removeResult;
  }

  const nextPrivileges = applyPrivilegeLosses(roundState.playerPrivileges, privilegeLosses);
  const nextHands = cloneHands(roundState.hands);
  nextHands[input.seat] = removeResult.value;

  const playRecord: PlayRecord = {
    seat: input.seat,
    cards: [...cards],
    cardIds: [...input.cardIds],
    declaredType: input.declaredType,
    playCategory,
    orderIndex,
    privilegeLosses,
  };
  const nextPlays = [...trick.plays, playRecord];
  const completed = nextPlays.length === SEATS.length;
  const nextTrick: TrickState = {
    ...trick,
    leadType,
    leadCategory,
    expectedCardCount,
    plays: nextPlays,
    currentTurnSeat: completed ? trick.currentTurnSeat : getNextSeat(trick.currentTurnSeat),
    status: completed ? "awaiting_resolution" : "in_progress",
  };

  return ok({
    ...roundState,
    hands: nextHands,
    playerPrivileges: nextPrivileges,
    currentTrick: nextTrick,
  });
}
