"use client";

import type { PlayerGameStateView } from "../game/player-view";
import { getNextSeat } from "../game/teams";
import type {
  Card,
  DeclaredPlayType,
  PlayCategory,
  PlayRecord,
  Seat,
  StandardSuit,
} from "../game/types";

export type OptimisticSlotMessage = {
  text: string;
  tone: "ready" | "bid" | "skip";
};

export type OptimisticPlayEffect = {
  kind: "play_cards";
  requestId: string;
  seat: Seat;
  cards: Card[];
  cardIds: string[];
  declaredType: DeclaredPlayType;
  baseVersion: number;
  startedAt: number;
};

export type OptimisticSlotMessageEffect = {
  kind: "slot_message";
  requestId: string;
  seat: Seat;
  message: OptimisticSlotMessage;
  cards?: Card[];
  hiddenCardIds?: string[];
  hidesTrumpActions?: boolean;
  restoreSelectedCardIds?: string[];
};

export type OptimisticReadyEffect = {
  kind: "ready";
  requestId: string;
  seat: Seat;
};

export type OptimisticGameEffect =
  | OptimisticPlayEffect
  | OptimisticSlotMessageEffect
  | OptimisticReadyEffect;

export type OptimisticPlay = OptimisticPlayEffect;

function categoryForCards(
  cards: readonly Card[],
  trumpSuit: StandardSuit | null,
): PlayCategory | "mixed" {
  const first = cards[0];

  if (!first || !trumpSuit) {
    return "mixed";
  }

  if (
    first.originalSuit === "joker" ||
    first.originalSuit === trumpSuit ||
    first.rank === "2" ||
    first.rank === "3" ||
    first.rank === "5"
  ) {
    return "trump";
  }

  return first.originalSuit;
}

function orderIndexForLength(length: number): PlayRecord["orderIndex"] {
  return Math.min(Math.max(length, 0), 3) as PlayRecord["orderIndex"];
}

function optimisticPlayRecord(
  game: PlayerGameStateView,
  optimisticPlay: OptimisticPlayEffect,
): PlayRecord {
  return {
    seat: optimisticPlay.seat,
    cards: optimisticPlay.cards,
    cardIds: optimisticPlay.cardIds,
    declaredType: optimisticPlay.declaredType,
    playCategory: categoryForCards(optimisticPlay.cards, game.trumpSuit),
    orderIndex: orderIndexForLength(game.currentTrick?.plays.length ?? 0),
    privilegeLosses: [],
  };
}

function applyOptimisticPlayEffectToView(
  game: PlayerGameStateView,
  optimisticPlay: OptimisticPlayEffect,
): PlayerGameStateView {
  if (optimisticPlay.seat !== game.viewerSeat) {
    return game;
  }

  if (game.stateVersion > optimisticPlay.baseVersion) {
    return game;
  }

  const hiddenCardIds = new Set(optimisticPlay.cardIds);
  const ownHand = game.ownHand.filter((card) => !hiddenCardIds.has(card.id));
  const ownPlayer = game.players[game.viewerSeat];
  const players = {
    ...game.players,
    [game.viewerSeat]: {
      ...ownPlayer,
      cardCount: Math.max(0, ownPlayer.cardCount - hiddenCardIds.size),
    },
  };

  if (!game.currentTrick) {
    return {
      ...game,
      allowedActions: {
        ...game.allowedActions,
        canPlayCards: false,
        currentTurn: false,
      },
      ownHand,
      players,
    };
  }

  const alreadyPlayed = game.currentTrick.plays.some(
    (play) => play.seat === optimisticPlay.seat,
  );

  if (alreadyPlayed) {
    return {
      ...game,
      allowedActions: {
        ...game.allowedActions,
        canPlayCards: false,
        currentTurn: false,
      },
      ownHand,
      players,
    };
  }

  const plays = [...game.currentTrick.plays, optimisticPlayRecord(game, optimisticPlay)];

  return {
    ...game,
    allowedActions: {
      ...game.allowedActions,
      canPlayCards: false,
      currentTurn: false,
    },
    ownHand,
    players,
    currentTrick: {
      ...game.currentTrick,
      currentTurnSeat: getNextSeat(optimisticPlay.seat),
      plays,
    },
  };
}

