import { z } from "zod";

import {
  dealCards,
  buryBottom,
  placeTrumpBid,
  resolveHeavenlyTrump,
  resolveFinalTrumpBidding,
  startRound,
  takeBottomCards,
} from "./round";
import { finalizeCurrentTrick } from "./round-scoring";
import { resolveTrick } from "./trick-resolution";
import { playCards } from "./trick";
import { enterTributePhase, submitReturnTribute, submitTribute } from "./tribute";
import {
  chooseDealerCandidate,
  createBetweenRoundsState,
  resolveBetweenRoundsDealer,
} from "./between-rounds";
import { parsePersistedGameState } from "./game-state-schema";
import { createPlayerGameView } from "./player-view";
import { ruleError, type ServerGameActionError } from "./game-action-errors";
import {
  getGameActionStore,
  type GameActionStore,
  type GameActionExecution,
  type GameActionStoreResult,
  type GameRoomActionRecord,
} from "./game-action-store";
import type {
  DeclaredPlayType,
  GameActionResult,
  JsonValue,
  RoomStatus,
  RoundState,
  Seat,
  ServerGameState,
} from "./types";
import type { ResolvedPlayer } from "./player-auth";

export type ExecuteGameActionInput = {
  roomId: string;
  player: ResolvedPlayer;
  requestId: string;
  expectedVersion: number;
  actionType: string;
  payload: JsonValue;
  random?: () => number;
};

export type ExecuteGameActionResult = GameActionStoreResult;

type BuildExecutionResult =
  | {
      ok: true;
      execution: GameActionExecution;
    }
  | {
      ok: false;
      error: ServerGameActionError;
    };

const cardIdsPayloadSchema = z.object({
  cardIds: z.array(z.string().min(1)),
});

const playCardsPayloadSchema = cardIdsPayloadSchema.extend({
  declaredType: z.union([
    z.literal("single"),
    z.literal("pair"),
    z.literal("triple"),
    z.literal("quad"),
    z.literal("loose"),
  ]),
});

const startRoundPayloadSchema = z
  .object({
    dealerSeat: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
    previousWinnerTeam: z.union([z.literal("team_0_2"), z.literal("team_1_3")]).nullable().optional(),
  })
  .default({});

const setReadyPayloadSchema = z.object({
  ready: z.boolean(),
});

const resolveHeavenlyTrumpPayloadSchema = z.object({
  accept: z.boolean(),
});

function invalidPersistedState(): BuildExecutionResult {
  return {
    ok: false,
    error: {
      code: "INVALID_PERSISTED_STATE",
      message: "Stored game state is invalid.",
    },
  };
}

function gameStateNotInitialized(): ServerGameActionError {
  return {
    code: "GAME_STATE_NOT_INITIALIZED",
    message: "Round state is not initialized.",
  };
}

function toServerGameState(
  previousState: ServerGameState,
  roundState: RoundState,
  actionType: string,
  betweenRounds = previousState.betweenRounds,
): ServerGameState {
  return {
    ...previousState,
    schemaVersion: 1,
    phase: roundState.phase,
    currentSeat:
      roundState.currentTrick?.status === "in_progress"
        ? roundState.currentTrick.currentTurnSeat
        : null,
    roundNumber: roundState.roundNumber,
    betweenRounds,
    roundState,
    actionHistory: [
      ...previousState.actionHistory,
      {
        type: actionType,
        phase: roundState.phase,
        roundNumber: roundState.roundNumber,
      },
    ],
  };
}

function roomStatusForState(state: ServerGameState): RoomStatus {
  if (state.phase === "waiting_for_players") {
    return "waiting";
  }

  return state.phase === "round_finished" ? "round_finished" : "active";
}

function executeRuleResult(
  result: GameActionResult<RoundState>,
): RoundState | ServerGameActionError {
  if (!result.ok) {
    return ruleError(result.error);
  }

  return result.value;
}

function parsePayload<T>(schema: z.ZodType<T>, payload: JsonValue): T | ServerGameActionError {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return {
      code: "INVALID_ACTION",
      message: "Action payload is invalid.",
      details: parsed.error.flatten(),
    };
  }

  return parsed.data;
}

function actionError(
  code: ServerGameActionError["code"],
  message: string,
  details?: unknown,
): ServerGameActionError {
  return {
    code,
    message,
    details,
  };
}

