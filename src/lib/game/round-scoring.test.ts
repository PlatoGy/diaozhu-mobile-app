import { describe, expect, it } from "vitest";

import { createDeck } from "./deck";
import { createInitialPlayerPrivileges } from "./privileges";
import { createEmptyHands } from "./round";
import {
  calculateLastTrickScoreAddition,
  calculateNormalTrickScoreAddition,
  calculateTributeCount,
  finalizeCurrentTrick,
  hasInconsistentFinalHands,
  isFinalTrick,
} from "./round-scoring";
import { calculateTrickPoints } from "./trick-resolution";
import { getPlayCategoryForCards } from "./privileges";
import { getOpponentTeam, getPartnerSeat, getTeamForSeat, isDefenderSeat } from "./teams";
import type {
  Card,
  CardRank,
  DeclaredPlayType,
  EffectiveDeclaredPlayType,
  GameActionResult,
  OriginalSuit,
  PlayRecord,
  ResolvedTrick,
  RoundState,
  Seat,
} from "./types";

function expectOk<T>(result: GameActionResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got ${result.error.code}`);
  }

  return result.value;
}

function expectErrorCode<T>(result: GameActionResult<T>, code: string) {
  if (result.ok) {
    throw new Error(`Expected error ${code}`);
  }

  expect(result.error.code).toBe(code);
}

function findCards(originalSuit: OriginalSuit, rank: CardRank, count: number): Card[] {
  const cards = createDeck()
    .filter((card) => card.originalSuit === originalSuit && card.rank === rank)
    .slice(0, count);

  if (cards.length !== count) {
    throw new Error(`Missing ${count} cards for ${originalSuit}-${rank}`);
  }

  return cards;
}

function nonPointCards(count: number): Card[] {
  return createDeck()
    .filter((card) => card.originalSuit !== "joker" && card.rank === "4")
    .slice(0, count);
}

function bottomCardsWithPoints(points: 0 | 20): Card[] {
  const pointCards = points === 20 ? findCards("spades", "10", 2) : [];
  const fillers = createDeck()
    .filter(
      (card) =>
        card.rank === "4" &&
        !pointCards.some((pointCard) => pointCard.id === card.id),
    )
    .slice(0, 8 - pointCards.length);

  return [...pointCards, ...fillers];
}

function playRecord(
  seat: Seat,
  orderIndex: PlayRecord["orderIndex"],
  cards: readonly Card[],
  declaredType: DeclaredPlayType,
): PlayRecord {
  return {
    seat,
    cards: [...cards],
    cardIds: cards.map((card) => card.id),
    declaredType,
    playCategory: getPlayCategoryForCards(cards, "hearts"),
    orderIndex,
    privilegeLosses: [],
  };
}

function resolvedTrick(input: {
  trickNumber?: number;
  winnerSeat: Seat;
  leadType?: EffectiveDeclaredPlayType;
  cardsBySeat?: Partial<Record<Seat, readonly Card[]>>;
  trickPoints?: number;
}): ResolvedTrick {
  const leadType = input.leadType ?? "single";
  const defaultCards = {
    0: findCards("spades", "4", 1),
    1: findCards("clubs", "4", 1),
    2: findCards("diamonds", "4", 1),
    3: findCards("hearts", "4", 1),
  } satisfies Record<Seat, Card[]>;
  const cardsBySeat = {
    0: input.cardsBySeat?.[0] ?? defaultCards[0],
    1: input.cardsBySeat?.[1] ?? defaultCards[1],
    2: input.cardsBySeat?.[2] ?? defaultCards[2],
    3: input.cardsBySeat?.[3] ?? defaultCards[3],
  };
  const plays = [
    playRecord(0, 0, cardsBySeat[0], leadType),
    playRecord(1, 1, cardsBySeat[1], leadType === "single" ? "single" : "loose"),
    playRecord(2, 2, cardsBySeat[2], leadType === "single" ? "single" : "loose"),
    playRecord(3, 3, cardsBySeat[3], leadType === "single" ? "single" : "loose"),
  ];
  const winningPlay = plays.find((play) => play.seat === input.winnerSeat) ?? plays[0];

  return {
    trickNumber: input.trickNumber ?? 1,
    winnerSeat: input.winnerSeat,
    winningPlay,
    winningPlayOrderIndex: winningPlay.orderIndex,
    leaderSeat: 0,
    leadType,
    leadCategory: getPlayCategoryForCards(cardsBySeat[0], "hearts") === "mixed"
      ? "spades"
      : getPlayCategoryForCards(cardsBySeat[0], "hearts"),
    trickPoints: input.trickPoints ?? calculateTrickPoints(plays),
    plays,
  };
}

function baseRoundState(
  resolved: ResolvedTrick,
  overrides: Partial<RoundState> = {},
): RoundState {
  return {
    roundNumber: 1,
    phase: "playing",
    dealerSeat: 0,
    trumpSuit: "hearts",
    hands: {
      0: nonPointCards(1),
      1: nonPointCards(1),
      2: nonPointCards(1),
      3: nonPointCards(1),
    },
    bottomCards: bottomCardsWithPoints(0),
    drawPile: [],
    dealOrder: [],
    highestTrumpBid: null,
    heavenlyTrumpPrompt: null,
    previousWinnerTeam: null,
    playerPrivileges: createInitialPlayerPrivileges(),
    currentTrick: {
      trickNumber: resolved.trickNumber,
      leaderSeat: resolved.leaderSeat,
      currentTurnSeat: resolved.winnerSeat,
      leadType: resolved.leadType,
      leadCategory: resolved.leadCategory,
      expectedCardCount: resolved.winningPlay.cards.length as 1 | 2 | 3 | 4,
      plays: resolved.plays,
      status: "resolved",
      resolution: resolved,
    },
    defenderScore: 0,
    trickHistory: [],
    roundResult: null,
    tributeState: null,
    takenBottomCards: [],
    firstLeadSeat: 0,
    ...overrides,
  };
}

describe("team helpers", () => {
  it("maps fixed partners and defender seats", () => {
    expect(getTeamForSeat(0)).toBe(getTeamForSeat(2));
    expect(getTeamForSeat(1)).toBe(getTeamForSeat(3));
    expect(getPartnerSeat(0)).toBe(2);
    expect(getPartnerSeat(1)).toBe(3);
    expect(getOpponentTeam("team_0_2")).toBe("team_1_3");
    expect(isDefenderSeat(2, 0)).toBe(false);
    expect(isDefenderSeat(1, 0)).toBe(true);
    expect(isDefenderSeat(3, 0)).toBe(true);
  });
});

describe("normal trick scoring", () => {
  it("adds trick points only when the defender team wins", () => {
    expect(calculateNormalTrickScoreAddition(resolvedTrick({ winnerSeat: 0, trickPoints: 20 }), 0)).toBe(0);
    expect(calculateNormalTrickScoreAddition(resolvedTrick({ winnerSeat: 2, trickPoints: 20 }), 0)).toBe(0);
    expect(calculateNormalTrickScoreAddition(resolvedTrick({ winnerSeat: 1, trickPoints: 20 }), 0)).toBe(20);
    expect(calculateNormalTrickScoreAddition(resolvedTrick({ winnerSeat: 3, trickPoints: 20 }), 0)).toBe(20);
    expect(calculateNormalTrickScoreAddition(resolvedTrick({ winnerSeat: 1, trickPoints: 0 }), 0)).toBe(0);
  });

  it("moves a non-final resolved trick into history and creates the next trick led by the winner", () => {
    const resolved = resolvedTrick({ winnerSeat: 1, trickPoints: 20 });
    const state = baseRoundState(resolved, { defenderScore: 5 });
    const nextState = expectOk(finalizeCurrentTrick(state));

    expect(nextState.phase).toBe("playing");
    expect(nextState.defenderScore).toBe(25);
    expect(nextState.trickHistory).toHaveLength(1);
    expect(nextState.trickHistory[0]).toEqual(resolved);
    expect(nextState.currentTrick?.trickNumber).toBe(2);
    expect(nextState.currentTrick?.leaderSeat).toBe(1);
    expect(nextState.currentTrick?.currentTurnSeat).toBe(1);
    expect(state.defenderScore).toBe(5);
    expect(state.trickHistory).toEqual([]);
    expect(state.currentTrick?.status).toBe("resolved");
  });

  it("rejects repeated application and invalid scoring state", () => {
    const resolved = resolvedTrick({ winnerSeat: 1, trickPoints: 20 });
    const state = baseRoundState(resolved, { trickHistory: [resolved] });

    expectErrorCode(finalizeCurrentTrick(state), "TRICK_ALREADY_APPLIED");
    expectErrorCode(finalizeCurrentTrick({ ...baseRoundState(resolved), phase: "dealing" }), "INVALID_PHASE");
    expectErrorCode(finalizeCurrentTrick({ ...baseRoundState(resolved), dealerSeat: null }), "DEALER_NOT_SET");
    expectErrorCode(finalizeCurrentTrick({ ...baseRoundState(resolved), trumpSuit: null }), "TRUMP_NOT_SET");
    expectErrorCode(finalizeCurrentTrick({ ...baseRoundState(resolved), currentTrick: null }), "CURRENT_TRICK_NOT_FOUND");
    expectErrorCode(
      finalizeCurrentTrick({
        ...baseRoundState(resolved),
        currentTrick: { ...baseRoundState(resolved).currentTrick!, status: "awaiting_resolution" },
      }),
      "TRICK_NOT_RESOLVED",
    );
  });
});

describe("final trick scoring", () => {
  it("detects final and inconsistent hand states", () => {
    const emptyHands = createEmptyHands();
    const nonFinalHands = {
      0: nonPointCards(1),
      1: nonPointCards(1),
      2: nonPointCards(1),
      3: nonPointCards(1),
    };
    const inconsistentHands = {
      ...nonFinalHands,
      0: [],
    };

    expect(isFinalTrick(emptyHands)).toBe(true);
    expect(isFinalTrick(nonFinalHands)).toBe(false);
    expect(hasInconsistentFinalHands(inconsistentHands)).toBe(true);
  });

  it("scores last trick for defender wins by bottom plus trick points times multiplier", () => {
    const bottomCards = bottomCardsWithPoints(20);

    expect(
      expectOk(calculateLastTrickScoreAddition(resolvedTrick({ winnerSeat: 1, leadType: "single", cardsBySeat: { 1: nonPointCards(1) }, trickPoints: 10 }), bottomCards, 0)).scoreAdded,
    ).toBe(30);
    expect(
      expectOk(calculateLastTrickScoreAddition(resolvedTrick({ winnerSeat: 1, leadType: "pair", cardsBySeat: { 1: findCards("spades", "4", 2) }, trickPoints: 10 }), bottomCards, 0)).scoreAdded,
    ).toBe(60);
    expect(
      expectOk(calculateLastTrickScoreAddition(resolvedTrick({ winnerSeat: 1, leadType: "triple", cardsBySeat: { 1: findCards("spades", "4", 3) }, trickPoints: 10 }), bottomCards, 0)).scoreAdded,
    ).toBe(90);
    expect(
      expectOk(calculateLastTrickScoreAddition(resolvedTrick({ winnerSeat: 1, leadType: "quad", cardsBySeat: { 1: findCards("spades", "4", 4) }, trickPoints: 10 }), bottomCards, 0)).scoreAdded,
    ).toBe(120);
  });

  it("does not add bottom or last-trick points when dealer team wins the last trick", () => {
    const bottomCards = bottomCardsWithPoints(20);

    expect(
      expectOk(calculateLastTrickScoreAddition(resolvedTrick({ winnerSeat: 0, trickPoints: 10 }), bottomCards, 0)).scoreAdded,
    ).toBe(0);
    expect(
      expectOk(calculateLastTrickScoreAddition(resolvedTrick({ winnerSeat: 2, trickPoints: 10 }), bottomCards, 0)).scoreAdded,
    ).toBe(0);
  });

  it("finalizes the round without double-counting the last trick", () => {
    const resolved = resolvedTrick({
      winnerSeat: 1,
      leadType: "pair",
      cardsBySeat: { 1: findCards("spades", "4", 2) },
      trickPoints: 10,
    });
    const state = baseRoundState(resolved, {
      defenderScore: 100,
      hands: createEmptyHands(),
      bottomCards: bottomCardsWithPoints(20),
    });
    const nextState = expectOk(finalizeCurrentTrick(state));

    expect(nextState.defenderScore).toBe(160);
    expect(nextState.phase).toBe("round_finished");
    expect(nextState.currentTrick).toBeNull();
    expect(nextState.trickHistory).toHaveLength(1);
    expect(nextState.roundResult).toMatchObject({
      winningSide: "defender_team",
      winningTeam: "team_1_3",
      losingTeam: "team_0_2",
      defenderScore: 160,
      tributeCount: 0,
      lastTrickWinnerSeat: 1,
      bottomPoints: 20,
      lastTrickPoints: 10,
      lastTrickMultiplier: 2,
      lastTrickScoreAdded: 60,
      totalTricks: 1,
    });
    expect(state.phase).toBe("playing");
    expect(state.roundResult).toBeNull();
  });

  it("rejects partially empty hands before final scoring", () => {
    const resolved = resolvedTrick({ winnerSeat: 1, trickPoints: 10 });
    const hands = {
      0: [],
      1: nonPointCards(1),
      2: nonPointCards(1),
      3: nonPointCards(1),
    };

    expectErrorCode(finalizeCurrentTrick(baseRoundState(resolved, { hands })), "INCONSISTENT_FINAL_HANDS");
  });
});

describe("round result tribute count", () => {
  it("calculates dealer-team tribute thresholds", () => {
    const cases: Array<[number, number]> = [
      [155, 0],
      [125, 0],
      [120, 1],
      [85, 1],
      [80, 2],
      [45, 2],
      [40, 3],
      [5, 3],
      [0, 4],
    ];

    for (const [score, tributeCount] of cases) {
      expect(expectOk(calculateTributeCount(score))).toEqual({
        winningSide: "dealer_team",
        tributeCount,
      });
    }
  });

  it("calculates defender-team tribute thresholds without a score cap", () => {
    const cases: Array<[number, number]> = [
      [160, 0],
      [195, 0],
      [200, 1],
      [235, 1],
      [240, 2],
      [280, 3],
      [320, 4],
      [360, 5],
      [400, 6],
      [440, 7],
    ];

    for (const [score, tributeCount] of cases) {
      expect(expectOk(calculateTributeCount(score))).toEqual({
        winningSide: "defender_team",
        tributeCount,
      });
    }
  });
});
