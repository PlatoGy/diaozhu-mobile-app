import { describe, expect, it } from "vitest";

import { createDeck } from "./deck";
import { getPlayCategoryForCards } from "./privileges";
import {
  calculateTrickPoints,
  canResolveTrick,
  resolveTrick,
} from "./trick-resolution";
import type {
  Card,
  CardRank,
  DeclaredPlayType,
  EffectiveDeclaredPlayType,
  GameActionResult,
  OriginalSuit,
  PlayRecord,
  Seat,
  StandardSuit,
  TrickState,
} from "./types";

const TRUMP_SUIT: StandardSuit = "hearts";

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

function record(
  seat: Seat,
  orderIndex: PlayRecord["orderIndex"],
  cards: readonly Card[],
  declaredType: DeclaredPlayType,
  trumpSuit: StandardSuit = TRUMP_SUIT,
): PlayRecord {
  return {
    seat,
    cards: [...cards],
    cardIds: cards.map((card) => card.id),
    declaredType,
    playCategory: getPlayCategoryForCards(cards, trumpSuit),
    orderIndex,
    privilegeLosses: [],
  };
}

function trick(
  leadType: EffectiveDeclaredPlayType,
  plays: readonly PlayRecord[],
  overrides: Partial<TrickState> = {},
): TrickState {
  const firstPlay = plays.find((play) => play.orderIndex === 0) ?? plays[0];

  return {
    trickNumber: 1,
    leaderSeat: firstPlay?.seat ?? 0,
    currentTurnSeat: firstPlay?.seat ?? 0,
    leadType,
    leadCategory: firstPlay ? getPlayCategoryForCards(firstPlay.cards, TRUMP_SUIT) : null,
    expectedCardCount: firstPlay?.cards.length as 1 | 2 | 3 | 4 | undefined ?? null,
    plays: [...plays],
    status: "awaiting_resolution",
    resolution: null,
    ...overrides,
  };
}

function winnerSeat(trickState: TrickState): Seat {
  return expectOk(resolveTrick(trickState, TRUMP_SUIT)).resolution?.winnerSeat ?? 0;
}

