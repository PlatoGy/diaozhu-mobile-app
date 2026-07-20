import { describe, expect, it } from "vitest";

import { STANDARD_SUITS } from "./constants";
import { createDeck } from "./deck";
import { createInitialGameState } from "./initial-state";
import { createPlayerGameView } from "./player-view";
import { createEmptyHands, startRound } from "./round";
import { executeGameAction } from "./game-actions";
import { createTrick, getNextSeat } from "./trick";
import {
  getRequiredTributeCandidateLayers,
  getReturnTributeOptions,
} from "./tribute-candidates";
import type {
  GameActionStore,
  GameActionStoreInput,
  GameActionStoreResult,
} from "./game-action-store";
import type { ResolvedPlayer } from "./player-auth";
import type {
  Card,
  RoundResult,
  RoundState,
  Seat,
  ServerGameState,
  StandardRank,
  StandardSuit,
  Team,
} from "./types";

function expectOk<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) {
    throw new Error("Expected ok result");
  }

  return result as Extract<T, { ok: true }>;
}

class MemoryGameActionStore implements GameActionStore {
  stateVersion = 0;
  currentState: ServerGameState;
  requests = new Map<string, GameActionStoreResult>();

  constructor(initialState: ServerGameState = createInitialGameState()) {
    this.currentState = initialState;
  }

  async execute(input: GameActionStoreInput): Promise<GameActionStoreResult> {
    const existing = this.requests.get(input.requestId);

    if (existing) {
      return existing.ok
        ? {
            ...existing,
            duplicate: true,
          }
        : existing;
    }

    const canMergeReadyAction =
      input.actionType === "SET_READY" && input.expectedVersion <= this.stateVersion;

    if (input.expectedVersion !== this.stateVersion && !canMergeReadyAction) {
      return {
        ok: false,
        error: {
          code: "STATE_VERSION_CONFLICT",
          message: "Version conflict",
        },
      };
    }

    const result = await input.execute({
      roomId: input.roomId,
      status: "waiting",
      roundNumber: this.currentState.roundNumber,
      stateVersion: this.stateVersion,
      currentState: this.currentState,
      players: [
        { seat: 0, nickname: "A" },
        { seat: 1, nickname: "B" },
        { seat: 2, nickname: "C" },
        { seat: 3, nickname: "D" },
      ],
    });

    if (!result.ok) {
      return result;
    }

    if (!("execution" in result)) {
      return result;
    }

    this.stateVersion += 1;
    this.currentState = result.execution.nextState;

    const stored: GameActionStoreResult = {
      ok: true,
      view: {
        ...result.execution.view,
        stateVersion: this.stateVersion,
      },
      duplicate: false,
    };
    this.requests.set(input.requestId, stored);

    return stored;
  }
}

const player: ResolvedPlayer = {
  playerId: "00000000-0000-0000-0000-000000000001",
  roomId: "00000000-0000-0000-0000-000000000010",
  seat: 0,
  nickname: "A",
};

function playerForSeat(seat: Seat): ResolvedPlayer {
  return {
    ...player,
    playerId: `00000000-0000-0000-0000-00000000000${seat + 1}`,
    seat,
    nickname: String.fromCharCode("A".charCodeAt(0) + seat),
  };
}

function stateWithRound(roundState: RoundState): ServerGameState {
  return {
    ...createInitialGameState(),
    phase: roundState.phase,
    currentSeat: null,
    roundNumber: roundState.roundNumber,
    roundState,
  };
}

function orderedSeatsFrom(leaderSeat: Seat): [Seat, Seat, Seat, Seat] {
  const second = getNextSeat(leaderSeat);
  const third = getNextSeat(second);
  const fourth = getNextSeat(third);

  return [leaderSeat, second, third, fourth];
}

function findCard(suit: StandardSuit, rank: StandardRank): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.deckIndex === 0 &&
      candidate.originalSuit === suit &&
      candidate.rank === rank,
  );

  if (!card) {
    throw new Error(`Missing test card ${suit} ${rank}`);
  }

  return card;
}

function findDeckCard(deckIndex: Card["deckIndex"], suit: StandardSuit, rank: StandardRank): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.deckIndex === deckIndex &&
      candidate.originalSuit === suit &&
      candidate.rank === rank,
  );

  if (!card) {
    throw new Error(`Missing test card ${deckIndex} ${suit} ${rank}`);
  }

  return card;
}

