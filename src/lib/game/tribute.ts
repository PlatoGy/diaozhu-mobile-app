import { createTributeGivingTasks } from "./tribute-allocation";
import {
  validateReturnTributeSelection,
  validateTributeSelectionSequence,
} from "./tribute-candidates";
import type {
  Card,
  GameActionResult,
  GameRuleError,
  GameRuleErrorCode,
  RoundState,
  Seat,
  SeatHands,
  StandardSuit,
  TributeGivingTask,
  TributeReturnTask,
  TributeState,
} from "./types";
import { getPartnerSeat } from "./teams";

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const PLAYER_HAND_SIZE = 52;
const BOTTOM_CARD_COUNT = 8;

type EnterTributePhaseInput = {
  totalTributes: number;
};

type SubmitTributeInput = {
  seat: Seat;
  taskId: string;
  cardIds: string[];
};

type SubmitReturnTributeInput = {
  seat: Seat;
  taskId: string;
  cardIds: string[];
};

type InitializeTributeInput = {
  totalTributes: number;
  dealerSeat: Seat;
  hands: Readonly<Record<Seat, readonly Card[]>>;
  trumpSuit: StandardSuit;
};

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

function cloneGivingTask(task: TributeGivingTask): TributeGivingTask {
  return {
    ...task,
    selectedCardIds: [...task.selectedCardIds],
    transferredCardIds: [...task.transferredCardIds],
  };
}

function cloneReturnTask(task: TributeReturnTask): TributeReturnTask {
  return {
    ...task,
    receivedTributeCardIds: [...task.receivedTributeCardIds],
    selectedCardIds: [...task.selectedCardIds],
    transferredCardIds: [...task.transferredCardIds],
  };
}

function cloneTributeState(tributeState: TributeState): TributeState {
  return {
    ...tributeState,
    givingTasks: tributeState.givingTasks.map(cloneGivingTask),
    returnTasks: tributeState.returnTasks.map(cloneReturnTask),
  };
}

function validateAllHandsSize(
  hands: Readonly<Record<Seat, readonly Card[]>>,
  expectedSize: number,
): GameActionResult<true> {
  const invalidSeat = SEATS.find((seat) => hands[seat].length !== expectedSize);

  if (invalidSeat !== undefined) {
    return err("INVALID_HAND_SIZE", "All player hands must have the expected card count.");
  }

  return ok(true);
}

function validatePhaseReadyForTribute(roundState: RoundState): GameActionResult<{
  dealerSeat: Seat;
  trumpSuit: StandardSuit;
}> {
  if (roundState.phase !== "tribute") {
    return err("INVALID_PHASE", "Round must be in tribute phase.");
  }

  if (roundState.dealerSeat === null) {
    return err("DEALER_NOT_SET", "Dealer seat must be set before tribute.");
  }

  if (!roundState.trumpSuit) {
    return err("TRUMP_NOT_SET", "Trump suit must be set before tribute.");
  }

  if (roundState.bottomCards.length !== BOTTOM_CARD_COUNT) {
    return err("INVALID_BOTTOM_SIZE", "Bottom cards must remain separate before tribute.");
  }

  const handValidation = validateAllHandsSize(roundState.hands, PLAYER_HAND_SIZE);

  if (!handValidation.ok) {
    return handValidation;
  }

  return ok({
    dealerSeat: roundState.dealerSeat,
    trumpSuit: roundState.trumpSuit,
  });
}

function findCardsByIdsInOrder(hand: readonly Card[], cardIds: readonly string[]): Card[] {
  const cardsById = new Map(hand.map((card) => [card.id, card]));

  return cardIds.flatMap((cardId) => {
    const card = cardsById.get(cardId);
    return card ? [card] : [];
  });
}

function transferCards(
  hands: SeatHands,
  fromSeat: Seat,
  toSeat: Seat,
  cardIds: readonly string[],
): SeatHands {
  const nextHands = cloneHands(hands);
  const transferIdSet = new Set(cardIds);
  const transferredCards = findCardsByIdsInOrder(nextHands[fromSeat], cardIds);

  nextHands[fromSeat] = nextHands[fromSeat].filter((card) => !transferIdSet.has(card.id));
  nextHands[toSeat] = [...nextHands[toSeat], ...transferredCards];

  return nextHands;
}

