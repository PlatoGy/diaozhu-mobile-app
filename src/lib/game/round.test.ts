import { describe, expect, it } from "vitest";

import { createDeck } from "./deck";
import { createInitialPlayerPrivileges } from "./privileges";
import {
  buryBottom,
  createEmptyHands,
  dealCards,
  determineTrumpFromBottom,
  placeTrumpBid,
  resolveDealerSelection,
  resolveFinalTrumpBidding,
  resolveHeavenlyTrump,
  skipTrumpBid,
  startRound,
  takeBottomCards,
} from "./round";
import type { Card, CardRank, OriginalSuit, RoundState, Seat } from "./types";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) {
    throw new Error("Expected ok result");
  }

  return result.value;
}

function expectErrorCode(
  result: { ok: true } | { ok: false; error: { code: string } },
  code: string,
) {
  if (result.ok) {
    throw new Error(`Expected error ${code}`);
  }

  expect(result.error.code).toBe(code);
}

function findCard(
  cards: readonly Card[],
  originalSuit: OriginalSuit,
  rank: CardRank,
  deckIndex = 0,
): Card {
  const card = cards.find(
    (candidate) =>
      candidate.originalSuit === originalSuit &&
      candidate.rank === rank &&
      candidate.deckIndex === deckIndex,
  );

  if (!card) {
    throw new Error(`Missing card ${deckIndex}-${originalSuit}-${rank}`);
  }

  return card;
}

function findCards(
  cards: readonly Card[],
  originalSuit: OriginalSuit,
  rank: CardRank,
  count: number,
): Card[] {
  return cards
    .filter((card) => card.originalSuit === originalSuit && card.rank === rank)
    .slice(0, count);
}

function createHandsWithSeatCards(seat: Seat, cards: readonly Card[], handSize: number) {
  const deck = createDeck();
  const assignedIds = new Set(cards.map((card) => card.id));
  const filler = deck.filter((card) => !assignedIds.has(card.id));
  const hands = createEmptyHands();
  let fillerIndex = 0;

  for (const currentSeat of [0, 1, 2, 3] as const satisfies readonly Seat[]) {
    const requiredCards = currentSeat === seat ? [...cards] : [];

    while (requiredCards.length < handSize) {
      const fillerCard = filler[fillerIndex];

      if (!fillerCard) {
        throw new Error("Not enough filler cards for test hand");
      }

      requiredCards.push(fillerCard);
      fillerIndex += 1;
    }

    hands[currentSeat] = requiredCards;
  }

  return {
    hands,
    drawPile: filler.slice(fillerIndex),
  };
}

function baseRoundState(overrides: Partial<RoundState> = {}): RoundState {
  return {
    roundNumber: 2,
    phase: "dealing",
    dealerSeat: 0,
    trumpSuit: null,
    hands: createEmptyHands(),
    bottomCards: [],
    drawPile: createDeck(),
    dealOrder: [],
    highestTrumpBid: null,
    heavenlyTrumpPrompt: null,
    previousWinnerTeam: "team_0_2",
    takenBottomCards: [],
    firstLeadSeat: null,
    playerPrivileges: createInitialPlayerPrivileges(),
    currentTrick: null,
    defenderScore: 0,
    trickHistory: [],
    roundResult: null,
    tributeState: null,
    ...overrides,
  };
}

function stateWithHand(seat: Seat, cards: readonly Card[], phase: RoundState["phase"] = "dealing") {
  const hands = createEmptyHands();
  hands[seat] = [...cards];

  return baseRoundState({
    phase,
    hands,
  });
}

function dealtTakingBottomState(): RoundState {
  const started = expectOk(
    startRound({
      roundNumber: 2,
      dealerSeat: 0,
      previousWinnerTeam: "team_0_2",
      random: () => 0.5,
    }),
  );
  const dealt = dealToFinalBidding(started);

  return {
    ...dealt,
    phase: "taking_bottom",
    trumpSuit: "hearts",
    dealerSeat: 0,
    trumpBiddingRound: null,
  };
}

