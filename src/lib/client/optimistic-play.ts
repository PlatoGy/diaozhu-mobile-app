"use client";

import type { PlayerGameStateView } from "../game/player-view";

import {
  applyOptimisticEffectsToView,
  type OptimisticPlayEffect,
} from "./optimistic-effects";

export type OptimisticPlay = Omit<OptimisticPlayEffect, "kind">;

export function applyOptimisticPlayToView(
  game: PlayerGameStateView,
  optimisticPlay: OptimisticPlay | null,
): PlayerGameStateView {
  return optimisticPlay
    ? applyOptimisticEffectsToView(game, [
        {
          kind: "play_cards",
          ...optimisticPlay,
        },
      ])
    : game;
}