describe("trick resolution validation", () => {
  it("rejects tricks that are not ready, incomplete, already resolved, or structurally invalid", () => {
    const spade7 = findCards("spades", "7", 1);
    const spade8 = findCards("spades", "8", 1);
    const spade9 = findCards("spades", "9", 1);
    const spade10 = findCards("spades", "10", 1);
    const base = trick("single", [
      record(0, 0, spade7, "single"),
      record(1, 1, spade8, "single"),
      record(2, 2, spade9, "single"),
      record(3, 3, spade10, "single"),
    ]);

    expectErrorCode(resolveTrick({ ...base, status: "in_progress" }, TRUMP_SUIT), "TRICK_NOT_READY");
    expectErrorCode(resolveTrick({ ...base, plays: base.plays.slice(0, 3) }, TRUMP_SUIT), "INVALID_PLAY_COUNT");
    expectErrorCode(resolveTrick({ ...base, plays: [base.plays[0]!, { ...base.plays[1]!, seat: 0 }, base.plays[2]!, base.plays[3]!] }, TRUMP_SUIT), "DUPLICATE_PLAY_SEAT");
    expectErrorCode(resolveTrick({ ...base, plays: [base.plays[0]!, { ...base.plays[1]!, orderIndex: 0 }, base.plays[2]!, base.plays[3]!] }, TRUMP_SUIT), "INVALID_PLAY_ORDER");
    expectErrorCode(resolveTrick({ ...base, leadType: null }, TRUMP_SUIT), "MISSING_LEAD_TYPE");
    expectErrorCode(resolveTrick({ ...base, leadCategory: null }, TRUMP_SUIT), "MISSING_LEAD_CATEGORY");
    expectErrorCode(resolveTrick({ ...base, expectedCardCount: null }, TRUMP_SUIT), "MISSING_EXPECTED_CARD_COUNT");
    expectErrorCode(resolveTrick({ ...base, leaderSeat: 1 }, TRUMP_SUIT), "LEADER_PLAY_MISMATCH");

    const resolved = expectOk(resolveTrick(base, TRUMP_SUIT));
    expect(canResolveTrick(base)).toBe(true);
    expectErrorCode(resolveTrick(resolved, TRUMP_SUIT), "TRICK_ALREADY_RESOLVED");
  });

  it("rejects invalid card counts and invalid declared group records", () => {
    const spade7Pair = findCards("spades", "7", 2);
    const spade8 = findCards("spades", "8", 1);
    const spade9 = findCards("spades", "9", 1);
    const spade10Pair = findCards("spades", "10", 2);
    const spadeJPair = findCards("spades", "J", 2);
    const spadeQPair = findCards("spades", "Q", 2);
    const base = trick("pair", [
      record(0, 0, spade7Pair, "pair"),
      record(1, 1, spade10Pair, "pair"),
      record(2, 2, spadeJPair, "pair"),
      record(3, 3, spadeQPair, "pair"),
    ]);

    expectErrorCode(
      resolveTrick({ ...base, plays: [base.plays[0]!, record(1, 1, [spade8[0]!, spade9[0]!], "pair"), base.plays[2]!, base.plays[3]!] }, TRUMP_SUIT),
      "INVALID_PLAY_RECORD",
    );
    expectErrorCode(
      resolveTrick({ ...base, plays: [base.plays[0]!, { ...base.plays[1]!, cards: base.plays[1]!.cards.slice(0, 1) }, base.plays[2]!, base.plays[3]!] }, TRUMP_SUIT),
      "INVALID_PLAY_CARD_COUNT",
    );

    const invalidTriple = trick("triple", [
      record(0, 0, findCards("spades", "7", 3), "triple"),
      record(1, 1, [findCards("spades", "8", 1)[0]!, findCards("spades", "9", 1)[0]!, findCards("spades", "10", 1)[0]!], "triple"),
      record(2, 2, findCards("spades", "J", 3), "triple"),
      record(3, 3, findCards("spades", "Q", 3), "triple"),
    ]);
    const invalidQuad = trick("quad", [
      record(0, 0, findCards("spades", "7", 4), "quad"),
      record(1, 1, [findCards("spades", "8", 1)[0]!, findCards("spades", "9", 1)[0]!, findCards("spades", "10", 1)[0]!, findCards("spades", "J", 1)[0]!], "quad"),
      record(2, 2, findCards("spades", "Q", 4), "quad"),
      record(3, 3, findCards("spades", "K", 4), "quad"),
    ]);

    expectErrorCode(resolveTrick(invalidTriple, TRUMP_SUIT), "INVALID_PLAY_RECORD");
    expectErrorCode(resolveTrick(invalidQuad, TRUMP_SUIT), "INVALID_PLAY_RECORD");
  });
});

describe("single play comparison", () => {
  it("compares lead-suit singles above off-suit padding and below trump", () => {
    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("spades", "4", 1), "single"),
          record(1, 1, findCards("clubs", "A", 1), "single"),
          record(2, 2, findCards("spades", "K", 1), "single"),
          record(3, 3, findCards("spades", "A", 1), "single"),
        ]),
      ),
    ).toBe(3);

    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("spades", "A", 1), "single"),
          record(1, 1, findCards("clubs", "A", 1), "single"),
          record(2, 2, findCards("hearts", "4", 1), "single"),
          record(3, 3, findCards("spades", "K", 1), "single"),
        ]),
      ),
    ).toBe(2);
  });

  it("uses the full trump strength ladder for singles", () => {
    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("spades", "A", 1), "single"),
          record(1, 1, findCards("hearts", "A", 1), "single"),
          record(2, 2, findCards("spades", "2", 1), "single"),
          record(3, 3, findCards("hearts", "2", 1), "single"),
        ]),
      ),
    ).toBe(3);

    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("spades", "A", 1), "single"),
          record(1, 1, findCards("spades", "2", 1), "single"),
          record(2, 2, findCards("spades", "3", 1), "single"),
          record(3, 3, findCards("hearts", "3", 1), "single"),
        ]),
      ),
    ).toBe(3);

    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("spades", "A", 1), "single"),
          record(1, 1, findCards("hearts", "3", 1), "single"),
          record(2, 2, findCards("spades", "5", 1), "single"),
          record(3, 3, findCards("joker", "small_joker", 1), "single"),
        ]),
      ),
    ).toBe(3);

    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("spades", "A", 1), "single"),
          record(1, 1, findCards("joker", "small_joker", 1), "single"),
          record(2, 2, findCards("joker", "big_joker", 1), "single"),
          record(3, 3, findCards("hearts", "5", 1), "single"),
        ]),
      ),
    ).toBe(3);
  });

  it("only lets trump compete when trump is led", () => {
    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("hearts", "4", 1), "single"),
          record(1, 1, findCards("clubs", "A", 1), "single"),
          record(2, 2, findCards("hearts", "K", 1), "single"),
          record(3, 3, findCards("hearts", "A", 1), "single"),
        ]),
      ),
    ).toBe(3);
  });

  it("keeps the earlier play when card strength is identical", () => {
    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("spades", "A", 1), "single"),
          record(1, 1, [findCards("spades", "A", 2)[1]!], "single"),
          record(2, 2, findCards("clubs", "4", 1), "single"),
          record(3, 3, findCards("diamonds", "4", 1), "single"),
        ]),
      ),
    ).toBe(0);

    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("hearts", "5", 1), "single"),
          record(1, 1, [findCards("hearts", "5", 2)[1]!], "single"),
          record(2, 2, findCards("joker", "big_joker", 1), "single"),
          record(3, 3, findCards("clubs", "A", 1), "single"),
        ]),
      ),
    ).toBe(0);

    expect(
      winnerSeat(
        trick("single", [
          record(0, 0, findCards("joker", "big_joker", 1), "single"),
          record(1, 1, [findCards("joker", "big_joker", 2)[1]!], "single"),
          record(2, 2, findCards("spades", "A", 1), "single"),
          record(3, 3, findCards("clubs", "A", 1), "single"),
        ]),
      ),
    ).toBe(0);
  });
});

