import { z } from "zod";

import { createInitialGameState } from "./initial-state";
import { jsonObjectSchema, jsonValueSchema } from "./json-schema";
import type { JsonObject, JsonValue, Seat, ServerGameState } from "./types";

export type PlayerVisibleGameState = {
  phase: string;
  currentSeat: Seat | null;
  publicState: JsonObject;
  myPrivateState: JsonObject;
  actions: JsonValue[];
};

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const privateStateBySeatSchema = z
  .object({
    "0": jsonObjectSchema.optional(),
    "1": jsonObjectSchema.optional(),
    "2": jsonObjectSchema.optional(),
    "3": jsonObjectSchema.optional(),
  })
  .passthrough()
  .optional();

const partialServerStateSchema = z
  .object({
    phase: z.string().optional(),
    currentSeat: seatSchema.nullable().optional(),
    roundNumber: z.number().int().nonnegative().optional(),
    publicState: jsonObjectSchema.optional(),
    privateStateBySeat: privateStateBySeatSchema,
    actionHistory: z.array(jsonValueSchema).optional(),
    version: z.number().int().positive().optional(),
  })
  .passthrough();

function privateStateForSeat(
  privateStateBySeat: z.infer<typeof privateStateBySeatSchema>,
  seat: Seat,
): JsonObject {
  return privateStateBySeat?.[String(seat) as "0" | "1" | "2" | "3"] ?? {};
}

export function normalizeServerGameState(value: unknown): ServerGameState {
  const initialState = createInitialGameState();
  const parsed = partialServerStateSchema.safeParse(value);

  if (!parsed.success) {
    return initialState;
  }

  return {
    phase: parsed.data.phase ?? initialState.phase,
    currentSeat: parsed.data.currentSeat ?? initialState.currentSeat,
    roundNumber: parsed.data.roundNumber ?? initialState.roundNumber,
    publicState: parsed.data.publicState ?? initialState.publicState,
    privateStateBySeat: {
      0: privateStateForSeat(parsed.data.privateStateBySeat, 0),
      1: privateStateForSeat(parsed.data.privateStateBySeat, 1),
      2: privateStateForSeat(parsed.data.privateStateBySeat, 2),
      3: privateStateForSeat(parsed.data.privateStateBySeat, 3),
    },
    actionHistory: parsed.data.actionHistory ?? initialState.actionHistory,
    version: parsed.data.version ?? initialState.version,
  };
}

export function toPlayerView(
  serverState: unknown,
  requestingSeat: Seat,
): PlayerVisibleGameState {
  const normalizedState = normalizeServerGameState(serverState);

  return {
    phase: normalizedState.phase,
    currentSeat: normalizedState.currentSeat,
    publicState: normalizedState.publicState,
    myPrivateState: normalizedState.privateStateBySeat[requestingSeat],
    actions: normalizedState.actionHistory,
  };
}
