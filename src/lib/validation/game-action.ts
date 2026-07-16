import { z } from "zod";

import { jsonValueSchema } from "../game/json-schema";

export const gameActionRequestSchema = z
  .object({
    actionType: z.string().trim().min(1).max(64),
    payload: jsonValueSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export type GameActionRequest = z.infer<typeof gameActionRequestSchema>;