export function applyOptimisticEffectsToView(
  game: PlayerGameStateView,
  effects: readonly OptimisticGameEffect[],
): PlayerGameStateView {
  return effects.reduce<PlayerGameStateView>((currentGame, effect) => {
    if (effect.kind === "play_cards") {
      return applyOptimisticPlayEffectToView(currentGame, effect);
    }

    if (effect.kind === "ready" && currentGame.phase === "waiting_for_players") {
      return {
        ...currentGame,
        readyState: {
          ...currentGame.readyState,
          [effect.seat]: true,
        },
      };
    }

    if (
      effect.kind === "slot_message" &&
      effect.hidesTrumpActions &&
      effect.seat === currentGame.viewerSeat &&
      (currentGame.phase === "dealing" || currentGame.phase === "final_trump_bidding")
    ) {
      const hiddenCardIds = new Set(effect.hiddenCardIds ?? []);
      const ownHand = currentGame.ownHand.filter((card) => !hiddenCardIds.has(card.id));
      const removedCardCount = currentGame.ownHand.length - ownHand.length;
      const ownPlayer = currentGame.players[currentGame.viewerSeat];

      return {
        ...currentGame,
        ownHand,
        players: {
          ...currentGame.players,
          [currentGame.viewerSeat]: {
            ...ownPlayer,
            cardCount: Math.max(0, ownPlayer.cardCount - removedCardCount),
          },
        },
        allowedActions: {
          ...currentGame.allowedActions,
          canPlaceTrumpBid: false,
          canSkipTrumpBid: false,
        },
      };
    }

    return currentGame;
  }, game);
}

export function optimisticSlotCards(
  effects: readonly OptimisticGameEffect[],
): Partial<Record<Seat, Card[]>> {
  const cardsBySeat: Partial<Record<Seat, Card[]>> = {};

  for (const effect of effects) {
    if (effect.kind === "slot_message" && effect.cards && effect.cards.length > 0) {
      cardsBySeat[effect.seat] = effect.cards;
    }
  }

  return cardsBySeat;
}

export function applyOptimisticPlayToView(
  game: PlayerGameStateView,
  optimisticPlay: OptimisticPlay | null,
): PlayerGameStateView {
  return optimisticPlay
    ? applyOptimisticEffectsToView(game, [optimisticPlay])
    : game;
}

export function optimisticSlotMessages(
  effects: readonly OptimisticGameEffect[],
): Partial<Record<Seat, OptimisticSlotMessage>> {
  const messages: Partial<Record<Seat, OptimisticSlotMessage>> = {};

  for (const effect of effects) {
    if (effect.kind === "slot_message") {
      messages[effect.seat] = effect.message;
    }

    if (effect.kind === "ready") {
      messages[effect.seat] = {
        text: "已准备",
        tone: "ready",
      };
    }
  }

  return messages;
}

export function mergeOptimisticSlotMessages(
  baseMessages: Partial<Record<Seat, OptimisticSlotMessage>>,
  effects: readonly OptimisticGameEffect[],
): Partial<Record<Seat, OptimisticSlotMessage>> {
  return {
    ...baseMessages,
    ...optimisticSlotMessages(effects),
  };
}

export function hasOptimisticEffect(
  effects: readonly OptimisticGameEffect[],
  predicate: (effect: OptimisticGameEffect) => boolean,
): boolean {
  return effects.some(predicate);
}

export function removeOptimisticEffectByRequestId(
  effects: readonly OptimisticGameEffect[],
  requestId: string,
): OptimisticGameEffect[] {
  return effects.filter((effect) => effect.requestId !== requestId);
}
