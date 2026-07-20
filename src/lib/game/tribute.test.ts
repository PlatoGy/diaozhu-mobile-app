import { describe, expect, it } from "vitest";

import { createDeck } from "./deck";
import { createInitialPlayerPrivileges } from "./privileges";
import { createEmptyHands } from "./round";
import { allocateTributes, createTributeGivingTasks } from "./tribute-allocation";
import {
  getHighestTributeCandidates,
  getRequiredTributeCandidateLayers,
  getReturnTributeOptions,
  validateTributeSelectionSequence,
} from "./tribute-candidates";
import { enterTributePhase, submitReturnTribute, submitTribute } from "./tribute";
import { getPreviousSeat } from "./teams";
import type {
  Card,
  CardRank,
  GameActionResult,
  OriginalSuit,
  RoundState,
  Seat,
  SeatHands,
  StandardSuit,
  TributeGivingTask,
  TributeReturnTask,
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

function findCards(originalSuit: OriginalSuit, rank: CardRank, count: number): Card[] {
  const cards = createDeck()
    .filter((card) => card.originalSuit === originalSuit && card.rank === rank)
    .slice(0, count);

  if (cards.length !== count) {
    throw new Error(`Missing ${count} cards for ${originalSuit}-${rank}`);
  }

  return cards;
}

function makeHands(
  overrides: Partial<Record<Seat, readonly Card[]>>,
  forbiddenFillerIds: ReadonlySet<string> = new Set<string>(),
): SeatHands {
  const hands = createEmptyHands();
  const usedIds = new Set<string>();

  for (const seat of [0, 1, 2, 3] as const) {
    const cards = overrides[seat] ?? [];
    hands[seat] = [...cards];
    cards.forEach((card) => usedIds.add(card.id));
  }

  const deck = createDeck();

  for (const seat of [0, 1, 2, 3] as const) {
    for (const card of deck) {
      if (hands[seat].length >= 52) {
        break;
      }

      if (!usedIds.has(card.id) && !forbiddenFillerIds.has(card.id)) {
        hands[seat].push(card);
        usedIds.add(card.id);
      }
    }
  }

  return hands;
}

function bottomCards(): Card[] {
  return createDeck().filter((card) => card.rank === "4").slice(0, 8);
}

function baseRoundState(overrides: Partial<RoundState> = {}): RoundState {
  return {
    roundNumber: 2,
    phase: "tribute",
    dealerSeat: 0,
    trumpSuit: TRUMP_SUIT,
    hands: makeHands({}),
    bottomCards: bottomCards(),
    drawPile: [],
    dealOrder: [],
    highestTrumpBid: null,
    heavenlyTrumpPrompt: null,
    previousWinnerTeam: "team_0_2",
    playerPrivileges: createInitialPlayerPrivileges(),
    currentTrick: null,
    defenderScore: 0,
    trickHistory: [],
    roundResult: null,
    tributeState: null,
    takenBottomCards: [],
    firstLeadSeat: null,
    ...overrides,
  };
}

function getGivingTask(state: RoundState, giverSeat: Seat): TributeGivingTask {
  const task = state.tributeState?.givingTasks.find(
    (candidate) => candidate.giverSeat === giverSeat,
  );

  if (!task) {
    throw new Error(`Missing giving task for ${giverSeat}`);
  }

  return task;
}

function getReturnTask(state: RoundState, returnerSeat: Seat): TributeReturnTask {
  const task = state.tributeState?.returnTasks.find(
    (candidate) => candidate.returnerSeat === returnerSeat,
  );

  if (!task) {
    throw new Error(`Missing return task for ${returnerSeat}`);
  }

  return task;
}

function cardIds(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id);
}

describe("tribute allocation and seats", () => {
  it("allocates odd tributes with the dealer partner receiving the extra one", () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 1],
      [2, 1, 1],
      [3, 1, 2],
      [4, 2, 2],
      [5, 2, 3],
      [7, 3, 4],
    ];

    for (const [total, dealerReceives, dealerPartnerReceives] of cases) {
      expect(expectOk(allocateTributes(total))).toEqual({
        dealerReceives,
        dealerPartnerReceives,
      });
    }
  });

  it("maps previous seats and creates giving tasks from next player to receiver", () => {
    expect(getPreviousSeat(0)).toBe(3);
    expect(getPreviousSeat(1)).toBe(0);
    expect(getPreviousSeat(2)).toBe(1);
    expect(getPreviousSeat(3)).toBe(2);

    expect(expectOk(createTributeGivingTasks(3, 0))).toMatchObject([
      { giverSeat: 1, receiverSeat: 0, requiredCount: 1 },
      { giverSeat: 3, receiverSeat: 2, requiredCount: 2 },
    ]);
    expect(expectOk(createTributeGivingTasks(1, 1))).toMatchObject([
      { giverSeat: 0, receiverSeat: 3, requiredCount: 1 },
    ]);
  });
});