function createReturnTask(givingTask: TributeGivingTask): TributeReturnTask {
  return {
    id: `tribute-return-${givingTask.receiverSeat}-to-${givingTask.giverSeat}`,
    returnerSeat: givingTask.receiverSeat,
    receiverSeat: givingTask.giverSeat,
    requiredCount: givingTask.requiredCount,
    receivedTributeCardIds: [...givingTask.transferredCardIds],
    selectedCardIds: [],
    transferredCardIds: [],
    status: "pending",
  };
}

function createReturnTasks(givingTasks: readonly TributeGivingTask[]): TributeReturnTask[] {
  return givingTasks.map(createReturnTask);
}

export function initializeTributeState(
  input: InitializeTributeInput,
): GameActionResult<TributeState | null> {
  if (!Number.isInteger(input.totalTributes) || input.totalTributes < 0) {
    return err("INVALID_TRIBUTE_COUNT", "Total tributes must be a non-negative integer.");
  }

  const handValidation = validateAllHandsSize(input.hands, PLAYER_HAND_SIZE);

  if (!handValidation.ok) {
    return handValidation;
  }

  if (input.totalTributes === 0) {
    return ok({
      totalTributes: 0,
      dealerSeat: input.dealerSeat,
      dealerPartnerSeat: getPartnerSeat(input.dealerSeat),
      givingTasks: [],
      returnTasks: [],
      status: "completed",
    });
  }

  const tasksResult = createTributeGivingTasks(input.totalTributes, input.dealerSeat);

  if (!tasksResult.ok) {
    return tasksResult;
  }

  for (const task of tasksResult.value) {
    if (task.requiredCount > input.hands[task.giverSeat].length) {
      return err("INSUFFICIENT_CARDS_FOR_TRIBUTE", "Tribute task requires more cards than giver has.", {
        taskId: task.id,
      });
    }
  }

  return ok({
    totalTributes: input.totalTributes,
    dealerSeat: input.dealerSeat,
    dealerPartnerSeat: getPartnerSeat(input.dealerSeat),
    givingTasks: tasksResult.value,
    returnTasks: [],
    status: "giving",
  });
}

export function enterTributePhase(
  roundState: RoundState,
  input: EnterTributePhaseInput,
): GameActionResult<RoundState> {
  const ready = validatePhaseReadyForTribute(roundState);

  if (!ready.ok) {
    return ready;
  }

  const tributeState = initializeTributeState({
    totalTributes: input.totalTributes,
    dealerSeat: ready.value.dealerSeat,
    hands: roundState.hands,
    trumpSuit: ready.value.trumpSuit,
  });

  if (!tributeState.ok) {
    return tributeState;
  }

  return ok({
    ...roundState,
    hands: cloneHands(roundState.hands),
    bottomCards: [...roundState.bottomCards],
    phase: input.totalTributes === 0 ? "taking_bottom" : "tribute",
    tributeState: tributeState.value,
  });
}

function getTributeStateForSubmit(
  roundState: RoundState,
  expectedStatus: TributeState["status"],
): GameActionResult<TributeState> {
  if (roundState.phase !== "tribute") {
    return err("INVALID_PHASE", "Round must be in tribute phase.");
  }

  if (!roundState.tributeState) {
    return err("TRIBUTE_STATE_NOT_FOUND", "Tribute state is required.");
  }

  if (roundState.tributeState.status !== expectedStatus) {
    return err("INVALID_TRIBUTE_STATUS", "Tribute state is not in the required status.");
  }

  return ok(roundState.tributeState);
}

