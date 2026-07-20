import { DECK_INDICES, JOKER_RANKS, STANDARD_RANKS, STANDARD_SUITS } from "./constants";
import type { Card } from "./types";

export function createDeck(): Card[] {
  return DECK_INDICES.flatMap((deckIndex) => [
    ...STANDARD_SUITS.flatMap((originalSuit) =>
      STANDARD_RANKS.map((rank) => ({
        id: `deck-${deckIndex}-${originalSuit}-${rank}`,
        deckIndex,
        originalSuit,
        rank,
      })),
    ),
    ...JOKER_RANKS.map((rank) => ({
      id: `deck-${deckIndex}-joker-${rank}`,
      deckIndex,
      originalSuit: "joker" as const,
      rank,
    })),
  ]);
}

export function shuffleDeck(cards: readonly Card[], random: () => number = Math.random): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentCard = shuffled[index];
    const swapCard = shuffled[swapIndex];

    if (!currentCard || !swapCard) {
      continue;
    }

    shuffled[index] = swapCard;
    shuffled[swapIndex] = currentCard;
  }

  return shuffled;
}
