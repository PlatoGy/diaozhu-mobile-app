import { z } from "zod";

import type { Seat } from "../game/types";

export const roomCodeSchema = z.string().regex(/^\d{4}$/);
export const joinCodeSchema = z.string().regex(/^\d{5}$/);

const visibleSeatByDigit: Record<string, Seat> = {
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
};

export function joinCodeForSeat(roomCode: string, seat: Seat): string {
  return `${roomCode}${seat + 1}`;
}

export function parseJoinCodeSeat(joinCode: string): Seat | null {
  const parsed = joinCodeSchema.safeParse(joinCode);

  if (!parsed.success) {
    return null;
  }

  return visibleSeatByDigit[joinCode.slice(4)] ?? null;
}

export function roomCodeFromJoinCode(joinCode: string): string | null {
  const parsed = joinCodeSchema.safeParse(joinCode);

  if (!parsed.success || parseJoinCodeSeat(joinCode) === null) {
    return null;
  }

  return joinCode.slice(0, 4);
}