function skipPendingTrumpBids(state: RoundState): RoundState {
  let current = state;

  for (const seat of [0, 1, 2, 3] as const satisfies readonly Seat[]) {
    const response = current.trumpBiddingRound?.responses[seat];

    if (
      (current.phase === "dealing" || current.phase === "final_trump_bidding") &&
      response?.type === "pending"
    ) {
      current = expectOk(skipTrumpBid(current, { seat }));
    }
  }

  return current;
}

function resolveHeavenlyPromptIfNeeded(state: RoundState): RoundState {
  const prompt = state.heavenlyTrumpPrompt;

  if (state.phase !== "heavenly_trump_bidding" || !prompt || prompt.resolved) {
    return state;
  }

  return expectOk(resolveHeavenlyTrump(state, { seat: prompt.seat, accept: false }));
}

function dealToFinalBidding(state: RoundState): RoundState {
  let current = expectOk(dealCards(state));

  for (let guard = 0; guard < 16; guard += 1) {
    current = resolveHeavenlyPromptIfNeeded(current);

    if (current.phase === "final_trump_bidding") {
      return current;
    }

    if (current.phase === "dealing" && current.trumpBiddingRound) {
      current = skipPendingTrumpBids(current);
      continue;
    }

    if (current.phase === "dealing") {
      current = expectOk(dealCards(current));
      continue;
    }

    break;
  }

  throw new Error(`Expected final trump bidding, got ${current.phase}`);
}

describe("dealing", () => {
  it("deals the first card to each player and asks the first 2 holder about heavenly trump", () => {
    const started = expectOk(startRound({ roundNumber: 1, random: () => 0.5 }));
    const dealt = expectOk(dealCards(started));
    const allAssignedCards = [
      ...dealt.hands[0],
      ...dealt.hands[1],
      ...dealt.hands[2],
      ...dealt.hands[3],
      ...dealt.bottomCards,
    ];
    const allAssignedIds = new Set(allAssignedCards.map((card) => card.id));

    const firstTwoIndex = started.drawPile
      .slice(0, 4)
      .findIndex((card) => card.rank === "2" && card.originalSuit !== "joker");
    const firstTwo = started.drawPile[firstTwoIndex];

    if (firstTwoIndex >= 0 && firstTwo?.originalSuit !== "joker") {
      expect(dealt.phase).toBe("heavenly_trump_bidding");
      expect(dealt.heavenlyTrumpPrompt).toEqual({
        seat: (firstTwoIndex % 4) as Seat,
        cardId: firstTwo.id,
        suit: firstTwo.originalSuit,
        resolved: false,
      });
    }

    expect(dealt.hands[0]).toHaveLength(1);
    expect(dealt.hands[1]).toHaveLength(1);
    expect(dealt.hands[2]).toHaveLength(1);
    expect(dealt.hands[3]).toHaveLength(1);
    expect(dealt.bottomCards).toHaveLength(0);
    expect(allAssignedCards).toHaveLength(4);
    expect(allAssignedIds.size).toBe(4);
    expect(dealt.drawPile).toHaveLength(212);
    expect(dealt.dealOrder).toHaveLength(4);
    expect(dealt.dealOrder.map((item) => item.seat)).toEqual([0, 1, 2, 3]);
  });

  it("deals the remaining cards as three 17-card batches after bidding rounds finish", () => {
    const started = expectOk(startRound({ roundNumber: 1, random: () => 0.5 }));
    const dealt = dealToFinalBidding(started);
    const allAssignedCards = [
      ...dealt.hands[0],
      ...dealt.hands[1],
      ...dealt.hands[2],
      ...dealt.hands[3],
      ...dealt.bottomCards,
    ];

    expect(dealt.phase).toBe("final_trump_bidding");
    expect(dealt.trumpBiddingRound?.batchNumber).toBe(4);
    expect(dealt.trumpBiddingRound?.cardsPerPlayerDealt).toBe(52);
    expect(dealt.hands[0]).toHaveLength(52);
    expect(dealt.hands[1]).toHaveLength(52);
    expect(dealt.hands[2]).toHaveLength(52);
    expect(dealt.hands[3]).toHaveLength(52);
    expect(dealt.bottomCards).toHaveLength(8);
    expect(dealt.drawPile).toHaveLength(0);
    expect(allAssignedCards).toHaveLength(216);
    expect(new Set(allAssignedCards.map((card) => card.id)).size).toBe(216);
  });

  it("does not deal while the current bidding round is unresolved", () => {
    const started = expectOk(startRound({ roundNumber: 1, random: () => 0.5 }));
    const dealt = expectOk(dealCards(started));
    const bidding = resolveHeavenlyPromptIfNeeded(dealt);

    expectErrorCode(dealCards({ ...bidding, phase: "dealing" }), "ROUND_ALREADY_STARTED");
  });

  it("allows the first player who received a 2 to accept or skip heavenly trump", () => {
    const started = expectOk(startRound({ roundNumber: 1, random: () => 0.5 }));
    const dealt = expectOk(dealCards(started));
    const prompt = dealt.heavenlyTrumpPrompt;

    if (!prompt) {
      throw new Error("Expected heavenly trump prompt");
    }

    expectErrorCode(
      resolveHeavenlyTrump(dealt, { seat: ((prompt.seat + 1) % 4) as Seat, accept: true }),
      "NOT_HEAVENLY_TRUMP_CANDIDATE",
    );

    const accepted = expectOk(resolveHeavenlyTrump(dealt, { seat: prompt.seat, accept: true }));

    expect(accepted.phase).toBe("dealing");
    expect(accepted.highestTrumpBid).toEqual({
      seat: prompt.seat,
      suit: prompt.suit,
      count: 3,
      cardIds: [prompt.cardId],
      isHeavenly: true,
    });
    expect(accepted.trumpBiddingRound?.responses[prompt.seat]).toEqual({
      type: "bid",
      bid: accepted.highestTrumpBid,
    });

    const skipped = expectOk(resolveHeavenlyTrump(dealt, { seat: prompt.seat, accept: false }));

    expect(skipped.phase).toBe("dealing");
    expect(skipped.highestTrumpBid).toBeNull();
    expect(skipped.trumpBiddingRound?.responses[prompt.seat]).toEqual({ type: "skipped" });
  });
});