describe("tribute candidates", () => {
  it("returns all highest tribute candidates by current trump strength", () => {
    const trumpFive = findCards("hearts", "5", 2);
    const bigJokers = findCards("joker", "big_joker", 2);
    const smallJoker = findCards("joker", "small_joker", 1);
    const offFive = findCards("spades", "5", 1);
    const trumpThree = findCards("hearts", "3", 1);
    const hand = [bigJokers[0]!, trumpFive[0]!, smallJoker[0]!, offFive[0]!, trumpThree[0]!, trumpFive[1]!];

    expect(getHighestTributeCandidates(hand, TRUMP_SUIT).map((card) => card.id)).toEqual([
      trumpFive[0]!.id,
      trumpFive[1]!.id,
    ]);
    expect(getHighestTributeCandidates([bigJokers[0]!, smallJoker[0]!, offFive[0]!], TRUMP_SUIT)).toEqual([
      bigJokers[0],
    ]);
    expect(getHighestTributeCandidates([smallJoker[0]!, offFive[0]!, trumpThree[0]!], TRUMP_SUIT)).toEqual([
      smallJoker[0],
    ]);
    expect(getHighestTributeCandidates([offFive[0]!, trumpThree[0]!], TRUMP_SUIT)).toEqual([
      offFive[0],
    ]);
    expect(hand).toHaveLength(6);
  });

  it("validates multi-card tribute by recalculating highest cards after each selected card", () => {
    const trumpFive = findCards("hearts", "5", 1);
    const bigJokers = findCards("joker", "big_joker", 2);
    const hand = [...trumpFive, ...bigJokers, ...findCards("spades", "A", 1)];
    const layers = expectOk(getRequiredTributeCandidateLayers(hand, 2, TRUMP_SUIT));

    expect(layers[0]?.candidates.map((card) => card.id)).toEqual(cardIds(trumpFive));
    expectErrorCode(
      validateTributeSelectionSequence(hand, cardIds(bigJokers), 2, TRUMP_SUIT),
      "CARD_NOT_HIGHEST",
    );
    expect(
      validateTributeSelectionSequence(
        hand,
        [trumpFive[0]!.id, bigJokers[1]!.id],
        2,
        TRUMP_SUIT,
      ).ok,
    ).toBe(true);
  });
});