describe("group play comparison", () => {
  it("lets higher lead-category pairs win, trump pairs beat lead-category pairs, and loose pairs never win", () => {
    expect(
      winnerSeat(
        trick("pair", [
          record(0, 0, findCards("spades", "9", 2), "pair"),
          record(1, 1, findCards("spades", "A", 2), "pair"),
          record(2, 2, findCards("hearts", "7", 2), "pair"),
          record(3, 3, findCards("joker", "big_joker", 1).concat(findCards("joker", "small_joker", 1)), "loose"),
        ]),
      ),
    ).toBe(2);

    expect(
      winnerSeat(
        trick("pair", [
          record(0, 0, findCards("spades", "9", 2), "pair"),
          record(1, 1, findCards("clubs", "A", 2), "loose"),
          record(2, 2, [findCards("spades", "5", 1)[0]!, findCards("hearts", "5", 1)[0]!], "loose"),
          record(3, 3, findCards("diamonds", "A", 2), "loose"),
        ]),
      ),
    ).toBe(0);
  });

  it("keeps the earlier equal pair, triple, or quad winner", () => {
    expect(
      winnerSeat(
        trick("pair", [
          record(0, 0, findCards("spades", "A", 2), "pair"),
          record(1, 1, findCards("spades", "A", 4).slice(2, 4), "pair"),
          record(2, 2, findCards("clubs", "4", 2), "loose"),
          record(3, 3, findCards("diamonds", "4", 2), "loose"),
        ]),
      ),
    ).toBe(0);

    expect(
      winnerSeat(
        trick("triple", [
          record(0, 0, findCards("spades", "K", 3), "triple"),
          record(1, 1, findCards("spades", "K", 4).slice(1, 4), "triple"),
          record(2, 2, findCards("clubs", "4", 3), "loose"),
          record(3, 3, findCards("diamonds", "4", 3), "loose"),
        ]),
      ),
    ).toBe(0);

    expect(
      winnerSeat(
        trick("quad", [
          record(0, 0, findCards("spades", "5", 4), "quad"),
          record(1, 1, findCards("clubs", "5", 4), "quad"),
          record(2, 2, findCards("clubs", "4", 4), "loose"),
          record(3, 3, findCards("diamonds", "4", 4), "loose"),
        ]),
      ),
    ).toBe(0);
  });

  it("compares triples and quads with trump groups above lead-category groups", () => {
    expect(
      winnerSeat(
        trick("triple", [
          record(0, 0, findCards("spades", "9", 3), "triple"),
          record(1, 1, findCards("spades", "A", 3), "triple"),
          record(2, 2, findCards("hearts", "7", 3), "triple"),
          record(3, 3, findCards("clubs", "A", 3), "loose"),
        ]),
      ),
    ).toBe(2);

    expect(
      winnerSeat(
        trick("quad", [
          record(0, 0, findCards("spades", "9", 4), "quad"),
          record(1, 1, findCards("spades", "A", 4), "quad"),
          record(2, 2, findCards("hearts", "7", 4), "quad"),
          record(3, 3, findCards("clubs", "A", 4), "loose"),
        ]),
      ),
    ).toBe(2);
  });

  it("only lets larger trump groups beat a trump group lead", () => {
    expect(
      winnerSeat(
        trick("pair", [
          record(0, 0, findCards("hearts", "7", 2), "pair"),
          record(1, 1, findCards("spades", "A", 2), "loose"),
          record(2, 2, findCards("hearts", "8", 2), "pair"),
          record(3, 3, findCards("clubs", "A", 2), "loose"),
        ]),
      ),
    ).toBe(2);

    expect(
      winnerSeat(
        trick("triple", [
          record(0, 0, findCards("hearts", "7", 3), "triple"),
          record(1, 1, findCards("spades", "A", 3), "loose"),
          record(2, 2, findCards("hearts", "8", 3), "triple"),
          record(3, 3, findCards("clubs", "A", 3), "loose"),
        ]),
      ),
    ).toBe(2);

    expect(
      winnerSeat(
        trick("quad", [
          record(0, 0, findCards("hearts", "7", 4), "quad"),
          record(1, 1, findCards("spades", "A", 4), "loose"),
          record(2, 2, findCards("hearts", "8", 4), "quad"),
          record(3, 3, findCards("clubs", "A", 4), "loose"),
        ]),
      ),
    ).toBe(2);
  });

  it("treats physical groups declared loose as loose instead of restoring their group type", () => {
    expect(
      winnerSeat(
        trick("pair", [
          record(0, 0, findCards("spades", "7", 2), "pair"),
          record(1, 1, findCards("spades", "A", 2), "loose"),
          record(2, 2, findCards("clubs", "4", 2), "loose"),
          record(3, 3, findCards("diamonds", "4", 2), "loose"),
        ]),
      ),
    ).toBe(0);

    expect(
      winnerSeat(
        trick("triple", [
          record(0, 0, findCards("spades", "7", 3), "triple"),
          record(1, 1, findCards("spades", "A", 3), "loose"),
          record(2, 2, findCards("clubs", "4", 3), "loose"),
          record(3, 3, findCards("diamonds", "4", 3), "loose"),
        ]),
      ),
    ).toBe(0);

    expect(
      winnerSeat(
        trick("quad", [
          record(0, 0, findCards("spades", "7", 4), "quad"),
          record(1, 1, findCards("spades", "A", 4), "loose"),
          record(2, 2, findCards("clubs", "4", 4), "loose"),
          record(3, 3, findCards("diamonds", "4", 4), "loose"),
        ]),
      ),
    ).toBe(0);
  });
});