export function submitTribute(
  roundState: RoundState,
  input: SubmitTributeInput,
): GameActionResult<RoundState> {
  const stateResult = getTributeStateForSubmit(roundState, "giving");

  if (!stateResult.ok) {
    return stateResult;
  }

  if (!roundState.trumpSuit) {
    return err("TRUMP_NOT_SET", "Trump suit must be set before tribute.");
  }

  const tributeState = stateResult.value;
  const task = tributeState.givingTasks.find((candidate) => candidate.id === input.taskId);

  if (!task) {
    return err("TRIBUTE_TASK_NOT_FOUND", "Tribute task was not found.", {
      taskId: input.taskId,
    });
  }

  if (task.status === "completed") {
    return err("TRIBUTE_TASK_ALREADY_COMPLETED", "Tribute task is already completed.", {
      taskId: task.id,
    });
  }

  if (input.seat !== task.giverSeat) {
    return err("NOT_TRIBUTE_GIVER", "Only the tribute giver can submit this task.", {
      taskId: task.id,
    });
  }

  const selection = validateTributeSelectionSequence(
    roundState.hands[task.giverSeat],
    input.cardIds,
    task.requiredCount,
    roundState.trumpSuit,
  );

  if (!selection.ok) {
    return selection;
  }

  const nextHands = transferCards(
    roundState.hands,
    task.giverSeat,
    task.receiverSeat,
    input.cardIds,
  );
  const nextGivingTasks = tributeState.givingTasks.map((candidate): TributeGivingTask => {
    if (candidate.id !== task.id) {
      return cloneGivingTask(candidate);
    }

    return {
      ...candidate,
      selectedCardIds: [...input.cardIds],
      transferredCardIds: [...input.cardIds],
      status: "completed",
    };
  });
  const allGivingCompleted = nextGivingTasks.every((candidate) => candidate.status === "completed");
  const nextTributeState: TributeState = {
    ...cloneTributeState(tributeState),
    givingTasks: nextGivingTasks,
    returnTasks: allGivingCompleted ? createReturnTasks(nextGivingTasks) : [],
    status: allGivingCompleted ? "returning" : "giving",
  };

  return ok({
    ...roundState,
    hands: nextHands,
    tributeState: nextTributeState,
  });
}

export function submitReturnTribute(
  roundState: RoundState,
  input: SubmitReturnTributeInput,
): GameActionResult<RoundState> {
  const stateResult = getTributeStateForSubmit(roundState, "returning");

  if (!stateResult.ok) {
    return stateResult;
  }

  if (!roundState.trumpSuit) {
    return err("TRUMP_NOT_SET", "Trump suit must be set before return tribute.");
  }

  const tributeState = stateResult.value;
  const task = tributeState.returnTasks.find((candidate) => candidate.id === input.taskId);

  if (!task) {
    return err("RETURN_TASK_NOT_FOUND", "Return tribute task was not found.", {
      taskId: input.taskId,
    });
  }

  if (task.status === "completed") {
    return err("RETURN_TASK_ALREADY_COMPLETED", "Return tribute task is already completed.", {
      taskId: task.id,
    });
  }

  if (input.seat !== task.returnerSeat) {
    return err("NOT_RETURNER", "Only the returner can submit this task.", {
      taskId: task.id,
    });
  }

  const selection = validateReturnTributeSelection(
    roundState.hands[task.returnerSeat],
    input.cardIds,
    task.requiredCount,
    roundState.trumpSuit,
  );

  if (!selection.ok) {
    return selection;
  }

  const nextHands = transferCards(
    roundState.hands,
    task.returnerSeat,
    task.receiverSeat,
    input.cardIds,
  );
  const nextReturnTasks = tributeState.returnTasks.map((candidate): TributeReturnTask => {
    if (candidate.id !== task.id) {
      return cloneReturnTask(candidate);
    }

    return {
      ...candidate,
      selectedCardIds: [...input.cardIds],
      transferredCardIds: [...input.cardIds],
      status: "completed",
    };
  });
  const allReturnCompleted = nextReturnTasks.every((candidate) => candidate.status === "completed");

  if (!allReturnCompleted) {
    return ok({
      ...roundState,
      hands: nextHands,
      tributeState: {
        ...cloneTributeState(tributeState),
        returnTasks: nextReturnTasks,
      },
    });
  }

  const handValidation = validateAllHandsSize(nextHands, PLAYER_HAND_SIZE);

  if (!handValidation.ok) {
    return handValidation;
  }

  if (roundState.bottomCards.length !== BOTTOM_CARD_COUNT) {
    return err("INVALID_BOTTOM_SIZE", "Bottom cards must still contain exactly 8 cards.");
  }

  return ok({
    ...roundState,
    phase: "taking_bottom",
    hands: nextHands,
    bottomCards: [...roundState.bottomCards],
    tributeState: {
      ...cloneTributeState(tributeState),
      returnTasks: nextReturnTasks,
      status: "completed",
    },
  });
}
