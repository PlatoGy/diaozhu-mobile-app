export type HandLayoutInput = {
  cardCount: number;
  availableWidth: number;
  availableHeight: number;
};

export type HandLayout = {
  rowCount: 2;
  cardsPerRow: number;
  cardWidth: number;
  cardHeight: number;
  overlapOffset: number;
  rowOffset: number;
};

const MIN_CARD_WIDTH = 34;
const MAX_CARD_WIDTH = 52;
const CARD_RATIO = 1.38;
const MIN_OVERLAP_OFFSET = 14;
const MAX_OVERLAP_OFFSET = 22;
const MIN_ROW_OFFSET = 30;
const MAX_ROW_OFFSET = 42;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function positiveSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function offsetFor(width: number, cardWidth: number, cardsPerRow: number): number {
  if (cardsPerRow <= 1) {
    return 0;
  }

  return (width - cardWidth) / (cardsPerRow - 1);
}

function layoutForRows(cardCount: number, width: number, height: number): HandLayout {
  const rowCount = 2;
  const cardsPerRow = Math.max(1, Math.ceil(cardCount / rowCount));
  const heightBoundWidth = Math.floor((height - MIN_ROW_OFFSET) / CARD_RATIO);
  const cardWidth = clamp(heightBoundWidth, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
  const cardHeight = Math.round(cardWidth * CARD_RATIO);
  const rawOffset = offsetFor(width, cardWidth, cardsPerRow);
  const overlapOffset = clamp(Math.floor(rawOffset), MIN_OVERLAP_OFFSET, MAX_OVERLAP_OFFSET);
  const rowOffset = clamp(
    Math.floor((height - cardHeight) / Math.max(1, rowCount - 1)),
    MIN_ROW_OFFSET,
    MAX_ROW_OFFSET,
  );

  return {
    rowCount,
    cardsPerRow,
    cardWidth,
    cardHeight,
    overlapOffset,
    rowOffset,
  };
}

export function calculateHandLayout(input: HandLayoutInput): HandLayout {
  const cardCount = Math.max(0, Math.floor(input.cardCount));
  const width = positiveSize(input.availableWidth, 720);
  const height = positiveSize(input.availableHeight, 138);

  return layoutForRows(cardCount, width, height);
}

export function splitCardsIntoRows<T extends { id: string }>(
  cards: readonly T[],
  rowCount: 2,
): T[][] {
  const cardsPerRow = Math.ceil(cards.length / rowCount);
  const rows: T[][] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    rows.push(cards.slice(rowIndex * cardsPerRow, (rowIndex + 1) * cardsPerRow));
  }

  return rows.filter((row) => row.length > 0);
}
