"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { calculateHandLayout, splitCardsIntoRows } from "@/src/lib/game/hand-layout";
import type { Card } from "@/src/lib/game/types";

import { PlayingCard } from "./PlayingCard";

export function PlayerHand({
  cards,
  selectedCardIds,
  highlightedCardIds,
  disabledCardIds,
  onToggleCard,
}: {
  cards: readonly Card[];
  selectedCardIds: readonly string[];
  highlightedCardIds: readonly string[];
  disabledCardIds?: readonly string[];
  onToggleCard: (cardId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 720, height: 150 });
  const highlighted = useMemo(() => new Set(highlightedCardIds), [highlightedCardIds]);
  const disabled = useMemo(() => new Set(disabledCardIds ?? []), [disabledCardIds]);
  const selected = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);
  const layout = useMemo(
    () =>
      calculateHandLayout({
        cardCount: cards.length,
        availableWidth: size.width,
        availableHeight: size.height,
      }),
    [cards.length, size.height, size.width],
  );
  const rows = useMemo(() => splitCardsIntoRows(cards, layout.rowCount), [cards, layout.rowCount]);
  const handHeight = layout.cardHeight + layout.rowOffset * Math.max(0, rows.length - 1);
  const baseTop = Math.max(0, size.height - handHeight + 4);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-full min-h-0 w-full touch-manipulation overflow-visible">
      {rows.map((row, rowIndex) => (
        <div
          key={`row-${row[0]?.id ?? rowIndex}`}
          className="absolute"
          style={{
            left: Math.max(
              0,
              (size.width - (layout.cardWidth + layout.overlapOffset * Math.max(0, row.length - 1))) / 2,
            ),
            top:
              baseTop +
              rowIndex * layout.rowOffset +
              (rowIndex > 0 ? Math.round(layout.cardHeight * 0.05) : 0),
            height: layout.cardHeight,
            zIndex: rowIndex * 100,
          }}
        >
          {row.map((card, cardIndex) => {
            const isHighlighted = highlighted.size === 0 || highlighted.has(card.id);
            const isDisabled = disabled.has(card.id);
            const isSelected = selected.has(card.id);
            const cardStateClassName = isHighlighted ? "" : "opacity-45";

            return (
              <div
                key={card.id}
                className="absolute top-0"
                style={{
                  left: cardIndex * layout.overlapOffset,
                  zIndex: cardIndex,
                }}
              >
                <div className={cardStateClassName}>
                  <PlayingCard
                    card={card}
                    size="hand"
                    width={layout.cardWidth}
                    height={layout.cardHeight}
                    selected={isSelected}
                    disabled={isDisabled}
                    overlapped
                    onClick={() => onToggleCard(card.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
