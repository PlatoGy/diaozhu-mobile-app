import { z } from "zod";

import { jsonValueSchema } from "../game/json-schema";

export const gameActionRequestSchema = z
  .object({
    actionType: z.string().trim().min(1).max(64),
    requestId: z.string().trim().min(8).max(128),
    payload: jsonValueSchema.optional().default({}),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export type GameActionRequest = z.infer<typeof gameActionRequestSchema>;