function appendActionHistory(
  state: ServerGameState,
  actionType: string,
): ServerGameState {
  return {
    ...state,
    actionHistory: [
      ...state.actionHistory,
      {
        type: actionType,
        phase: state.phase,
        roundNumber: state.roundNumber,
      },
    ],
  };
}

function hasAllRoomSeats(players: GameRoomActionRecord["players"]): boolean {
  const seats = new Set(players.map((player) => player.seat));

  return seats.has(0) && seats.has(1) && seats.has(2) && seats.has(3);
}

function allReady(readyState: ServerGameState["readyState"]): boolean {
  return readyState[0] && readyState[1] && readyState[2] && readyState[3];
}

function maybeAutoResolveTrick(roundState: RoundState): GameActionResult<RoundState> {
  if (
    roundState.phase !== "playing" ||
    !roundState.trumpSuit ||
    !roundState.currentTrick ||
    roundState.currentTrick.status !== "awaiting_resolution"
  ) {
    return {
      ok: true,
      value: roundState,
    };
  }

  const resolvedTrick = resolveTrick(roundState.currentTrick, roundState.trumpSuit);

  if (!resolvedTrick.ok) {
    return resolvedTrick;
  }

  return finalizeCurrentTrick({
    ...roundState,
    currentTrick: resolvedTrick.value,
  });
}

