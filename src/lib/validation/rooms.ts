import { z } from "zod";

const nicknameSchema = z
  .string()
  .trim()
  .min(1, "Nickname is required.")
  .max(24, "Nickname must be 24 characters or fewer.");

export const createRoomRequestSchema = z
  .object({
    adminSecret: z.string().min(1, "Admin secret is required."),
    players: z
      .array(
        z.object({
          nickname: nicknameSchema,
        }),
      )
      .length(4, "Exactly four players are required."),
  })
  .strict();

export const roomIdSchema = z.uuid();

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