function nonPointBottomCards(): Card[] {
  return [
    findDeckCard(1, "diamonds", "4"),
    findDeckCard(1, "diamonds", "6"),
    findDeckCard(1, "diamonds", "7"),
    findDeckCard(1, "diamonds", "8"),
    findDeckCard(1, "diamonds", "9"),
    findDeckCard(1, "diamonds", "J"),
    findDeckCard(1, "diamonds", "Q"),
    findDeckCard(1, "diamonds", "A"),
  ];
}

function selectTributeCardIds(
  hand: readonly Card[],
  requiredCount: number,
  trumpSuit: StandardSuit,
): string[] {
  const layers = getRequiredTributeCandidateLayers(hand, requiredCount, trumpSuit);

  if (!layers.ok) {
    throw new Error("Expected tribute candidates");
  }

  return layers.value.map((layer) => {
    const candidate = layer.candidates[0];

    if (!candidate) {
      throw new Error("Expected tribute candidate card");
    }

    return candidate.id;
  });
}

function selectReturnCardIds(
  hand: readonly Card[],
  requiredCount: number,
  trumpSuit: StandardSuit,
): string[] {
  const options = getReturnTributeOptions(hand, requiredCount, trumpSuit);

  if (options.length < requiredCount) {
    throw new Error("Expected return tribute options");
  }

  return options.slice(0, requiredCount).map((card) => card.id);
}

function roundResultFixture(
  tributeCount: number,
  winningTeam: Team,
  dealerSeat: Seat = 0,
): RoundResult {
  const losingTeam = winningTeam === "team_0_2" ? "team_1_3" : "team_0_2";

  return {
    roundNumber: 1,
    dealerSeat,
    dealerTeam: dealerSeat === 0 || dealerSeat === 2 ? "team_0_2" : "team_1_3",
    defenderTeam: dealerSeat === 0 || dealerSeat === 2 ? "team_1_3" : "team_0_2",
    winningSide: winningTeam === (dealerSeat === 0 || dealerSeat === 2 ? "team_0_2" : "team_1_3")
      ? "dealer_team"
      : "defender_team",
    winningTeam,
    losingTeam,
    defenderScore: tributeCount === 0 ? 130 : 5,
    tributeCount,
    lastTrickWinnerSeat: dealerSeat,
    defendersWonLastTrick: false,
    bottomPoints: 0,
    lastTrickPoints: 0,
    lastTrickMultiplier: 1,
    lastTrickScoreAdded: 0,
    totalTricks: 1,
  };
}

function roundFinishedState(tributeCount: number, winningTeam: Team = "team_0_2"): ServerGameState {
  const roundState = roundWithHands();

  return stateWithRound({
    ...roundState,
    phase: "round_finished",
    roundResult: roundResultFixture(tributeCount, winningTeam),
  });
}

function roundWithHands(): RoundState {
  const started = startRound({
    roundNumber: 1,
    dealerSeat: 0,
    random: () => 0.5,
  });

  if (!started.ok) {
    throw new Error("Failed to start round");
  }

  const hands = createEmptyHands();
  const deck = createDeck();
  hands[0] = deck.slice(0, 2);
  hands[1] = deck.slice(2, 5);
  hands[2] = deck.slice(5, 9);
  hands[3] = deck.slice(9, 14);

  return {
    ...started.value,
    hands,
  };
}

async function skipHeavenlyTrumpIfPrompt(
  store: MemoryGameActionStore,
  expectedVersion: number,
): Promise<number> {
  const prompt = store.currentState.roundState?.heavenlyTrumpPrompt;

  if (store.currentState.phase !== "heavenly_trump_bidding" || !prompt || prompt.resolved) {
    return expectedVersion;
  }

  expectOk(
    await executeGameAction(
      {
        roomId: player.roomId,
        player: playerForSeat(prompt.seat),
        requestId: `skip-heavenly-${expectedVersion}`,
        expectedVersion,
        actionType: "RESOLVE_HEAVENLY_TRUMP",
        payload: { accept: false },
      },
      store,
    ),
  );

  return expectedVersion + 1;
}

async function skipPendingTrumpBidsForCurrentRound(
  store: MemoryGameActionStore,
  expectedVersion: number,
): Promise<number> {
  for (const seat of [0, 1, 2, 3] as const satisfies readonly Seat[]) {
    const round = store.currentState.roundState;
    const response = round?.trumpBiddingRound?.responses[seat];

    if (
      !round ||
      (round.phase !== "dealing" && round.phase !== "final_trump_bidding") ||
      response?.type !== "pending"
    ) {
      continue;
    }

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(seat),
          requestId: `skip-trump-bid-${expectedVersion}-${seat}`,
          expectedVersion,
          actionType: "SKIP_TRUMP_BID",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;
  }

  return expectedVersion;
}