describe("trump bidding", () => {
  it("accepts 1, 2, and 4 same-suit 2s", () => {
    const deck = createDeck();
    const oneTwo = findCards(deck, "spades", "2", 1);
    const twoTwos = findCards(deck, "hearts", "2", 2);
    const fourTwos = findCards(deck, "clubs", "2", 4);

    expect(placeTrumpBid(stateWithHand(0, oneTwo), { seat: 0, cardIds: oneTwo.map((card) => card.id) }).ok).toBe(true);
    expect(placeTrumpBid(stateWithHand(1, twoTwos), { seat: 1, cardIds: twoTwos.map((card) => card.id) }).ok).toBe(true);
    expect(placeTrumpBid(stateWithHand(2, fourTwos), { seat: 2, cardIds: fourTwos.map((card) => card.id) }).ok).toBe(true);
  });

  it("rejects mixed suit 2s, jokers, non-2s, duplicates, and cards outside hand", () => {
    const deck = createDeck();
    const spadeTwo = findCard(deck, "spades", "2");
    const heartTwo = findCard(deck, "hearts", "2");
    const joker = findCard(deck, "joker", "big_joker");
    const spadeAce = findCard(deck, "spades", "A");
    const state = stateWithHand(0, [spadeTwo, heartTwo, joker, spadeAce]);

    expectErrorCode(
      placeTrumpBid(state, { seat: 0, cardIds: [spadeTwo.id, heartTwo.id] }),
      "TRUMP_BID_SUITS_MUST_MATCH",
    );
    expectErrorCode(
      placeTrumpBid(state, { seat: 0, cardIds: [joker.id] }),
      "TRUMP_BID_CARDS_MUST_BE_TWOS",
    );
    expectErrorCode(
      placeTrumpBid(state, { seat: 0, cardIds: [spadeAce.id] }),
      "TRUMP_BID_CARDS_MUST_BE_TWOS",
    );
    expectErrorCode(
      placeTrumpBid(state, { seat: 0, cardIds: [spadeTwo.id, spadeTwo.id] }),
      "DUPLICATE_CARD_ID",
    );
    expectErrorCode(
      placeTrumpBid(stateWithHand(0, [spadeTwo]), { seat: 0, cardIds: [heartTwo.id] }),
      "CARD_NOT_IN_HAND",
    );
  });

  it("requires higher count and allows current highest bidder to increase without changing suit", () => {
    const deck = createDeck();
    const spadeTwos = findCards(deck, "spades", "2", 2);
    const heartTwos = findCards(deck, "hearts", "2", 2);
    const state = stateWithHand(0, [...spadeTwos, ...heartTwos]);
    const firstBid = expectOk(placeTrumpBid(state, { seat: 0, cardIds: [spadeTwos[0]?.id ?? ""] }));

    expectErrorCode(
      placeTrumpBid(firstBid.state, { seat: 0, cardIds: [spadeTwos[1]?.id ?? ""] }),
      "TRUMP_BID_NOT_HIGHER",
    );
    expectErrorCode(
      placeTrumpBid(firstBid.state, { seat: 0, cardIds: heartTwos.map((card) => card.id) }),
      "TRUMP_BID_SUIT_CANNOT_CHANGE",
    );

    const increasedBid = expectOk(
      placeTrumpBid(firstBid.state, {
        seat: 0,
        cardIds: spadeTwos.map((card) => card.id),
      }),
    );

    expect(increasedBid.highestTrumpBid).toEqual({
      seat: 0,
      suit: "spades",
      count: 2,
      cardIds: spadeTwos.map((card) => card.id),
    });
  });

  it("allows 2 cards to beat 1, rejects equal or lower count, and resets final timer", () => {
    const deck = createDeck();
    const spadeTwo = findCard(deck, "spades", "2");
    const heartTwos = findCards(deck, "hearts", "2", 2);
    const clubTwo = findCard(deck, "clubs", "2");
    const hands = createEmptyHands();
    hands[0] = [spadeTwo];
    hands[1] = heartTwos;
    hands[2] = [clubTwo];
    const state = baseRoundState({ phase: "final_trump_bidding", hands });
    const firstBid = expectOk(placeTrumpBid(state, { seat: 0, cardIds: [spadeTwo.id] }));

    expectErrorCode(
      placeTrumpBid(firstBid.state, { seat: 2, cardIds: [clubTwo.id] }),
      "TRUMP_BID_NOT_HIGHER",
    );

    const secondBid = expectOk(
      placeTrumpBid(firstBid.state, {
        seat: 1,
        cardIds: heartTwos.map((card) => card.id),
      }),
    );

    expect(secondBid.shouldResetFinalBidTimer).toBe(true);
    expect(secondBid.highestTrumpBid.count).toBe(2);
  });

  it("invalidates previous skips when a new highest trump bid is placed", () => {
    const deck = createDeck();
    const heartTwo = findCard(deck, "hearts", "2");
    const hands = createEmptyHands();
    hands[1] = [heartTwo];
    const state = baseRoundState({
      phase: "dealing",
      hands,
      trumpBiddingRound: {
        batchNumber: 1,
        cardsPerPlayerDealt: 1,
        responses: {
          0: { type: "skipped" },
          1: { type: "pending" },
          2: { type: "skipped" },
          3: { type: "pending" },
        },
      },
    });

    const bid = expectOk(placeTrumpBid(state, { seat: 1, cardIds: [heartTwo.id] })).state;

    expect(bid.trumpBiddingRound?.responses[0]).toEqual({ type: "pending" });
    expect(bid.trumpBiddingRound?.responses[1]).toEqual({
      type: "bid",
      bid: {
        seat: 1,
        suit: "hearts",
        count: 1,
        cardIds: [heartTwo.id],
      },
    });
    expect(bid.trumpBiddingRound?.responses[2]).toEqual({ type: "pending" });
    expect(bid.trumpBiddingRound?.responses[3]).toEqual({ type: "pending" });
  });

  it("locks trump immediately when a player bids four same-suit 2s", () => {
    const deck = createDeck();
    const spadeTwos = findCards(deck, "spades", "2", 4);
    const { hands, drawPile } = createHandsWithSeatCards(2, spadeTwos, 52);
    const state = baseRoundState({
      roundNumber: 1,
      phase: "final_trump_bidding",
      dealerSeat: null,
      hands,
      bottomCards: drawPile.slice(0, 8),
      drawPile: [],
      trumpBiddingRound: {
        batchNumber: 4,
        cardsPerPlayerDealt: 52,
        responses: {
          0: { type: "skipped" },
          1: { type: "pending" },
          2: { type: "pending" },
          3: { type: "pending" },
        },
      },
    });

    const bid = expectOk(
      placeTrumpBid(state, {
        seat: 2,
        cardIds: spadeTwos.map((card) => card.id),
      }),
    ).state;

    expect(bid.phase).toBe("taking_bottom");
    expect(bid.dealerSeat).toBe(2);
    expect(bid.trumpSuit).toBe("spades");
    expect(bid.trumpBiddingRound).toBeNull();
  });

  it("continues later deal batches without more bidding prompts after trump is locked by four 2s", () => {
    const deck = createDeck();
    const clubTwos = findCards(deck, "clubs", "2", 4);
    const { hands, drawPile } = createHandsWithSeatCards(0, clubTwos, 18);
    const state = baseRoundState({
      phase: "dealing",
      hands,
      drawPile,
      trumpBiddingRound: {
        batchNumber: 2,
        cardsPerPlayerDealt: 18,
        responses: {
          0: { type: "pending" },
          1: { type: "skipped" },
          2: { type: "skipped" },
          3: { type: "skipped" },
        },
      },
    });

    const locked = expectOk(
      placeTrumpBid(state, {
        seat: 0,
        cardIds: clubTwos.map((card) => card.id),
      }),
    ).state;
    const thirdBatch = expectOk(dealCards(locked));
    const fourthBatch = expectOk(dealCards(thirdBatch));

    expect(locked.phase).toBe("dealing");
    expect(locked.trumpSuit).toBe("clubs");
    expect(locked.trumpBiddingRound).toBeNull();
    expect(thirdBatch.hands[0]).toHaveLength(35);
    expect(thirdBatch.trumpBiddingRound).toBeNull();
    expect(fourthBatch.phase).toBe("taking_bottom");
    expect(fourthBatch.hands[0]).toHaveLength(52);
    expect(fourthBatch.bottomCards).toHaveLength(8);
    expect(fourthBatch.trumpBiddingRound).toBeNull();
  });

  it("treats heavenly trump as 3 twos and does not allow the bidder to increase it", () => {
    const deck = createDeck();
    const spadeTwos = findCards(deck, "spades", "2", 4);
    const heartTwos = findCards(deck, "hearts", "2", 4);
    const hands = createEmptyHands();
    hands[0] = spadeTwos;
    hands[1] = heartTwos;
    const state = baseRoundState({
      phase: "final_trump_bidding",
      hands,
      highestTrumpBid: {
        seat: 0,
        suit: "spades",
        count: 3,
        cardIds: [spadeTwos[0]?.id ?? ""],
        isHeavenly: true,
      },
    });

    expectErrorCode(
      placeTrumpBid(state, { seat: 0, cardIds: spadeTwos.map((card) => card.id) }),
      "HEAVENLY_TRUMP_BID_CANNOT_BE_RAISED",
    );
    expectErrorCode(
      placeTrumpBid(state, { seat: 1, cardIds: heartTwos.slice(0, 3).map((card) => card.id) }),
      "TRUMP_BID_NOT_HIGHER",
    );

    const overcall = expectOk(
      placeTrumpBid(state, { seat: 1, cardIds: heartTwos.map((card) => card.id) }),
    );

    expect(overcall.highestTrumpBid).toEqual({
      seat: 1,
      suit: "hearts",
      count: 4,
      cardIds: heartTwos.map((card) => card.id),
    });
  });
});