describe("tribute submission", () => {
  it("submits a single highest tribute card and transfers the entity", () => {
    const trumpFive = findCards("hearts", "5", 1);
    const state = expectOk(
      enterTributePhase(
        baseRoundState({
          hands: makeHands({ 1: trumpFive }, new Set(findCards("hearts", "5", 4).slice(1).map((card) => card.id))),
        }),
        { totalTributes: 2 },
      ),
    );
    const task = getGivingTask(state, 1);
    const nextState = expectOk(
      submitTribute(state, {
        seat: 1,
        taskId: task.id,
        cardIds: cardIds(trumpFive),
      }),
    );

    expect(nextState.hands[1].some((card) => card.id === trumpFive[0]!.id)).toBe(false);
    expect(nextState.hands[0].some((card) => card.id === trumpFive[0]!.id)).toBe(true);
    expect(getGivingTask(nextState, 1).status).toBe("completed");
    expect(state.hands[1].some((card) => card.id === trumpFive[0]!.id)).toBe(true);
  });

  it("rejects non-highest cards, duplicate ids, cards outside hand, wrong giver, and repeated submit", () => {
    const trumpFive = findCards("hearts", "5", 1);
    const spadeAce = findCards("spades", "A", 1);
    const state = expectOk(
      enterTributePhase(
        baseRoundState({
          hands: makeHands({ 1: [...trumpFive, ...spadeAce] }, new Set(findCards("hearts", "5", 4).slice(1).map((card) => card.id))),
        }),
        { totalTributes: 2 },
      ),
    );
    const task = getGivingTask(state, 1);

    expectErrorCode(
      submitTribute(state, { seat: 1, taskId: task.id, cardIds: cardIds(spadeAce) }),
      "CARD_NOT_HIGHEST",
    );
    expectErrorCode(
      submitTribute(state, { seat: 1, taskId: task.id, cardIds: [trumpFive[0]!.id, trumpFive[0]!.id] }),
      "INVALID_CARD_COUNT",
    );
    expectErrorCode(
      submitTribute(state, { seat: 1, taskId: task.id, cardIds: [findCards("clubs", "A", 1)[0]!.id] }),
      "CARD_NOT_IN_HAND",
    );
    expectErrorCode(
      submitTribute(state, { seat: 2, taskId: task.id, cardIds: cardIds(trumpFive) }),
      "NOT_TRIBUTE_GIVER",
    );

    const afterFirst = expectOk(
      submitTribute(state, { seat: 1, taskId: task.id, cardIds: cardIds(trumpFive) }),
    );
    expectErrorCode(
      submitTribute(afterFirst, { seat: 1, taskId: task.id, cardIds: cardIds(spadeAce) }),
      "TRIBUTE_TASK_ALREADY_COMPLETED",
    );
  });

  it("enters returning after all giving tasks are complete and creates matching return tasks", () => {
    const seat1Card = findCards("hearts", "5", 1);
    const seat3Cards = findCards("joker", "big_joker", 2);
    const forbidden = new Set([
      ...findCards("hearts", "5", 4).slice(1).map((card) => card.id),
      ...findCards("joker", "big_joker", 4).slice(2).map((card) => card.id),
    ]);
    const state = expectOk(
      enterTributePhase(
        baseRoundState({ hands: makeHands({ 1: seat1Card, 3: seat3Cards }, forbidden) }),
        { totalTributes: 3 },
      ),
    );
    const afterSeat1 = expectOk(
      submitTribute(state, {
        seat: 1,
        taskId: getGivingTask(state, 1).id,
        cardIds: cardIds(seat1Card),
      }),
    );

    expect(afterSeat1.tributeState?.status).toBe("giving");

    const afterSeat3 = expectOk(
      submitTribute(afterSeat1, {
        seat: 3,
        taskId: getGivingTask(afterSeat1, 3).id,
        cardIds: cardIds(seat3Cards),
      }),
    );

    expect(afterSeat3.tributeState?.status).toBe("returning");
    expect(afterSeat3.tributeState?.returnTasks).toMatchObject([
      {
        returnerSeat: 0,
        receiverSeat: 1,
        requiredCount: 1,
        receivedTributeCardIds: cardIds(seat1Card),
      },
      {
        returnerSeat: 2,
        receiverSeat: 3,
        requiredCount: 2,
        receivedTributeCardIds: cardIds(seat3Cards),
      },
    ]);
  });
});

describe("return tribute", () => {
  it("uses trump-only return options when enough trumps exist and all-hand options when trumps are short", () => {
    const trumps = [...findCards("hearts", "4", 2), ...findCards("spades", "2", 1)];
    const offSuit = findCards("clubs", "A", 2);
    const richHand = [...trumps, ...offSuit];
    const shortTrumpHand = [trumps[0]!, ...offSuit];

    expect(getReturnTributeOptions(richHand, 2, TRUMP_SUIT).map((card) => card.id)).toEqual(
      trumps.map((card) => card.id),
    );
    expect(getReturnTributeOptions(shortTrumpHand, 2, TRUMP_SUIT).map((card) => card.id)).toEqual(
      shortTrumpHand.map((card) => card.id),
    );
  });

  it("allows returning the exact tribute card when it is in the current option range", () => {
    const tributeCard = findCards("hearts", "5", 1);
    const state = expectOk(
      enterTributePhase(
        baseRoundState({
          hands: makeHands({ 3: tributeCard }, new Set(findCards("hearts", "5", 4).slice(1).map((card) => card.id))),
        }),
        { totalTributes: 1 },
      ),
    );
    const afterGive = expectOk(
      submitTribute(state, {
        seat: 3,
        taskId: getGivingTask(state, 3).id,
        cardIds: cardIds(tributeCard),
      }),
    );
    const returnTask = getReturnTask(afterGive, 2);
    const receivedCardId = returnTask.receivedTributeCardIds[0]!;
    const afterReturn = expectOk(
      submitReturnTribute(afterGive, {
        seat: 2,
        taskId: returnTask.id,
        cardIds: [receivedCardId],
      }),
    );

    expect(afterReturn.hands[3].some((card) => card.id === receivedCardId)).toBe(true);
  });

  it("rejects invalid return submissions and completes the tribute phase after all returns", () => {
    const giverCard = findCards("hearts", "5", 1);
    const state = expectOk(
      enterTributePhase(
        baseRoundState({
          hands: makeHands({ 3: giverCard }, new Set(findCards("hearts", "5", 4).slice(1).map((card) => card.id))),
        }),
        { totalTributes: 1 },
      ),
    );
    const afterGive = expectOk(
      submitTribute(state, {
        seat: 3,
        taskId: getGivingTask(state, 3).id,
        cardIds: cardIds(giverCard),
      }),
    );
    const returnTask = getReturnTask(afterGive, 2);
    const offSuitCard = afterGive.hands[2].find((card) => card.originalSuit === "clubs" && card.rank === "A");
    const returnCard = afterGive.hands[2].find((card) => card.originalSuit === "hearts");

    if (!offSuitCard || !returnCard) {
      throw new Error("Missing return test cards");
    }

    expectErrorCode(
      submitReturnTribute(afterGive, { seat: 3, taskId: returnTask.id, cardIds: [returnCard.id] }),
      "NOT_RETURNER",
    );
    expectErrorCode(
      submitReturnTribute(afterGive, { seat: 2, taskId: returnTask.id, cardIds: [offSuitCard.id] }),
      "INVALID_RETURN_OPTION",
    );

    const afterReturn = expectOk(
      submitReturnTribute(afterGive, {
        seat: 2,
        taskId: returnTask.id,
        cardIds: [returnCard.id],
      }),
    );

    expect(afterReturn.phase).toBe("taking_bottom");
    expect(afterReturn.tributeState?.status).toBe("completed");
    expect(afterReturn.bottomCards).toHaveLength(8);
    expect([0, 1, 2, 3].map((seat) => afterReturn.hands[seat as Seat].length)).toEqual([
      52, 52, 52, 52,
    ]);
  });
});