function applyActionToState(
  state: ServerGameState,
  seat: Seat,
  actionType: string,
  payload: JsonValue,
  players: GameRoomActionRecord["players"],
  random?: () => number,
): ServerGameState | ServerGameActionError {
  if (actionType === "SET_READY") {
    const parsed = parsePayload(setReadyPayloadSchema, payload);

    if ("code" in parsed) {
      return parsed;
    }

    if (state.phase !== "waiting_for_players") {
      return actionError("INVALID_ACTION", "Ready state can only be changed before the game starts.");
    }

    if (!hasAllRoomSeats(players)) {
      return actionError("INVALID_ACTION", "All four room seats must exist before players can ready.");
    }

    const readyState = {
      ...state.readyState,
      [seat]: parsed.ready,
    };

    if (!allReady(readyState)) {
      return appendActionHistory(
        {
          ...state,
          phase: "waiting_for_players",
          readyState,
        },
        actionType,
      );
    }

    const started = startRound({
      roundNumber: 1,
      random,
    });

    const startedRound = executeRuleResult(started);

    if ("code" in startedRound) {
      return startedRound;
    }

    const dealt = executeRuleResult(dealCards(startedRound));

    return "code" in dealt
      ? dealt
      : toServerGameState(
          {
            ...state,
            readyState,
          },
          dealt,
          actionType,
        );
  }

  if (actionType === "START_ROUND") {
    const parsed = parsePayload(startRoundPayloadSchema, payload);

    if ("code" in parsed) {
      return parsed;
    }

    const result = startRound({
      roundNumber: state.roundNumber + 1,
      dealerSeat: parsed.dealerSeat ?? null,
      previousWinnerTeam: parsed.previousWinnerTeam ?? null,
      random,
    });
    const round = executeRuleResult(result);

    return "code" in round ? round : toServerGameState(state, round, actionType);
  }

  const roundState = state.roundState;

  if (!roundState) {
    return gameStateNotInitialized();
  }

  if (actionType === "PREPARE_NEXT_ROUND") {
    if (roundState.phase !== "round_finished" || !roundState.roundResult) {
      return actionError("INVALID_ACTION", "Current round is not ready for next-round preparation.");
    }

    const betweenRounds = createBetweenRoundsState(roundState.roundResult);

    return toServerGameState(
      state,
      {
        ...roundState,
        phase: "choosing_dealer",
      },
      actionType,
      betweenRounds,
    );
  }

  if (actionType === "CHOOSE_DEALER") {
    if (state.phase !== "choosing_dealer" || roundState.phase !== "choosing_dealer") {
      return actionError("INVALID_ACTION", "Dealer can only be chosen during choosing_dealer phase.");
    }

    if (!state.betweenRounds) {
      return actionError("BETWEEN_ROUNDS_STATE_NOT_FOUND", "Between-rounds state is required.");
    }

    const nextBetweenRounds = chooseDealerCandidate(state.betweenRounds, seat);

    if (!nextBetweenRounds.ok) {
      return ruleError(nextBetweenRounds.error);
    }

    return toServerGameState(state, roundState, actionType, nextBetweenRounds.value);
  }

  if (actionType === "RESOLVE_DEALER_SELECTION") {
    if (state.phase !== "choosing_dealer" || roundState.phase !== "choosing_dealer") {
      return actionError("INVALID_ACTION", "Dealer selection can only resolve during choosing_dealer phase.");
    }

    if (!state.betweenRounds) {
      return actionError("BETWEEN_ROUNDS_STATE_NOT_FOUND", "Between-rounds state is required.");
    }

    const nextBetweenRounds = resolveBetweenRoundsDealer(state.betweenRounds, random);

    if (!nextBetweenRounds.ok) {
      return ruleError(nextBetweenRounds.error);
    }

    return toServerGameState(state, roundState, actionType, nextBetweenRounds.value);
  }

  if (actionType === "START_NEXT_ROUND") {
    if (state.phase !== "choosing_dealer") {
      return actionError("INVALID_ACTION", "Next round can only start after dealer selection begins.");
    }

    if (!state.betweenRounds) {
      return actionError("BETWEEN_ROUNDS_STATE_NOT_FOUND", "Between-rounds state is required.");
    }

    if (state.betweenRounds.resolvedDealerSeat === null) {
      return actionError("DEALER_NOT_RESOLVED", "Dealer selection must resolve before starting next round.");
    }

    const result = startRound({
      roundNumber: state.betweenRounds.sourceRoundNumber + 1,
      dealerSeat: state.betweenRounds.resolvedDealerSeat,
      previousWinnerTeam: state.betweenRounds.winningTeam,
      previousLosingTeam: state.betweenRounds.losingTeam,
      pendingTributeCount: state.betweenRounds.tributeCount,
      random,
    });
    const round = executeRuleResult(result);

    return "code" in round
      ? round
      : toServerGameState(state, round, actionType, state.betweenRounds);
  }

  const nextStateFromRound = (
    result: RoundState | ServerGameActionError,
  ): ServerGameState | ServerGameActionError =>
    "code" in result ? result : toServerGameState(state, result, actionType);

  if (actionType === "DEAL_CARDS") {
    return nextStateFromRound(executeRuleResult(dealCards(roundState)));
  }

  if (actionType === "PLACE_TRUMP_BID") {
    const parsed = parsePayload(cardIdsPayloadSchema, payload);

    if ("code" in parsed) {
      return parsed;
    }

    const result = placeTrumpBid(roundState, {
      seat,
      cardIds: parsed.cardIds,
    });

    if (!result.ok) {
      return ruleError(result.error);
    }

    return nextStateFromRound(result.value.state);
  }

  if (actionType === "RESOLVE_HEAVENLY_TRUMP") {
    const parsed = parsePayload(resolveHeavenlyTrumpPayloadSchema, payload);

    if ("code" in parsed) {
      return parsed;
    }

    return nextStateFromRound(
      executeRuleResult(resolveHeavenlyTrump(roundState, { seat, accept: parsed.accept })),
    );
  }

  if (actionType === "RESOLVE_TRUMP") {
    const pendingTributeCount =
      roundState.pendingTributeCount ?? state.betweenRounds?.tributeCount ?? 0;
    const resolvedTrump = resolveFinalTrumpBidding(roundState, {
      hasPendingTribute: pendingTributeCount > 0,
    });

    if (!resolvedTrump.ok) {
      return ruleError(resolvedTrump.error);
    }

    if (pendingTributeCount === 0) {
      return nextStateFromRound({
        ...resolvedTrump.value,
        pendingTributeCount: 0,
        tributeState: null,
      });
    }

    return nextStateFromRound(
      executeRuleResult(
        enterTributePhase(resolvedTrump.value, {
          totalTributes: pendingTributeCount,
        }),
      ),
    );
  }

  if (actionType === "TAKE_BOTTOM") {
    return nextStateFromRound(executeRuleResult(takeBottomCards(roundState, { seat })));
  }

  if (actionType === "BURY_BOTTOM") {
    const parsed = parsePayload(cardIdsPayloadSchema, payload);

    if ("code" in parsed) {
      return parsed;
    }

    return nextStateFromRound(
      executeRuleResult(buryBottom(roundState, { seat, cardIds: parsed.cardIds })),
    );
  }

  if (actionType === "PLAY_CARDS") {
    const parsed = parsePayload(playCardsPayloadSchema, payload);

    if ("code" in parsed) {
      return parsed;
    }

    const played = playCards(roundState, {
      seat,
      cardIds: parsed.cardIds,
      declaredType: parsed.declaredType as DeclaredPlayType,
    });

    if (!played.ok) {
      return ruleError(played.error);
    }

    const finalized = maybeAutoResolveTrick(played.value);

    return nextStateFromRound(executeRuleResult(finalized));
  }

  if (actionType === "RESOLVE_CURRENT_TRICK") {
    if (!roundState.currentTrick || !roundState.trumpSuit) {
      return ruleError({
        code: "TRICK_NOT_FOUND",
        message: "Current trick cannot be resolved.",
      });
    }

    const resolved = resolveTrick(roundState.currentTrick, roundState.trumpSuit);

    if (!resolved.ok) {
      return ruleError(resolved.error);
    }

    return nextStateFromRound(
      executeRuleResult(finalizeCurrentTrick({ ...roundState, currentTrick: resolved.value })),
    );
  }

  if (actionType === "SUBMIT_TRIBUTE") {
    const parsed = parsePayload(cardIdsPayloadSchema.extend({ taskId: z.string().min(1) }), payload);

    if ("code" in parsed) {
      return parsed;
    }

    return nextStateFromRound(
      executeRuleResult(
        submitTribute(roundState, {
          seat,
          taskId: parsed.taskId,
          cardIds: parsed.cardIds,
        }),
      ),
    );
  }

  if (actionType === "SUBMIT_RETURN_TRIBUTE") {
    const parsed = parsePayload(cardIdsPayloadSchema.extend({ taskId: z.string().min(1) }), payload);

    if ("code" in parsed) {
      return parsed;
    }

    const result = submitReturnTribute(roundState, {
      seat,
      taskId: parsed.taskId,
      cardIds: parsed.cardIds,
    });

    if (!result.ok) {
      return ruleError(result.error);
    }

    const nextRound =
      result.value.phase === "taking_bottom" && result.value.tributeState?.status === "completed"
        ? {
            ...result.value,
            pendingTributeCount: 0,
          }
        : result.value;

    return nextStateFromRound(nextRound);
  }

  return {
    code: "INVALID_ACTION",
    message: `Unsupported actionType: ${actionType}.`,
  };
}