describe("final trump resolution", () => {
  it("uses highest bid suit and sets first-round dealer to bidder", () => {
    const deck = createDeck();
    const spadeTwo = findCard(deck, "spades", "2");
    const bidState = expectOk(
      placeTrumpBid(stateWithHand(2, [spadeTwo], "final_trump_bidding"), {
        seat: 2,
        cardIds: [spadeTwo.id],
      }),
    ).state;
    const resolved = expectOk(resolveFinalTrumpBidding({ ...bidState, roundNumber: 1 }));

    expect(resolved.trumpSuit).toBe("spades");
    expect(resolved.dealerSeat).toBe(2);
    expect(resolved.phase).toBe("taking_bottom");
  });

  it("preserves an already selected later-round dealer even when another player has highest bid", () => {
    const deck = createDeck();
    const clubTwo = findCard(deck, "clubs", "2");
    const bidState = expectOk(
      placeTrumpBid(
        {
          ...stateWithHand(2, [clubTwo], "final_trump_bidding"),
          roundNumber: 2,
          dealerSeat: 1,
        },
        {
          seat: 2,
          cardIds: [clubTwo.id],
        },
      ),
    ).state;
    const resolved = expectOk(resolveFinalTrumpBidding(bidState));

    expect(resolved.trumpSuit).toBe("clubs");
    expect(resolved.dealerSeat).toBe(1);
  });

  it("uses first non-joker bottom card when there is no bid", () => {
    const deck = createDeck();
    const bottomCards = [
      findCard(deck, "joker", "big_joker", 0),
      findCard(deck, "joker", "small_joker", 0),
      findCard(deck, "diamonds", "A"),
      ...findCards(deck, "spades", "4", 4),
      findCard(deck, "clubs", "K"),
    ];

    expect(expectOk(determineTrumpFromBottom(bottomCards))).toBe("diamonds");
  });

  it("uses spades only when all 8 bottom cards are jokers", () => {
    const deck = createDeck();
    const allJokers = [
      ...findCards(deck, "joker", "small_joker", 4),
      ...findCards(deck, "joker", "big_joker", 4),
    ];

    expect(expectOk(determineTrumpFromBottom(allJokers))).toBe("spades");
  });

  it("rejects invalid bottom card input", () => {
    expectErrorCode(determineTrumpFromBottom([]), "INVALID_BOTTOM_SIZE");
  });

  it("uses seat 0 as first-round dealer when no one bids", () => {
    const deck = createDeck();
    const result = expectOk(resolveFinalTrumpBidding(
      baseRoundState({
        roundNumber: 1,
        phase: "final_trump_bidding",
        dealerSeat: null,
        bottomCards: findCards(deck, "diamonds", "A", 4).concat(
          findCards(deck, "clubs", "K", 4),
        ),
      }),
    ));

    expect(result.dealerSeat).toBe(0);
    expect(result.trumpSuit).toBe("diamonds");
    expect(result.phase).toBe("taking_bottom");
  });

  it("uses seat 0 and spades when first-round bottom cards are all jokers", () => {
    const deck = createDeck();
    const result = expectOk(resolveFinalTrumpBidding(
      baseRoundState({
        roundNumber: 1,
        phase: "final_trump_bidding",
        dealerSeat: null,
        bottomCards: [
          ...findCards(deck, "joker", "small_joker", 4),
          ...findCards(deck, "joker", "big_joker", 4),
        ],
      }),
    ));

    expect(result.dealerSeat).toBe(0);
    expect(result.trumpSuit).toBe("spades");
  });
});

