import { describe, expect, it } from "vitest";

import { createDeck } from "./deck";
import { createInitialPlayerPrivileges } from "./privileges";
import { createEmptyHands } from "./round";
import { createTrick, getNextSeat, playCards } from "./trick";
import type {
  Card,
  CardRank,
  DeclaredPlayType,
  GameActionResult,
  OriginalSuit,
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

function findCards(
  originalSuit: OriginalSuit,
  rank: CardRank,
  count: number,
): Card[] {
  const cards = createDeck()
    .filter((card) => card.originalSuit === originalSuit && card.rank === rank)
    .slice(0, count);

  if (cards.length !== count) {
    throw new Error(`Missing ${count} cards for ${originalSuit}-${rank}`);
  }

  return cards;
}

function basePlayingState(
  handsBySeat: Partial<Record<Seat, readonly Card[]>>,
  overrides: Partial<RoundState> = {},
): RoundState {
  const hands = createEmptyHands();

  for (const [seat, cards] of Object.entries(handsBySeat)) {
    hands[Number(seat) as Seat] = [...cards];
  }

  return {
    roundNumber: 1,
    phase: "playing",
    dealerSeat: 0,
    trumpSuit: "hearts",
    hands,
    bottomCards: [],
    drawPile: [],
    dealOrder: [],
    highestTrumpBid: null,
    heavenlyTrumpPrompt: null,
    previousWinnerTeam: null,
    playerPrivileges: createInitialPlayerPrivileges(),
    currentTrick: createTrick(1, 0),
    defenderScore: 0,
    trickHistory: [],
    roundResult: null,
    tributeState: null,
    takenBottomCards: [],
    firstLeadSeat: 0,
    ...overrides,
  };
}

function play(
  state: RoundState,
  seat: Seat,
  cards: readonly Card[],
  declaredType: DeclaredPlayType,
): RoundState {
  return expectOk(
    playCards(state, {
      seat,
      cardIds: cards.map((card) => card.id),
      declaredType,
    }),
  );
}

describe("trick state", () => {
  it("creates a trick with the leader as the current turn", () => {
    const trick = createTrick(3, 2);

    expect(trick).toMatchObject({
      trickNumber: 3,
      leaderSeat: 2,
      currentTurnSeat: 2,
      leadType: null,
      leadCategory: null,
      expectedCardCount: null,
      plays: [],
      status: "in_progress",
    });
    expect(getNextSeat(3)).toBe(0);
  });

  it("records all four plays, advances turns, and waits for later resolution", () => {
    const spade7 = findCards("spades", "7", 1);
    const spade8 = findCards("spades", "8", 1);
    const club7 = findCards("clubs", "7", 1);
    const diamond7 = findCards("diamonds", "7", 1);
    const started = basePlayingState({
      0: spade7,
      1: spade8,
      2: club7,
      3: diamond7,
    });

    const afterLead = play(started, 0, spade7, "single");
    expect(afterLead.currentTrick?.leadType).toBe("single");
    expect(afterLead.currentTrick?.leadCategory).toBe("spades");
    expect(afterLead.currentTrick?.currentTurnSeat).toBe(1);
    expect(afterLead.hands[0]).toHaveLength(0);

    const afterSeat1 = play(afterLead, 1, spade8, "single");
    const afterSeat2 = play(afterSeat1, 2, club7, "single");
    const afterSeat3 = play(afterSeat2, 3, diamond7, "single");

    expect(afterSeat3.currentTrick?.plays.map((record) => record.seat)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(afterSeat3.currentTrick?.plays.map((record) => record.orderIndex)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(afterSeat3.currentTrick?.status).toBe("awaiting_resolution");
  });
});

describe("lead play validation", () => {
  it("rejects loose leads and invalid declared groups", () => {
    const spade7 = findCards("spades", "7", 1);
    const spade8 = findCards("spades", "8", 1);
    const state = basePlayingState({ 0: [...spade7, ...spade8] });

    expectErrorCode(
      playCards(state, { seat: 0, cardIds: [spade7[0]?.id ?? ""], declaredType: "loose" }),
      "LOOSE_CANNOT_LEAD",
    );
    expectErrorCode(
      playCards(state, {
        seat: 0,
        cardIds: [spade7[0]?.id ?? "", spade8[0]?.id ?? ""],
        declaredType: "pair",
      }),
      "CARDS_DO_NOT_FORM_PAIR",
    );
  });

  it("rejects group leads after the matching lead privilege has been lost", () => {
    const spade7Pair = findCards("spades", "7", 2);
    const state = basePlayingState({ 0: spade7Pair });
    state.playerPrivileges[0].spades.pair = false;

    expectErrorCode(
      playCards(state, {
        seat: 0,
        cardIds: spade7Pair.map((card) => card.id),
        declaredType: "pair",
      }),
      "LEAD_PRIVILEGE_LOST",
    );
  });

  it("accepts pair, triple, and quad leads and records declaredType", () => {
    const pair = findCards("spades", "7", 2);
    const triple = findCards("clubs", "8", 3);
    const quad = findCards("diamonds", "9", 4);

    expect(play(basePlayingState({ 0: pair }), 0, pair, "pair").currentTrick?.plays[0]?.declaredType).toBe("pair");
    expect(play(basePlayingState({ 0: triple }), 0, triple, "triple").currentTrick?.plays[0]?.declaredType).toBe("triple");
    expect(play(basePlayingState({ 0: quad }), 0, quad, "quad").currentTrick?.plays[0]?.declaredType).toBe("quad");
  });
});

describe("follow count and declaration validation", () => {
  it("requires followers to play the lead card count", () => {
    const leadPair = findCards("spades", "7", 2);
    const followSingle = findCards("spades", "8", 1);
    const state = play(
      basePlayingState({
        0: leadPair,
        1: followSingle,
      }),
      0,
      leadPair,
      "pair",
    );

    expectErrorCode(
      playCards(state, {
        seat: 1,
        cardIds: followSingle.map((card) => card.id),
        declaredType: "loose",
      }),
      "INVALID_CARD_COUNT",
    );
  });

  it("requires enough lead-category cards and requires exhausting a short category", () => {
    const leadPair = findCards("spades", "7", 2);
    const spade8 = findCards("spades", "8", 1);
    const spade9 = findCards("spades", "9", 1);
    const club7 = findCards("clubs", "7", 1);
    const club8 = findCards("clubs", "8", 1);
    const enoughState = play(
      basePlayingState({
        0: leadPair,
        1: [...spade8, ...spade9, ...club7],
      }),
      0,
      leadPair,
      "pair",
    );

    const enoughError = playCards(enoughState, {
      seat: 1,
      cardIds: [spade8[0]?.id ?? "", club7[0]?.id ?? ""],
      declaredType: "loose",
    });
    expectErrorCode(enoughError, "MUST_FOLLOW_CATEGORY");

    const shortState = play(
      basePlayingState({
        0: leadPair,
        1: [...spade8, ...club7, ...club8],
      }),
      0,
      leadPair,
      "pair",
    );

    const shortError = playCards(shortState, {
      seat: 1,
      cardIds: [club7[0]?.id ?? "", club8[0]?.id ?? ""],
      declaredType: "loose",
    });
    expectErrorCode(shortError, "MUST_EXHAUST_LEAD_CATEGORY");
  });

  it("allows a matching group follow without losing privilege", () => {
    const leadPair = findCards("spades", "7", 2);
    const followPair = findCards("spades", "8", 2);
    const state = play(
      basePlayingState({
        0: leadPair,
        1: followPair,
      }),
      0,
      leadPair,
      "pair",
    );
    const afterFollow = play(state, 1, followPair, "pair");
    const followRecord = afterFollow.currentTrick?.plays[1];

    expect(followRecord?.declaredType).toBe("pair");
    expect(followRecord?.privilegeLosses).toEqual([]);
    expect(afterFollow.playerPrivileges[1].spades.pair).toBe(true);
  });

  it("records privilege loss when a player actively plays loose despite holding a valid lead-category group", () => {
    const leadPair = findCards("spades", "7", 2);
    const spade8Pair = findCards("spades", "8", 2);
    const state = play(
      basePlayingState({
        0: leadPair,
        1: spade8Pair,
      }),
      0,
      leadPair,
      "pair",
    );
    const afterFollow = play(state, 1, spade8Pair, "loose");
    const followRecord = afterFollow.currentTrick?.plays[1];

    expect(followRecord?.privilegeLosses).toEqual([
      {
        seat: 1,
        category: "spades",
        groupType: "pair",
      },
    ]);
    expect(afterFollow.playerPrivileges[1].spades.pair).toBe(false);
    expect(afterFollow.playerPrivileges[1].spades.triple).toBe(true);
  });

  it("loses triple privilege after a quad lead when the player can follow triple plus one but does not", () => {
    const leadQuad = findCards("spades", "7", 4);
    const spade8Triple = findCards("spades", "8", 3);
    const spadeSingles = [
      ...findCards("spades", "9", 1),
      ...findCards("spades", "10", 1),
      ...findCards("spades", "J", 1),
      ...findCards("spades", "Q", 1),
    ];
    const state = play(
      basePlayingState({
        0: leadQuad,
        1: [...spade8Triple, ...spadeSingles],
      }),
      0,
      leadQuad,
      "quad",
    );
    const afterFollow = play(state, 1, spadeSingles, "loose");

    expect(afterFollow.currentTrick?.plays[1]?.privilegeLosses).toEqual([
      {
        seat: 1,
        category: "spades",
        groupType: "triple",
      },
    ]);
    expect(afterFollow.playerPrivileges[1].spades.triple).toBe(false);
    expect(afterFollow.playerPrivileges[1].spades.pair).toBe(true);
  });

  it("loses pair privilege after a quad lead when the player can follow two pairs but does not", () => {
    const leadQuad = findCards("spades", "7", 4);
    const spade8Pair = findCards("spades", "8", 2);
    const spade9Pair = findCards("spades", "9", 2);
    const spadeSingles = [
      ...findCards("spades", "10", 1),
      ...findCards("spades", "J", 1),
      ...findCards("spades", "Q", 1),
      ...findCards("spades", "K", 1),
    ];
    const state = play(
      basePlayingState({
        0: leadQuad,
        1: [...spade8Pair, ...spade9Pair, ...spadeSingles],
      }),
      0,
      leadQuad,
      "quad",
    );
    const afterFollow = play(state, 1, spadeSingles, "loose");

    expect(afterFollow.currentTrick?.plays[1]?.privilegeLosses).toEqual([
      {
        seat: 1,
        category: "spades",
        groupType: "pair",
      },
    ]);
    expect(afterFollow.playerPrivileges[1].spades.pair).toBe(false);
  });

  it("loses pair privilege after a triple lead when the player can follow pair plus one but does not", () => {
    const leadTriple = findCards("spades", "7", 3);
    const spade8Pair = findCards("spades", "8", 2);
    const spadeSingles = [
      ...findCards("spades", "9", 1),
      ...findCards("spades", "10", 1),
      ...findCards("spades", "J", 1),
    ];
    const state = play(
      basePlayingState({
        0: leadTriple,
        1: [...spade8Pair, ...spadeSingles],
      }),
      0,
      leadTriple,
      "triple",
    );
    const afterFollow = play(state, 1, spadeSingles, "loose");

    expect(afterFollow.currentTrick?.plays[1]?.privilegeLosses).toEqual([
      {
        seat: 1,
        category: "spades",
        groupType: "pair",
      },
    ]);
    expect(afterFollow.playerPrivileges[1].spades.pair).toBe(false);
  });

  it("does not lose privilege when lead-category cards cannot form the led group", () => {
    const leadPair = findCards("spades", "7", 2);
    const spade8 = findCards("spades", "8", 1);
    const spade9 = findCards("spades", "9", 1);
    const state = play(
      basePlayingState({
        0: leadPair,
        1: [...spade8, ...spade9],
      }),
      0,
      leadPair,
      "pair",
    );
    const afterFollow = play(state, 1, [...spade8, ...spade9], "loose");

    expect(afterFollow.currentTrick?.plays[1]?.privilegeLosses).toEqual([]);
    expect(afterFollow.playerPrivileges[1].spades.pair).toBe(true);
  });

  it("does not lose privilege when the player cannot follow category and chooses not to trump", () => {
    const leadTriple = findCards("clubs", "7", 3);
    const diamondCards = [
      ...findCards("diamonds", "8", 1),
      ...findCards("diamonds", "9", 1),
      ...findCards("diamonds", "10", 1),
    ];
    const trumpTriple = findCards("hearts", "7", 3);
    const state = play(
      basePlayingState({
        0: leadTriple,
        1: [...diamondCards, ...trumpTriple],
      }),
      0,
      leadTriple,
      "triple",
    );
    const afterFollow = play(state, 1, diamondCards, "loose");

    expect(afterFollow.currentTrick?.plays[1]?.privilegeLosses).toEqual([]);
    expect(afterFollow.playerPrivileges[1].clubs.triple).toBe(true);
    expect(afterFollow.playerPrivileges[1].trump.triple).toBe(true);
  });

  it("allows trumping with a declared group only when the player is void in lead category", () => {
    const leadQuad = findCards("clubs", "7", 4);
    const trumpQuad = findCards("hearts", "8", 4);
    const state = play(
      basePlayingState({
        0: leadQuad,
        1: trumpQuad,
      }),
      0,
      leadQuad,
      "quad",
    );
    const afterFollow = play(state, 1, trumpQuad, "quad");

    expect(afterFollow.currentTrick?.plays[1]?.playCategory).toBe("trump");
    expect(afterFollow.currentTrick?.plays[1]?.privilegeLosses).toEqual([]);
  });
});

describe("common play errors", () => {
  it("rejects out-of-turn play, duplicate ids, and missing cards", () => {
    const spade7 = findCards("spades", "7", 1);
    const club7 = findCards("clubs", "7", 1);
    const state = basePlayingState({ 0: spade7, 1: club7 });

    expectErrorCode(
      playCards(state, { seat: 1, cardIds: [club7[0]?.id ?? ""], declaredType: "single" }),
      "NOT_CURRENT_TURN",
    );
    expectErrorCode(
      playCards(state, {
        seat: 0,
        cardIds: [spade7[0]?.id ?? "", spade7[0]?.id ?? ""],
        declaredType: "pair",
      }),
      "DUPLICATE_CARD_ID",
    );
    expectErrorCode(
      playCards(state, { seat: 0, cardIds: [club7[0]?.id ?? ""], declaredType: "single" }),
      "CARD_NOT_IN_HAND",
    );
  });
});