async function advanceDealingToFinalTrumpBidding(
  store: MemoryGameActionStore,
  expectedVersion: number,
): Promise<number> {
  for (let guard = 0; guard < 16; guard += 1) {
    expectedVersion = await skipHeavenlyTrumpIfPrompt(store, expectedVersion);

    const round = store.currentState.roundState;

    if (!round) {
      throw new Error("Expected round state while dealing");
    }

    if (round.phase === "final_trump_bidding") {
      return expectedVersion;
    }

    if (round.phase === "dealing" && round.trumpBiddingRound) {
      expectedVersion = await skipPendingTrumpBidsForCurrentRound(store, expectedVersion);
      continue;
    }

    if (round.phase === "dealing") {
      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player,
            requestId: `advance-deal-${expectedVersion}`,
            expectedVersion,
            actionType: "DEAL_CARDS",
            payload: {},
          },
          store,
        ),
      );
      expectedVersion += 1;
      continue;
    }

    break;
  }

  throw new Error(`Expected final trump bidding, got ${store.currentState.roundState?.phase}`);
}

describe("game action service", () => {
  it("increments stateVersion once and returns the original result for duplicate requestId", async () => {
    const store = new MemoryGameActionStore();
    const first = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "request-start-round",
          expectedVersion: 0,
          actionType: "START_ROUND",
          payload: { dealerSeat: 0 },
        },
        store,
      ),
    );
    const duplicate = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "request-start-round",
          expectedVersion: 0,
          actionType: "START_ROUND",
          payload: { dealerSeat: 0 },
        },
        store,
      ),
    );

    expect(first.view.stateVersion).toBe(1);
    expect(duplicate.view).toEqual(first.view);
    expect(duplicate.duplicate).toBe(true);
    expect(store.stateVersion).toBe(1);
  });

  it("rejects stale expectedVersion without overwriting current state", async () => {
    const store = new MemoryGameActionStore();

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "request-version-first",
          expectedVersion: 0,
          actionType: "START_ROUND",
          payload: { dealerSeat: 0 },
        },
        store,
      ),
    );

    const stale = await executeGameAction(
      {
        roomId: player.roomId,
        player,
        requestId: "request-version-second",
        expectedVersion: 0,
        actionType: "DEAL_CARDS",
        payload: {},
      },
      store,
    );

    expect(stale.ok).toBe(false);
    expect(stale.ok ? null : stale.error.code).toBe("STATE_VERSION_CONFLICT");
    expect(store.stateVersion).toBe(1);
  });

  it("merges stale ready actions because player readiness is independent", async () => {
    const store = new MemoryGameActionStore();

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "ready-merge-p1",
          expectedVersion: 0,
          actionType: "SET_READY",
          payload: { ready: true },
        },
        store,
      ),
    );

    const secondReady = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(1),
          requestId: "ready-merge-p2",
          expectedVersion: 0,
          actionType: "SET_READY",
          payload: { ready: true },
        },
        store,
      ),
    );

    expect(secondReady.view.readyState[0]).toBe(true);
    expect(secondReady.view.readyState[1]).toBe(true);
    expect(store.stateVersion).toBe(2);
  });

  it("tracks ready state and auto-starts the first dealt round when all seats are ready", async () => {
    const store = new MemoryGameActionStore();
    let expectedVersion = 0;

    for (const seat of [0, 1, 2] as const satisfies readonly Seat[]) {
      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player: playerForSeat(seat),
            requestId: `ready-${seat}`,
            expectedVersion,
            actionType: "SET_READY",
            payload: { ready: true },
            random: () => 0.5,
          },
          store,
        ),
      );
      expectedVersion += 1;
    }

    expect(store.currentState.phase).toBe("waiting_for_players");
    expect(store.currentState.roundState).toBeUndefined();

    const fourthReady = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(3),
          requestId: "ready-3",
          expectedVersion,
          actionType: "SET_READY",
          payload: { ready: true },
          random: () => 0.5,
        },
        store,
      ),
    );
    expectedVersion += 1;

    expect(fourthReady.view.phase).toBe("heavenly_trump_bidding");
    expect(fourthReady.view.heavenlyTrumpPrompt).not.toBeNull();
    expect(store.currentState.readyState).toEqual({
      0: true,
      1: true,
      2: true,
      3: true,
    });
    expect(store.currentState.roundState?.hands[0]).toHaveLength(1);
    expect(store.currentState.roundState?.bottomCards).toHaveLength(0);

    const duplicate = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(3),
          requestId: "ready-3",
          expectedVersion: expectedVersion - 1,
          actionType: "SET_READY",
          payload: { ready: true },
          random: () => 0,
        },
        store,
      ),
    );

    expect(duplicate.duplicate).toBe(true);
    expect(store.stateVersion).toBe(expectedVersion);

    const cancelAfterStart = await executeGameAction(
      {
        roomId: player.roomId,
        player,
        requestId: "ready-cancel-after-start",
        expectedVersion,
        actionType: "SET_READY",
        payload: { ready: false },
      },
      store,
    );

    expect(cancelAfterStart.ok).toBe(false);
    expect(cancelAfterStart.ok ? null : cancelAfterStart.error.code).toBe("INVALID_ACTION");
  });

  it("lets the heavenly trump candidate accept the prompt through the action API", async () => {
    const store = new MemoryGameActionStore();
    let expectedVersion = 0;

    for (const seat of [0, 1, 2, 3] as const) {
      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player: playerForSeat(seat),
            requestId: `heaven-ready-${seat}`,
            expectedVersion,
            actionType: "SET_READY",
            payload: { ready: true },
            random: () => 0.5,
          },
          store,
        ),
      );
      expectedVersion += 1;
    }

    const prompt = store.currentState.roundState?.heavenlyTrumpPrompt;

    if (!prompt) {
      throw new Error("Expected heavenly trump prompt");
    }

    const result = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(prompt.seat),
          requestId: "accept-heavenly-trump",
          expectedVersion,
          actionType: "RESOLVE_HEAVENLY_TRUMP",
          payload: { accept: true },
        },
        store,
      ),
    );

    expect(result.view.phase).toBe("dealing");
    expect(result.view.highestTrumpBid).toEqual({
      seat: prompt.seat,
      suit: prompt.suit,
      count: 3,
      cardIds: [prompt.cardId],
      isHeavenly: true,
    });
  });

  it("does not trust client seat and uses the resolved player seat for trump bidding", async () => {
    const roundState = roundWithHands();
    const spadeTwo = createDeck().find(
      (card) => card.originalSuit === "spades" && card.rank === "2",
    );

    if (!spadeTwo) {
      throw new Error("Missing spade two");
    }

    const hands = createEmptyHands();
    hands[0] = [spadeTwo];
    hands[1] = [];
    hands[2] = [];
    hands[3] = [];

    const store = new MemoryGameActionStore(
      stateWithRound({
        ...roundState,
        phase: "dealing",
        hands,
      }),
    );
    const result = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "request-trump-bid",
          expectedVersion: 0,
          actionType: "PLACE_TRUMP_BID",
          payload: { seat: 1, cardIds: [spadeTwo.id] },
        },
        store,
      ),
    );

    expect(result.view.highestTrumpBid).toEqual({
      seat: 0,
      suit: "spades",
      count: 1,
      cardIds: [spadeTwo.id],
    });
  });

  it("runs core server actions through final trick auto-resolution", async () => {
    const store = new MemoryGameActionStore();
    let expectedVersion = 0;

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "flow-start-round",
          expectedVersion,
          actionType: "START_ROUND",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "flow-deal-cards",
          expectedVersion,
          actionType: "DEAL_CARDS",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;
    expectedVersion = await advanceDealingToFinalTrumpBidding(store, expectedVersion);

    const dealtRound = store.currentState.roundState;

    if (!dealtRound) {
      throw new Error("Expected dealt round state");
    }

    const bidSeat = ([0, 1, 2, 3] as const).find((seat) =>
      dealtRound.hands[seat].some(
        (card) => card.rank === "2" && card.originalSuit !== "joker",
      ),
    );

    if (bidSeat === undefined) {
      throw new Error("Expected at least one dealt standard-suit 2");
    }

    const bidCard = dealtRound.hands[bidSeat].find(
      (card) => card.rank === "2" && card.originalSuit !== "joker",
    );

    if (!bidCard || bidCard.originalSuit === "joker") {
      throw new Error("Expected bid card");
    }

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(bidSeat),
          requestId: "flow-place-trump-bid",
          expectedVersion,
          actionType: "PLACE_TRUMP_BID",
          payload: { suit: "diamonds", count: 4, seat: getNextSeat(bidSeat), cardIds: [bidCard.id] },
        },
        store,
      ),
    );
    expectedVersion += 1;

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "flow-resolve-trump",
          expectedVersion,
          actionType: "RESOLVE_TRUMP",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;

    expect(store.currentState.roundState?.dealerSeat).toBe(bidSeat);
    expect(store.currentState.roundState?.trumpSuit).toBe(bidCard.originalSuit);
    expect(store.currentState.roundState?.phase).toBe("taking_bottom");

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(bidSeat),
          requestId: "flow-take-bottom",
          expectedVersion,
          actionType: "TAKE_BOTTOM",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;

    const buryingRound = store.currentState.roundState;

    if (!buryingRound) {
      throw new Error("Expected burying round state");
    }

    expect(buryingRound.hands[bidSeat]).toHaveLength(60);

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(bidSeat),
          requestId: "flow-bury-bottom",
          expectedVersion,
          actionType: "BURY_BOTTOM",
          payload: { cardIds: buryingRound.hands[bidSeat].slice(0, 8).map((card) => card.id) },
        },
        store,
      ),
    );
    expectedVersion += 1;

    const playingRound = store.currentState.roundState;

    if (!playingRound?.trumpSuit || playingRound.dealerSeat === null) {
      throw new Error("Expected playing round with trump and dealer");
    }

    expect(playingRound.phase).toBe("playing");
    expect(playingRound.hands[bidSeat]).toHaveLength(52);
    expect(playingRound.currentTrick?.leaderSeat).toBe(bidSeat);

    const leadSuit = STANDARD_SUITS.find((suit) => suit !== playingRound.trumpSuit);

    if (!leadSuit) {
      throw new Error("Expected non-trump suit");
    }

    const playOrder = orderedSeatsFrom(playingRound.dealerSeat);
    const ranks = ["6", "7", "8", "9"] as const satisfies readonly StandardRank[];
    const finalHands = createEmptyHands();

    playOrder.forEach((seat, index) => {
      const rank = ranks[index];

      if (!rank) {
        throw new Error("Expected final trick rank");
      }

      finalHands[seat] = [findCard(leadSuit, rank)];
    });

    store.currentState = stateWithRound({
      ...playingRound,
      phase: "playing",
      hands: finalHands,
      currentTrick: createTrick(1, playingRound.dealerSeat),
      trickHistory: [],
      roundResult: null,
    });

    for (const seat of playOrder) {
      const card = finalHands[seat][0];

      if (!card) {
        throw new Error("Expected final trick card");
      }

      const result = expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player: playerForSeat(seat),
            requestId: `flow-play-${seat}`,
            expectedVersion,
            actionType: "PLAY_CARDS",
            payload: { cardIds: [card.id], declaredType: "single" },
          },
          store,
        ),
      );
      expectedVersion += 1;

      expect(result.view.stateVersion).toBe(expectedVersion);
    }

    const finishedRound = store.currentState.roundState;

    expect(finishedRound?.phase).toBe("round_finished");
    expect(finishedRound?.trickHistory).toHaveLength(1);
    expect(finishedRound?.roundResult?.roundNumber).toBe(1);
    expect(store.currentState.phase).toBe("round_finished");
    expect(store.currentState.roundNumber).toBe(1);
    expect(store.stateVersion).toBe(expectedVersion);
  });

  it("carries a finished round into dealer selection and next-round tribute", async () => {
    const firstRound = startRound({
      roundNumber: 1,
      dealerSeat: 0,
      random: () => 0.5,
    });

    if (!firstRound.ok) {
      throw new Error("Expected first round");
    }

    const firstHands = createEmptyHands();
    firstHands[0] = [findDeckCard(0, "hearts", "A")];
    firstHands[1] = [findDeckCard(0, "hearts", "K")];
    firstHands[2] = [findDeckCard(0, "hearts", "Q")];
    firstHands[3] = [findDeckCard(0, "hearts", "J")];

    const store = new MemoryGameActionStore(
      stateWithRound({
        ...firstRound.value,
        phase: "playing",
        dealerSeat: 0,
        trumpSuit: "spades",
        hands: firstHands,
        bottomCards: nonPointBottomCards(),
        drawPile: [],
        currentTrick: createTrick(1, 0),
        defenderScore: 5,
      }),
    );
    let expectedVersion = 0;

    for (const seat of orderedSeatsFrom(0)) {
      const card = firstHands[seat][0];

      if (!card) {
        throw new Error("Expected first-round final trick card");
      }

      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player: playerForSeat(seat),
            requestId: `cross-finish-${seat}`,
            expectedVersion,
            actionType: "PLAY_CARDS",
            payload: { cardIds: [card.id], declaredType: "single" },
          },
          store,
        ),
      );
      expectedVersion += 1;
    }

    expect(store.currentState.phase).toBe("round_finished");
    expect(store.currentState.roundState?.roundResult?.tributeCount).toBe(3);
    expect(store.currentState.roundState?.roundResult?.winningTeam).toBe("team_0_2");

    const prepared = expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "cross-prepare-next",
          expectedVersion,
          actionType: "PREPARE_NEXT_ROUND",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;

    expect(prepared.view.phase).toBe("choosing_dealer");
    expect(prepared.view.dealerSelection?.dealerCandidates).toEqual([0, 2]);
    expect(prepared.view.dealerSelection?.tributeCount).toBe(3);
    expect(prepared.view.allowedActions.canChooseDealer).toBe(true);
    expect(createPlayerGameView(player.roomId, store.currentState, 1, expectedVersion).allowedActions.canChooseDealer).toBe(false);

    const losingClick = await executeGameAction(
      {
        roomId: player.roomId,
        player: playerForSeat(1),
        requestId: "cross-losing-click",
        expectedVersion,
        actionType: "CHOOSE_DEALER",
        payload: {},
      },
      store,
    );

    expect(losingClick.ok).toBe(false);
    expect(losingClick.ok ? null : losingClick.error.ruleErrorCode).toBe("NOT_DEALER_CANDIDATE");
    expect(store.stateVersion).toBe(expectedVersion);

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "cross-choose-dealer",
          expectedVersion,
          actionType: "CHOOSE_DEALER",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;
    expect(store.currentState.betweenRounds?.dealerClicks).toEqual([0]);

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "cross-resolve-dealer",
          expectedVersion,
          actionType: "RESOLVE_DEALER_SELECTION",
          payload: {},
          random: () => 0.9,
        },
        store,
      ),
    );
    expectedVersion += 1;
    expect(store.currentState.betweenRounds?.resolvedDealerSeat).toBe(0);

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "cross-start-next",
          expectedVersion,
          actionType: "START_NEXT_ROUND",
          payload: {},
          random: () => 0.5,
        },
        store,
      ),
    );
    expectedVersion += 1;

    expect(store.currentState.roundNumber).toBe(2);
    expect(store.currentState.roundState?.dealerSeat).toBe(0);
    expect(store.currentState.roundState?.pendingTributeCount).toBe(3);

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "cross-deal-next",
          expectedVersion,
          actionType: "DEAL_CARDS",
          payload: {},
        },
        store,
      ),
    );
    expectedVersion += 1;
    expectedVersion = await advanceDealingToFinalTrumpBidding(store, expectedVersion);

    const dealtRound = store.currentState.roundState;
    const bidSeat = ([1, 2, 3] as const).find((seat) =>
      dealtRound?.hands[seat].some((card) => card.rank === "2" && card.originalSuit !== "joker"),
    );

    if (bidSeat === undefined || !dealtRound) {
      throw new Error("Expected non-dealer trump bid card");
    }

    const bidCard = dealtRound.hands[bidSeat].find(
      (card) => card.rank === "2" && card.originalSuit !== "joker",
    );

    if (!bidCard || bidCard.originalSuit === "joker") {
      throw new Error("Expected standard-suit 2");
    }

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player: playerForSeat(bidSeat),
          requestId: "cross-place-bid",
          expectedVersion,
          actionType: "PLACE_TRUMP_BID",
          payload: { seat: 0, totalTributes: 0, cardIds: [bidCard.id] },
        },
        store,
      ),
    );
    expectedVersion += 1;

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "cross-resolve-trump",
          expectedVersion,
          actionType: "RESOLVE_TRUMP",
          payload: { hasPendingTribute: false, totalTributes: 0 },
        },
        store,
      ),
    );
    expectedVersion += 1;

    const tributeRound = store.currentState.roundState;

    if (!tributeRound?.trumpSuit || !tributeRound.tributeState) {
      throw new Error("Expected tribute round");
    }

    expect(tributeRound.dealerSeat).toBe(0);
    expect(tributeRound.phase).toBe("tribute");
    expect(tributeRound.pendingTributeCount).toBe(3);
    expect(tributeRound.tributeState.givingTasks).toMatchObject([
      { giverSeat: 1, receiverSeat: 0, requiredCount: 1, status: "pending" },
      { giverSeat: 3, receiverSeat: 2, requiredCount: 2, status: "pending" },
    ]);

    for (const task of tributeRound.tributeState.givingTasks) {
      const currentRound = store.currentState.roundState;

      if (!currentRound?.trumpSuit) {
        throw new Error("Expected current tribute round");
      }

      const cardIds = selectTributeCardIds(
        currentRound.hands[task.giverSeat],
        task.requiredCount,
        currentRound.trumpSuit,
      );

      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player: playerForSeat(task.giverSeat),
            requestId: `cross-give-${task.id}`,
            expectedVersion,
            actionType: "SUBMIT_TRIBUTE",
            payload: { taskId: task.id, cardIds },
          },
          store,
        ),
      );
      expectedVersion += 1;
    }

    expect(store.currentState.roundState?.tributeState?.status).toBe("returning");

    const returnTasks = store.currentState.roundState?.tributeState?.returnTasks ?? [];

    for (const task of returnTasks) {
      const currentRound = store.currentState.roundState;

      if (!currentRound?.trumpSuit) {
        throw new Error("Expected current return round");
      }

      const cardIds = selectReturnCardIds(
        currentRound.hands[task.returnerSeat],
        task.requiredCount,
        currentRound.trumpSuit,
      );

      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player: playerForSeat(task.returnerSeat),
            requestId: `cross-return-${task.id}`,
            expectedVersion,
            actionType: "SUBMIT_RETURN_TRIBUTE",
            payload: { taskId: task.id, cardIds },
          },
          store,
        ),
      );
      expectedVersion += 1;
    }

    const takingBottomRound = store.currentState.roundState;

    expect(takingBottomRound?.phase).toBe("taking_bottom");
    expect(takingBottomRound?.pendingTributeCount).toBe(0);
    expect(takingBottomRound?.tributeState?.status).toBe("completed");
    expect(takingBottomRound?.bottomCards).toHaveLength(8);
    expect(takingBottomRound?.hands[0]).toHaveLength(52);
    expect(takingBottomRound?.hands[1]).toHaveLength(52);
    expect(takingBottomRound?.hands[2]).toHaveLength(52);
    expect(takingBottomRound?.hands[3]).toHaveLength(52);
    expect(store.stateVersion).toBe(expectedVersion);
  });

  it("resolves dealer selection randomly for both clicks or no clicks and rejects re-resolution", async () => {
    const bothClickStore = new MemoryGameActionStore(roundFinishedState(1));
    let expectedVersion = 0;

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "both-prepare",
          expectedVersion,
          actionType: "PREPARE_NEXT_ROUND",
          payload: {},
        },
        bothClickStore,
      ),
    );
    expectedVersion += 1;

    for (const seat of [0, 2] as const) {
      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player: playerForSeat(seat),
            requestId: `both-click-${seat}`,
            expectedVersion,
            actionType: "CHOOSE_DEALER",
            payload: {},
          },
          bothClickStore,
        ),
      );
      expectedVersion += 1;
    }

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "both-resolve",
          expectedVersion,
          actionType: "RESOLVE_DEALER_SELECTION",
          payload: {},
          random: () => 0.9,
        },
        bothClickStore,
      ),
    );
    expectedVersion += 1;

    expect(bothClickStore.currentState.betweenRounds?.resolvedDealerSeat).toBe(2);

    const repeatedResolve = await executeGameAction(
      {
        roomId: player.roomId,
        player,
        requestId: "both-resolve-again",
        expectedVersion,
        actionType: "RESOLVE_DEALER_SELECTION",
        payload: {},
        random: () => 0,
      },
      bothClickStore,
    );

    expect(repeatedResolve.ok).toBe(false);
    expect(repeatedResolve.ok ? null : repeatedResolve.error.ruleErrorCode).toBe("DEALER_ALREADY_RESOLVED");

    const noClickStore = new MemoryGameActionStore(roundFinishedState(1, "team_1_3"));

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "none-prepare",
          expectedVersion: 0,
          actionType: "PREPARE_NEXT_ROUND",
          payload: {},
        },
        noClickStore,
      ),
    );

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "none-resolve",
          expectedVersion: 1,
          actionType: "RESOLVE_DEALER_SELECTION",
          payload: {},
          random: () => 0,
        },
        noClickStore,
      ),
    );

    expect(noClickStore.currentState.betweenRounds?.resolvedDealerSeat).toBe(1);
  });

  it("skips tribute after next-round trump resolution when previous tributeCount is zero", async () => {
    const store = new MemoryGameActionStore(roundFinishedState(0));
    let expectedVersion = 0;

    for (const [actionType, requestId] of [
      ["PREPARE_NEXT_ROUND", "zero-prepare"],
      ["CHOOSE_DEALER", "zero-choose"],
      ["RESOLVE_DEALER_SELECTION", "zero-resolve"],
      ["START_NEXT_ROUND", "zero-start"],
      ["DEAL_CARDS", "zero-deal"],
    ] as const) {
      expectOk(
        await executeGameAction(
          {
            roomId: player.roomId,
            player,
            requestId,
            expectedVersion,
            actionType,
            payload: {},
            random: () => 0,
          },
          store,
        ),
      );
      expectedVersion += 1;
    }

    expectedVersion = await advanceDealingToFinalTrumpBidding(store, expectedVersion);

    const round = store.currentState.roundState;
    const bidCard = round?.hands[0].find(
      (card) => card.rank === "2" && card.originalSuit !== "joker",
    );

    if (!bidCard || bidCard.originalSuit === "joker") {
      throw new Error("Expected dealer bid card");
    }

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "zero-bid",
          expectedVersion,
          actionType: "PLACE_TRUMP_BID",
          payload: { cardIds: [bidCard.id], totalTributes: 4 },
        },
        store,
      ),
    );
    expectedVersion += 1;

    expectOk(
      await executeGameAction(
        {
          roomId: player.roomId,
          player,
          requestId: "zero-resolve-trump",
          expectedVersion,
          actionType: "RESOLVE_TRUMP",
          payload: { totalTributes: 4, hasPendingTribute: true },
        },
        store,
      ),
    );

    expect(store.currentState.roundState?.phase).toBe("taking_bottom");
    expect(store.currentState.roundState?.tributeState).toBeNull();
    expect(store.currentState.roundState?.pendingTributeCount).toBe(0);
  });
});

