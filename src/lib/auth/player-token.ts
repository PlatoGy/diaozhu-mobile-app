import { createHash, randomBytes } from "node:crypto";

const PLAYER_TOKEN_BYTES = 32;

export function generatePlayerToken(): string {
  return randomBytes(PLAYER_TOKEN_BYTES).toString("base64url");
}

export function hashPlayerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
