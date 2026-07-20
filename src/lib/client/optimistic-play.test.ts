import { describe, expect, it } from "vitest";

import { createTrick } from "../game/trick";
import type { PlayerGameStateView } from "../game/player-view";
import type { Card, LeadPrivileges, Seat } from "../game/types";

import { applyOptimisticPlayToView, type OptimisticPlay } from "./optimistic-play";

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
  ownHand?: Card[];
  viewerSeat?: Seat;
}): PlayerGameStateView {
  const viewerSeat = input?.viewerSeat ?? 0;
  const ownHand = input?.ownHand ?? [card("s-a"), card("s-k"), card("s-q")];

  return {
    roomId: "room-1",
    stateVersion: 12,
    phase: "playing",
    roundNumber: 1,
    viewerSeat,
    dealerSeat: 0,
    trumpSuit: "hearts",
    readyState: {
      0: true,
      1: true,
      2: true,
      3: true,
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
    currentTrick: createTrick(3, viewerSeat),
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
      canPlayCards: true,
      canSubmitTribute: false,
      canSubmitReturnTribute: false,
      currentTurn: true,
    },
  };
}

function optimisticPlay(view: PlayerGameStateView, cards: Card[]): OptimisticPlay {
  return {
    requestId: "request-play-1",
    seat: view.viewerSeat,
    cards,
    cardIds: cards.map((candidate) => candidate.id),
    declaredType: cards.length === 1 ? "single" : "loose",
    baseVersion: view.stateVersion,
    startedAt: 100,
  };
}

describe("applyOptimisticPlayToView", () => {
  it("hides locally played cards and shows them in the viewer trick slot immediately", () => {
    const view = baseView();
    const selectedCards = view.ownHand.slice(0, 2);
    const nextView = applyOptimisticPlayToView(view, optimisticPlay(view, selectedCards));

    expect(nextView.ownHand.map((candidate) => candidate.id)).toEqual(["s-q"]);
    expect(nextView.players[0].cardCount).toBe(1);
    expect(nextView.allowedActions.canPlayCards).toBe(false);
    expect(nextView.allowedActions.currentTurn).toBe(false);
    expect(nextView.currentTrick?.plays).toHaveLength(1);
    expect(nextView.currentTrick?.plays[0]).toMatchObject({
      seat: 0,
      cardIds: ["s-a", "s-k"],
      declaredType: "loose",
      playCategory: "spades",
      orderIndex: 0,
    });
    expect(view.ownHand.map((candidate) => candidate.id)).toEqual(["s-a", "s-k", "s-q"]);
  });

  it("does not insert a second viewer play after the authoritative state already includes one", () => {
    const view = baseView();
    const selectedCards = view.ownHand.slice(0, 1);
    const confirmedPlay = optimisticPlay(view, selectedCards);
    const alreadyConfirmed = applyOptimisticPlayToView(view, confirmedPlay);
    const nextView = applyOptimisticPlayToView(alreadyConfirmed, confirmedPlay);

    expect(nextView.currentTrick?.plays).toHaveLength(1);
    expect(nextView.currentTrick?.plays[0]?.cardIds).toEqual(["s-a"]);
  });

  it("does not project over a newer authoritative version", () => {
    const view = baseView();
    const selectedCards = view.ownHand.slice(0, 1);
    const confirmedView: PlayerGameStateView = {
      ...applyOptimisticPlayToView(view, optimisticPlay(view, selectedCards)),
      stateVersion: 13,
    };

    expect(applyOptimisticPlayToView(confirmedView, optimisticPlay(view, selectedCards))).toBe(
      confirmedView,
    );
  });

  it("ignores optimistic plays for another seat", () => {
    const view = baseView({ viewerSeat: 0 });
    const otherSeatPlay: OptimisticPlay = {
      ...optimisticPlay(view, view.ownHand.slice(0, 1)),
      seat: 1,
    };

    expect(applyOptimisticPlayToView(view, otherSeatPlay)).toBe(view);
  });
});