describe("trick points and resolved trick", () => {
  it("calculates all points in a trick without considering the winner", () => {
    const plays = [
      record(0, 0, findCards("spades", "5", 1), "single"),
      record(1, 1, findCards("clubs", "10", 1), "single"),
      record(2, 2, findCards("diamonds", "K", 1), "single"),
      record(3, 3, findCards("joker", "big_joker", 1), "single"),
    ];

    expect(calculateTrickPoints(plays)).toBe(25);
    expect(
      calculateTrickPoints([
        record(0, 0, findCards("spades", "4", 1), "single"),
        record(1, 1, findCards("clubs", "6", 1), "single"),
        record(2, 2, findCards("diamonds", "7", 1), "single"),
        record(3, 3, findCards("joker", "small_joker", 1), "single"),
      ]),
    ).toBe(0);
  });

  it("returns a resolved trick snapshot without mutating the original trick", () => {
    const original = trick("single", [
      record(0, 0, findCards("spades", "K", 1), "single"),
      record(1, 1, findCards("spades", "A", 1), "single"),
      record(2, 2, findCards("clubs", "10", 1), "single"),
      record(3, 3, findCards("diamonds", "K", 1), "single"),
    ]);
    const resolved = expectOk(resolveTrick(original, TRUMP_SUIT));

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution).toMatchObject({
      trickNumber: 1,
      winnerSeat: 1,
      winningPlayOrderIndex: 1,
      leaderSeat: 0,
      leadType: "single",
      leadCategory: "spades",
      trickPoints: 30,
    });
    expect(resolved.resolution?.winningPlay).toEqual(original.plays[1]);
    expect(resolved.resolution?.plays).toEqual(original.plays);
    expect(resolved.resolution?.plays).not.toBe(original.plays);
    expect(original.status).toBe("awaiting_resolution");
    expect(original.resolution).toBeNull();
  });
});