describe("tribute phase setup", () => {
  it("skips player actions and enters taking_bottom for zero tributes", () => {
    const state = expectOk(enterTributePhase(baseRoundState(), { totalTributes: 0 }));

    expect(state.phase).toBe("taking_bottom");
    expect(state.tributeState).toMatchObject({
      totalTributes: 0,
      givingTasks: [],
      returnTasks: [],
      status: "completed",
    });
  });

  it("rejects invalid setup and insufficient tribute cards", () => {
    expectErrorCode(enterTributePhase({ ...baseRoundState(), phase: "dealing" }, { totalTributes: 1 }), "INVALID_PHASE");
    expectErrorCode(enterTributePhase({ ...baseRoundState(), dealerSeat: null }, { totalTributes: 1 }), "DEALER_NOT_SET");
    expectErrorCode(enterTributePhase({ ...baseRoundState(), trumpSuit: null }, { totalTributes: 1 }), "TRUMP_NOT_SET");
    expectErrorCode(enterTributePhase({ ...baseRoundState(), hands: createEmptyHands() }, { totalTributes: 1 }), "INVALID_HAND_SIZE");
    expectErrorCode(enterTributePhase(baseRoundState(), { totalTributes: -1 }), "INVALID_TRIBUTE_COUNT");
    expectErrorCode(enterTributePhase(baseRoundState(), { totalTributes: 200 }), "INSUFFICIENT_CARDS_FOR_TRIBUTE");
  });

  it("keeps the phase in tribute while return tasks are still incomplete", () => {
    const seat1Card = findCards("hearts", "5", 1);
    const seat3Cards = findCards("joker", "big_joker", 2);
    const state = expectOk(
      enterTributePhase(
        baseRoundState({
          hands: makeHands(
            { 1: seat1Card, 3: seat3Cards },
            new Set([
              ...findCards("hearts", "5", 4).slice(1).map((card) => card.id),
              ...findCards("joker", "big_joker", 4).slice(2).map((card) => card.id),
            ]),
          ),
        }),
        { totalTributes: 3 },
      ),
    );
    const afterSeat1Give = expectOk(
      submitTribute(state, { seat: 1, taskId: getGivingTask(state, 1).id, cardIds: cardIds(seat1Card) }),
    );
    const afterAllGive = expectOk(
      submitTribute(afterSeat1Give, {
        seat: 3,
        taskId: getGivingTask(afterSeat1Give, 3).id,
        cardIds: cardIds(seat3Cards),
      }),
    );
    const returnTask = getReturnTask(afterAllGive, 0);
    const returnCard = afterAllGive.hands[0].find((card) => card.originalSuit === "hearts");

    if (!returnCard) {
      throw new Error("Missing return card");
    }

    const afterOneReturn = expectOk(
      submitReturnTribute(afterAllGive, {
        seat: 0,
        taskId: returnTask.id,
        cardIds: [returnCard.id],
      }),
    );

    expect(afterOneReturn.phase).toBe("tribute");
    expect(afterOneReturn.tributeState?.status).toBe("returning");
    expectErrorCode(
      submitReturnTribute(afterOneReturn, {
        seat: 0,
        taskId: returnTask.id,
        cardIds: [returnCard.id],
      }),
      "RETURN_TASK_ALREADY_COMPLETED",
    );
  });
});
