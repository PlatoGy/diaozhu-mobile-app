"use client";

import type { GameActionType } from "../realtime/protocol";

export type GameActionPerformanceEvent = {
  event:
    | "submit_success"
    | "submit_failed"
    | "submit_conflict"
    | "socket_deferred"
    | "deferred_refresh";
  actionType: GameActionType;
  requestId?: string;
  baseVersion?: number;
  nextVersion?: number;
  socketVersion?: number;
  elapsedMs?: number;
};

export function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function logGameActionPerformance(event: GameActionPerformanceEvent): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const payload = {
    ...event,
    elapsedMs:
      typeof event.elapsedMs === "number" ? Math.round(event.elapsedMs) : undefined,
  };

  console.info("[game-action]", payload);
}
