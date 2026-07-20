import type { CardRank, DeckIndex, GamePhase, StandardRank, StandardSuit } from "./types";

export const DECK_INDICES: readonly DeckIndex[] = [0, 1, 2, 3];

export const STANDARD_SUITS: readonly StandardSuit[] = [
  "spades",
  "hearts",
  "clubs",
  "diamonds",
];

export const STANDARD_RANKS: readonly StandardRank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export const JOKER_RANKS = ["small_joker", "big_joker"] as const;

export const CARD_RANKS: readonly CardRank[] = [...STANDARD_RANKS, ...JOKER_RANKS];

export const ALWAYS_TRUMP_RANKS = ["2", "3", "5"] as const;

export const GAME_PHASES: readonly [GamePhase, ...GamePhase[]] = [
  "waiting_for_players",
  "choosing_dealer",
  "dealing",
  "heavenly_trump_bidding",
  "final_trump_bidding",
  "tribute",
  "taking_bottom",
  "burying_bottom",
  "playing",
  "round_finished",
];

export const REGULAR_RANK_STRENGTH: Readonly<Record<StandardRank, number>> = {
  "4": 1,
  "6": 2,
  "7": 3,
  "8": 4,
  "9": 5,
  "10": 6,
  J: 7,
  Q: 8,
  K: 9,
  A: 10,
  "2": 0,
  "3": 0,
  "5": 0,
};