function buildExecution(
  record: GameRoomActionRecord,
  playerSeat: Seat,
  actionType: string,
  payload: JsonValue,
  random?: () => number,
): BuildExecutionResult {
  const parsedState = parsePersistedGameState(record.currentState);

  if (!parsedState) {
    return invalidPersistedState();
  }

  const nextStateOrError = applyActionToState(
    parsedState,
    playerSeat,
    actionType,
    payload,
    record.players,
    random,
  );

  if ("code" in nextStateOrError) {
    return {
      ok: false,
      error: nextStateOrError,
    };
  }

  const view = createPlayerGameView(
    record.roomId,
    nextStateOrError,
    playerSeat,
    record.stateVersion + 1,
  );

  return {
    ok: true,
    execution: {
      nextState: nextStateOrError,
      nextRoomStatus: roomStatusForState(nextStateOrError),
      nextRoundNumber: nextStateOrError.roundNumber,
      view,
    },
  };
}

export async function executeGameAction(
  input: ExecuteGameActionInput,
  store: GameActionStore = getGameActionStore(),
): Promise<ExecuteGameActionResult> {
  if (input.player.roomId !== input.roomId) {
    return {
      ok: false,
      error: {
        code: "SEAT_ACCESS_DENIED",
        message: "Player does not belong to this room.",
      },
    };
  }

  return store.execute({
    roomId: input.roomId,
    requestId: input.requestId,
    seat: input.player.seat,
    actionType: input.actionType,
    expectedVersion: input.expectedVersion,
    execute: (record) =>
      buildExecution(record, input.player.seat, input.actionType, input.payload, input.random),
  });
}