describe("later-round dealer selection", () => {
  it("uses the only clicked winner", () => {
    expect(
      resolveDealerSelection({
        winnerTeamSeats: [0, 2],
        clickedSeats: [2],
        random: () => 0,
      }),
    ).toBe(2);
  });

  it("randomly selects between both winners when both click or neither clicks", () => {
    expect(
      resolveDealerSelection({
        winnerTeamSeats: [0, 2],
        clickedSeats: [0, 2],
        random: () => 0.9,
      }),
    ).toBe(2);
    expect(
      resolveDealerSelection({
        winnerTeamSeats: [1, 3],
        clickedSeats: [],
        random: () => 0,
      }),
    ).toBe(1);
  });

  it("ignores losing seats and duplicate clicks", () => {
    expect(
      resolveDealerSelection({
        winnerTeamSeats: [0, 2],
        clickedSeats: [1, 2, 2],
        random: () => 0,
      }),
    ).toBe(2);
  });
});

describe("taking bottom", () => {
  it("allows only dealer to take exactly 8 bottom cards after trump is locked", () => {
    const state = dealtTakingBottomState();
    const nextState = expectOk(takeBottomCards(state, { seat: 0 }));

    expect(nextState.phase).toBe("burying_bottom");
    expect(nextState.hands[0]).toHaveLength(60);
    expect(nextState.bottomCards).toHaveLength(0);
    expect(nextState.takenBottomCards).toHaveLength(8);
  });

  it("rejects non-dealer, unlocked trump, wrong phase, bad hand size, and bad bottom size", () => {
    const state = dealtTakingBottomState();

    expectErrorCode(takeBottomCards(state, { seat: 1 }), "NOT_DEALER");
    expectErrorCode(
      takeBottomCards({ ...state, trumpSuit: null }, { seat: 0 }),
      "TRUMP_NOT_LOCKED",
    );
    expectErrorCode(
      takeBottomCards({ ...state, phase: "final_trump_bidding" }, { seat: 0 }),
      "INVALID_PHASE",
    );
    expectErrorCode(
      takeBottomCards({ ...state, bottomCards: state.bottomCards.slice(0, 7) }, { seat: 0 }),
      "INVALID_BOTTOM_SIZE",
    );
    expectErrorCode(
      takeBottomCards(
        {
          ...state,
          hands: {
            ...state.hands,
            0: state.hands[0].slice(0, 51),
          },
        },
        { seat: 0 },
      ),
      "INVALID_HAND_SIZE",
    );
  });
});

