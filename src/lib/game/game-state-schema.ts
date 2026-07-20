import { z } from "zod";

import { GAME_PHASES, STANDARD_SUITS } from "./constants";
import type { RoundState, Seat, ServerGameState } from "./types";

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const teamSchema = z.union([z.literal("team_0_2"), z.literal("team_1_3")]);
const standardSuitSchema = z.enum(STANDARD_SUITS);
const originalSuitSchema = z.union([standardSuitSchema, z.literal("joker")]);
const cardRankSchema = z.union([
  z.literal("2"),
  z.literal("3"),
  z.literal("4"),
  z.literal("5"),
  z.literal("6"),
  z.literal("7"),
  z.literal("8"),
  z.literal("9"),
  z.literal("10"),
  z.literal("J"),
  z.literal("Q"),
  z.literal("K"),
  z.literal("A"),
  z.literal("small_joker"),
  z.literal("big_joker"),
]);
const deckIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const persistedCardSchema = z
  .object({
    id: z.string().min(1),
    deckIndex: deckIndexSchema,
    originalSuit: originalSuitSchema,
    rank: cardRankSchema,
  })
  .strict();

const seatHandsSchema = z
  .object({
    "0": z.array(persistedCardSchema),
    "1": z.array(persistedCardSchema),
    "2": z.array(persistedCardSchema),
    "3": z.array(persistedCardSchema),
  })
  .transform((hands) => ({
    0: hands["0"],
    1: hands["1"],
    2: hands["2"],
    3: hands["3"],
  }));

const trumpBidSchema = z
  .object({
    seat: seatSchema,
    suit: standardSuitSchema,
    count: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    cardIds: z.array(z.string().min(1)).optional().default([]),
    isHeavenly: z.literal(true).optional(),
  })
  .strict();

const heavenlyTrumpPromptSchema = z
  .object({
    seat: seatSchema,
    cardId: z.string().min(1),
    suit: standardSuitSchema,
    resolved: z.boolean(),
  })
  .strict();

const betweenRoundsStateSchema = z
  .object({
    sourceRoundNumber: z.number().int().positive(),
    winningTeam: teamSchema,
    losingTeam: teamSchema,
    tributeCount: z.number().int().nonnegative(),
    dealerCandidates: z.tuple([seatSchema, seatSchema]),
    dealerClicks: z.array(seatSchema),
    resolvedDealerSeat: seatSchema.nullable(),
  })
  .strict();

const roundStateSchema: z.ZodType<RoundState> = z
  .object({
    roundNumber: z.number().int().positive(),
    phase: z.enum(GAME_PHASES),
    dealerSeat: seatSchema.nullable(),
    trumpSuit: standardSuitSchema.nullable(),
    pendingTributeCount: z.number().int().nonnegative().optional().default(0),
    previousWinningTeam: teamSchema.nullable().optional().default(null),
    previousLosingTeam: teamSchema.nullable().optional().default(null),
    hands: seatHandsSchema,
    bottomCards: z.array(persistedCardSchema),
    drawPile: z.array(persistedCardSchema),
    dealOrder: z.array(
      z
        .object({
          seat: seatSchema,
          cardId: z.string(),
        })
        .strict(),
    ),
    highestTrumpBid: trumpBidSchema.nullable(),
    heavenlyTrumpPrompt: heavenlyTrumpPromptSchema.nullable().optional().default(null),
    previousWinnerTeam: teamSchema.nullable(),
    playerPrivileges: z.unknown(),
    currentTrick: z.unknown().nullable(),
    defenderScore: z.number().int().nonnegative(),
    trickHistory: z.array(z.unknown()),
    roundResult: z.unknown().nullable(),
    tributeState: z.unknown().nullable(),
    takenBottomCards: z.array(persistedCardSchema),
    firstLeadSeat: seatSchema.nullable(),
  })
  .passthrough()
  .transform((value) => value as RoundState);

const privateStateBySeatSchema = z.object({
  "0": z.record(z.string(), z.unknown()).optional(),
  "1": z.record(z.string(), z.unknown()).optional(),
  "2": z.record(z.string(), z.unknown()).optional(),
  "3": z.record(z.string(), z.unknown()).optional(),
});

const readyStateSchema = z
  .object({
    "0": z.boolean().optional().default(false),
    "1": z.boolean().optional().default(false),
    "2": z.boolean().optional().default(false),
    "3": z.boolean().optional().default(false),
  })
  .default({
    "0": false,
    "1": false,
    "2": false,
    "3": false,
  })
  .transform((value) => ({
    0: value["0"],
    1: value["1"],
    2: value["2"],
    3: value["3"],
  }));

const serverGameStateSchema = z
  .object({
    schemaVersion: z.number().int().positive().default(1),
    phase: z.enum(GAME_PHASES),
    currentSeat: seatSchema.nullable(),
    roundNumber: z.number().int().nonnegative(),
    readyState: readyStateSchema,
    betweenRounds: betweenRoundsStateSchema.optional(),
    roundState: roundStateSchema.optional(),
    publicState: z.record(z.string(), z.unknown()).default({}),
    privateStateBySeat: privateStateBySeatSchema.default({}),
    actionHistory: z.array(z.unknown()).default([]),
    version: z.number().int().positive().default(1),
  })
  .passthrough()
  .transform((value) => {
    const privateStateBySeat = {
      0: value.privateStateBySeat["0"] ?? {},
      1: value.privateStateBySeat["1"] ?? {},
      2: value.privateStateBySeat["2"] ?? {},
      3: value.privateStateBySeat["3"] ?? {},
    } satisfies Record<Seat, Record<string, unknown>>;

    return {
      ...value,
      privateStateBySeat,
    } as ServerGameState;
  });

export function parsePersistedGameState(value: unknown): ServerGameState | null {
  const parsed = serverGameStateSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

export function serializeGameState(state: ServerGameState): string {
  return JSON.stringify(state);
}
