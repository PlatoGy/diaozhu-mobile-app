import { getNextSeat, getPartnerSeat, getPreviousSeat } from "./teams";
import type {
  GameActionResult,
  GameRuleErrorCode,
  Seat,
  TributeAllocation,
  TributeGivingTask,
} from "./types";

function ok<T>(value: T): GameActionResult<T> {
  return {
    ok: true,
    value,
  };
}

function err<T>(code: GameRuleErrorCode, message: string): GameActionResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export function allocateTributes(totalTributes: number): GameActionResult<TributeAllocation> {
  if (!Number.isInteger(totalTributes) || totalTributes < 0) {
    return err("INVALID_TRIBUTE_ALLOCATION", "Total tributes must be a non-negative integer.");
  }

  const base = Math.floor(totalTributes / 2);

  return ok({
    dealerReceives: base,
    dealerPartnerReceives: base + (totalTributes % 2),
  });
}

function createGivingTask(receiverSeat: Seat, requiredCount: number): TributeGivingTask | null {
  if (requiredCount === 0) {
    return null;
  }

  const giverSeat = getNextSeat(receiverSeat);

  if (getPreviousSeat(giverSeat) !== receiverSeat) {
    return null;
  }

  return {
    id: `tribute-give-${giverSeat}-to-${receiverSeat}`,
    giverSeat,
    receiverSeat,
    requiredCount,
    selectedCardIds: [],
    transferredCardIds: [],
    status: "pending",
  };
}

export function createTributeGivingTasks(
  totalTributes: number,
  dealerSeat: Seat,
): GameActionResult<TributeGivingTask[]> {
  const allocation = allocateTributes(totalTributes);

  if (!allocation.ok) {
    return allocation;
  }

  const dealerPartnerSeat = getPartnerSeat(dealerSeat);
  const tasks = [
    createGivingTask(dealerSeat, allocation.value.dealerReceives),
    createGivingTask(dealerPartnerSeat, allocation.value.dealerPartnerReceives),
  ].filter((task): task is TributeGivingTask => Boolean(task));

  return ok(tasks);
}