describe("player game view", () => {
  it("shows only the viewer hand while exposing other player card counts", () => {
    const roundState = roundWithHands();
    const gameState = stateWithRound(roundState);

    for (const seat of [0, 1, 2, 3] as const satisfies readonly Seat[]) {
      const view = createPlayerGameView(player.roomId, gameState, seat, 3);

      expect(view.ownHand).toEqual(roundState.hands[seat]);
      expect(view.players[0].cardCount).toBe(2);
      expect(view.players[1].cardCount).toBe(3);
      expect(view.players[2].cardCount).toBe(4);
      expect(view.players[3].cardCount).toBe(5);
      expect(JSON.stringify(view)).not.toContain(roundState.hands[((seat + 1) % 4) as Seat][0]?.id ?? "missing");
    }
  });

  it("keeps current trump bid cards on the table and returns old bid cards after an overbid", () => {
    const deck = createDeck();
    const spadeTwo = findDeckCard(0, "spades", "2");
    const heartTwos = [findDeckCard(0, "hearts", "2"), findDeckCard(1, "hearts", "2")];
    const roundState = roundWithHands();
    const hands = createEmptyHands();
    hands[0] = [spadeTwo, findDeckCard(0, "spades", "A")];
    hands[1] = [...heartTwos, findDeckCard(0, "hearts", "A")];
    hands[2] = deck.slice(0, 4);
    hands[3] = deck.slice(4, 8);

    const firstBidState = stateWithRound({
      ...roundState,
      phase: "dealing",
      hands,
      highestTrumpBid: {
        seat: 0,
        suit: "spades",
        count: 1,
        cardIds: [spadeTwo.id],
      },
    });
    const firstBidView = createPlayerGameView(player.roomId, firstBidState, 0, 3);

    expect(firstBidView.highestTrumpBidCards.map((card) => card.id)).toEqual([spadeTwo.id]);
    expect(firstBidView.ownHand.map((card) => card.id)).not.toContain(spadeTwo.id);
    expect(firstBidView.players[0].cardCount).toBe(1);

    const overbidState = stateWithRound({
      ...roundState,
      phase: "dealing",
      hands,
      highestTrumpBid: {
        seat: 1,
        suit: "hearts",
        count: 2,
        cardIds: heartTwos.map((card) => card.id),
      },
    });
    const returnedView = createPlayerGameView(player.roomId, overbidState, 0, 4);

    expect(returnedView.highestTrumpBidCards.map((card) => card.id)).toEqual(
      heartTwos.map((card) => card.id),
    );
    expect(returnedView.ownHand.map((card) => card.id)).toContain(spadeTwo.id);
    expect(returnedView.players[0].cardCount).toBe(2);
    expect(returnedView.players[1].cardCount).toBe(1);
  });

  it("exposes pending bottom cards only while the dealer is burying bottom", () => {
    const takenBottomCards = nonPointBottomCards();
    const buryingView = createPlayerGameView(
      player.roomId,
      stateWithRound({
        ...roundWithHands(),
        phase: "burying_bottom",
        takenBottomCards,
        bottomCards: [],
      }),
      1,
      3,
    );

    expect(buryingView.pendingBottomCards.map((card) => card.id)).toEqual(
      takenBottomCards.map((card) => card.id),
    );
    expect(buryingView.buriedBottomCards).toEqual([]);

    const playingView = createPlayerGameView(
      player.roomId,
      stateWithRound({
        ...roundWithHands(),
        phase: "playing",
        takenBottomCards,
        bottomCards: takenBottomCards,
      }),
      1,
      4,
    );

    expect(playingView.pendingBottomCards).toEqual([]);
    expect(playingView.buriedBottomCards.map((card) => card.id)).toEqual(
      takenBottomCards.map((card) => card.id),
    );
  });
});
