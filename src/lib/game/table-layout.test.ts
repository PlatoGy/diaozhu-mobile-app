import { describe, expect, it } from "vitest";

import { getRelativeTablePosition } from "./display";
import { buildRelativePlayers, buildTrickSlots, stableAvatarProfile, teamPresentationForSeat } from "./table-layout";
import { getNextSeat, getPartnerSeat, getPreviousSeat } from "./teams";
import type { Card, PlayRecord, Seat } from "./types";

const seats = [0, 1, 2, 3] as const satisfies readonly Seat[];

function card(id: string): Card {
  return {
    id,
    deckIndex: 0,
    originalSuit: "spades",
    rank: "A",
  };
}

function play(seat: Seat, cards: Card[], declaredType: PlayRecord["declaredType"]): PlayRecord {
  return {
    seat,
    cards,
    cardIds: cards.map((candidate) => candidate.id),
    declaredType,
    playCategory: "spades",
    orderIndex: 0,
    privilegeLosses: [],
  };
}

describe("relative table positions", () => {
  it("maps every viewer to bottom, partner to top, previous to left, and next to right", () => {
    for (const viewerSeat of seats) {
      expect(getRelativeTablePosition(viewerSeat, viewerSeat)).toBe("bottom");
      expect(getRelativeTablePosition(viewerSeat, getPartnerSeat(viewerSeat))).toBe("top");
      expect(getRelativeTablePosition(viewerSeat, getPreviousSeat(viewerSeat))).toBe("left");
      expect(getRelativeTablePosition(viewerSeat, getNextSeat(viewerSeat))).toBe("right");
    }
  });
});

describe("table visual data", () => {
  it("keeps teammates on the same red or blue team", () => {
    expect(teamPresentationForSeat(0).label).toBe("红队");
    expect(teamPresentationForSeat(2).label).toBe("红队");
    expect(teamPresentationForSeat(1).label).toBe("蓝队");
    expect(teamPresentationForSeat(3).label).toBe("蓝队");
  });

  it("generates stable avatar profiles from room id and seat", () => {
    expect(stableAvatarProfile("room-a", 0)).toEqual(stableAvatarProfile("room-a", 0));
    expect(stableAvatarProfile("room-a", 0)).not.toEqual(stableAvatarProfile("room-a", 1));
  });

  it("builds fixed trick slots with only played cards", () => {
    const relativePlayers = buildRelativePlayers({
      roomId: "room-a",
      viewerSeat: 0,
      players: seats.map((seat) => ({ seat, nickname: `P${seat}` })),
      cardCounts: {
        0: { seat: 0, cardCount: 50 },
        1: { seat: 1, cardCount: 49 },
        2: { seat: 2, cardCount: 48 },
        3: { seat: 3, cardCount: 47 },
      },
      readyState: {
        0: true,
        1: true,
        2: false,
        3: false,
      },
      dealerSeat: 0,
      currentTurnSeat: 1,
    });
    const plays = [
      play(0, [card("self-1")], "single"),
      play(3, [card("left-1"), card("left-2")], "loose"),
    ];
    const slots = buildTrickSlots({
      viewerSeat: 0,
      relativePlayers,
      plays,
      winnerSeat: 3,
    });

    expect(slots.bottom.cards.map((candidate) => candidate.id)).toEqual(["self-1"]);
    expect(slots.left.cards.map((candidate) => candidate.id)).toEqual(["left-1", "left-2"]);
    expect(slots.left.declaredTypeLabel).toBe("散牌");
    expect(slots.left.winner).toBe(true);
    expect(slots.top.cards).toEqual([]);
    expect(slots.right.cards).toEqual([]);
  });
});