describe("burying bottom", () => {
  it("requires dealer to bury exactly 8 cards and enters playing", () => {
    const takingState = dealtTakingBottomState();
    const buryingState = expectOk(takeBottomCards(takingState, { seat: 0 }));
    const selectedCards = buryingState.hands[0].slice(0, 8);
    const playingState = expectOk(
      buryBottom(buryingState, {
        seat: 0,
        cardIds: selectedCards.map((card) => card.id),
      }),
    );

    expect(playingState.phase).toBe("playing");
    expect(playingState.hands[0]).toHaveLength(52);
    expect(playingState.bottomCards.map((card) => card.id)).toEqual(
      selectedCards.map((card) => card.id),
    );
    expect(playingState.firstLeadSeat).toBe(0);
  });

  it("rejects invalid bury attempts", () => {
    const takingState = dealtTakingBottomState();
    const buryingState = expectOk(takeBottomCards(takingState, { seat: 0 }));
    const dealerCards = buryingState.hands[0];
    const otherPlayerCard = buryingState.hands[1][0];

    expectErrorCode(
      buryBottom(buryingState, {
        seat: 1,
        cardIds: dealerCards.slice(0, 8).map((card) => card.id),
      }),
      "NOT_DEALER",
    );
    expectErrorCode(
      buryBottom(buryingState, {
        seat: 0,
        cardIds: dealerCards.slice(0, 7).map((card) => card.id),
      }),
      "INVALID_BOTTOM_SIZE",
    );
    expectErrorCode(
      buryBottom(buryingState, {
        seat: 0,
        cardIds: Array(8).fill(dealerCards[0]?.id ?? ""),
      }),
      "DUPLICATE_CARD_ID",
    );
    expectErrorCode(
      buryBottom(buryingState, {
        seat: 0,
        cardIds: [
          ...dealerCards.slice(0, 7).map((card) => card.id),
          otherPlayerCard?.id ?? "",
        ],
      }),
      "CARD_NOT_IN_HAND",
    );
    expectErrorCode(
      buryBottom(
        {
          ...buryingState,
          hands: {
            ...buryingState.hands,
            0: dealerCards.slice(0, 59),
          },
        },
        {
          seat: 0,
          cardIds: dealerCards.slice(0, 8).map((card) => card.id),
        },
      ),
      "INVALID_HAND_SIZE",
    );
  });
});
