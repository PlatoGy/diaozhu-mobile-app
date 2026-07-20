import { describe, expect, it } from "vitest";

import { createTrick } from "../game/trick";
import type { PlayerGameStateView } from "../game/player-view";
import type { Card, LeadPrivileges, Seat } from "../game/types";

import {
  applyOptimisticEffectsToView,
  mergeOptimisticSlotMessages,
  removeOptimisticEffectByRequestId,
  type OptimisticGameEffect,
} from "./optimistic-effects";

function card(id: string, rank: Card["rank"] = "A"): Card {
  return {
    id,
    deckIndex: 0,
    originalSuit: "spades",
    rank,
  };
}

function privileges(): LeadPrivileges {
  const allowed = {
    pair: true,
    triple: true,
    quad: true,
  };

  return {
    trump: { ...allowed },
    spades: { ...allowed },
    hearts: { ...allowed },
    clubs: { ...allowed },
    diamonds: { ...allowed },
  };
}

function baseView(input?: {
  phase?: PlayerGameStateView["phase"];
  viewerSeat?: Seat;
}): PlayerGameStateView {
  const viewerSeat = input?.viewerSeat ?? 0;
  const phase = input?.phase ?? "waiting_for_players";
  const ownHand = [card("s-a"), card("s-k"), card("s-q")];

  return {
    roomId: "room-1",
    stateVersion: 12,
    phase,
    roundNumber: 1,
    viewerSeat,
    dealerSeat: 0,
    trumpSuit: "hearts",
    readyState: {
      0: false,
      1: false,
      2: false,
      3: false,
    },
    ownLeadPrivileges: privileges(),
    ownHand,
    players: {
      0: { seat: 0, cardCount: viewerSeat === 0 ? ownHand.length : 37 },
      1: { seat: 1, cardCount: viewerSeat === 1 ? ownHand.length : 37 },
      2: { seat: 2, cardCount: viewerSeat === 2 ? ownHand.length : 37 },
      3: { seat: 3, cardCount: viewerSeat === 3 ? ownHand.length : 37 },
    },
    highestTrumpBid: null,
    highestTrumpBidCards: [],
    heavenlyTrumpPrompt: null,
    pendingBottomCards: [],
    buriedBottomCards: [],
    currentTrick: phase === "playing" ? createTrick(3, viewerSeat) : null,
    trickHistory: [],
    defenderScore: 0,
    tributeView: null,
    dealerSelection: null,
    roundResult: null,
    allowedActions: {
      canChooseDealer: false,
      canPlaceTrumpBid: false,
      canSkipTrumpBid: false,
      canResolveHeavenlyTrump: false,
      canTakeBottom: false,
      canBuryBottom: false,
      canPlayCards: phase === "playing",
      canSubmitTribute: false,
      canSubmitReturnTribute: false,
      currentTurn: phase === "playing",
    },
    trumpBiddingRound: null,
  };
}

describe("optimistic effects", () => {
  it("projects ready state and ready slot message", () => {
    const effects: OptimisticGameEffect[] = [
      {
        kind: "ready",
        requestId: "ready-1",
        seat: 0,
      },
    ];
    const view = applyOptimisticEffectsToView(baseView(), effects);
    const messages = mergeOptimisticSlotMessages({}, effects);

    expect(view.readyState[0]).toBe(true);
    expect(messages[0]).toEqual({
      text: "已准备",
      tone: "ready",
    });
  });

  it("merges optimistic slot messages over authoritative messages", () => {
    const effects: OptimisticGameEffect[] = [
      {
        kind: "slot_message",
        requestId: "skip-1",
        seat: 1,
        message: {
          text: "跳过",
          tone: "skip",
        },
      },
    ];

    expect(
      mergeOptimisticSlotMessages(
        {
          1: {
            text: "等待",
            tone: "ready",
          },
        },
        effects,
      )[1],
    ).toEqual({
      text: "跳过",
      tone: "skip",
    });
  });

  it("hides viewer trump actions while an optimistic trump response is pending", () => {
    const view = {
      ...baseView({
        phase: "dealing",
      }),
      allowedActions: {
        ...baseView().allowedActions,
        canPlaceTrumpBid: true,
        canSkipTrumpBid: true,
      },
    };
    const nextView = applyOptimisticEffectsToView(view, [
      {
        kind: "slot_message",
        requestId: "skip-1",
        seat: 0,
        message: {
          text: "跳过",
          tone: "skip",
        },
        hidesTrumpActions: true,
      },
    ]);

    expect(nextView.allowedActions.canPlaceTrumpBid).toBe(false);
    expect(nextView.allowedActions.canSkipTrumpBid).toBe(false);
  });

  it("only hides trump bid cards that are still present in the viewer hand", () => {
    const view = {
      ...baseView({
        phase: "dealing",
      }),
      ownHand: [card("s-k"), card("s-q")],
      players: {
        ...baseView().players,
        0: { seat: 0, cardCount: 2 },
      },
      allowedActions: {
        ...baseView().allowedActions,
        canPlaceTrumpBid: true,
        canSkipTrumpBid: true,
      },
    };

    const nextView = applyOptimisticEffectsToView(view, [
      {
        kind: "slot_message",
        requestId: "bid-1",
        seat: 0,
        message: {
          text: "摔2 ♠×2",
          tone: "bid",
        },
        hiddenCardIds: ["already-hidden", "s-k"],
        hidesTrumpActions: true,
      },
    ]);

    expect(nextView.ownHand.map((candidate) => candidate.id)).toEqual(["s-q"]);
    expect(nextView.players[0].cardCount).toBe(1);
  });

  it("removes effects by request id", () => {
    const effects: OptimisticGameEffect[] = [
      { kind: "ready", requestId: "keep", seat: 0 },
      { kind: "ready", requestId: "drop", seat: 1 },
    ];

    expect(removeOptimisticEffectByRequestId(effects, "drop")).toEqual([
      { kind: "ready", requestId: "keep", seat: 0 },
    ]);
  });
});
