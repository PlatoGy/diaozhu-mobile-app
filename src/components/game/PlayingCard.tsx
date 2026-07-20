"use client";

import type { Card } from "@/src/lib/game/types";

type PlayingCardProps = {
  card?: Card;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  compact?: boolean;
  overlapped?: boolean;
  size?: "hand" | "table" | "mini" | "topStack";
  width?: number;
  height?: number;
  onClick?: () => void;
};

const SUIT_SYMBOLS = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
  joker: "★",
} as const;

function rankLabel(card: Card): string {
  if (card.rank === "big_joker") {
    return "$";
  }

  if (card.rank === "small_joker") {
    return "$";
  }

  return card.rank;
}

function isRed(card: Card): boolean {
  return card.originalSuit === "hearts" || card.originalSuit === "diamonds" || card.rank === "big_joker";
}

function isJoker(card: Card): boolean {
  return card.rank === "big_joker" || card.rank === "small_joker";
}

export function PlayingCard({
  card,
  selected = false,
  disabled = false,
  faceDown = false,
  compact = false,
  overlapped = false,
  size,
  width,
  height,
  onClick,
}: PlayingCardProps) {
  const resolvedSize = size ?? (compact ? "mini" : "hand");
  const fixedStyle =
    width && height
      ? {
          width,
          height,
        }
      : undefined;
  const sizeClassName =
    fixedStyle
      ? ""
      : {
          hand: "h-[67px] w-[46px]",
          table: "h-[62px] w-[44px]",
          mini: "h-[46px] w-8 text-[9px]",
          topStack: "h-[50px] w-9 text-[9px]",
        }[resolvedSize];
  const textSizeClassName = {
    hand: "text-[17px]",
    table: "text-[13px]",
    mini: "text-[9px]",
    topStack: "text-[9px]",
  }[resolvedSize];

  if (faceDown || !card) {
    return (
      <div
        style={fixedStyle}
        className={[
          "grid shrink-0 place-items-center rounded-md border border-[#d2a84f] bg-[#123f2c] shadow-sm",
          "bg-[radial-gradient(circle_at_30%_30%,#1f7a4f,#0c3827_68%)]",
          sizeClassName,
          textSizeClassName,
        ].join(" ")}
      >
        <div className="grid h-3/4 w-3/4 place-items-center rounded border border-[#f5d38a] text-[8px] text-[#f5d38a]">
          吊
        </div>
      </div>
    );
  }

  const red = isRed(card);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={fixedStyle}
      className={[
        "relative shrink-0 touch-manipulation rounded-md border bg-[#fffdf7] shadow-[0_1px_4px_rgba(0,0,0,0.28)] transition-transform",
        red ? "text-[#c1121f]" : "text-[#111827]",
        selected ? "-translate-y-4 border-[#fbbf24] ring-2 ring-[#fbbf24]" : "border-[#d7d3c8]",
        disabled ? "cursor-not-allowed opacity-100 disabled:opacity-100" : "hover:-translate-y-1",
        overlapped ? "overflow-visible" : "",
        sizeClassName,
        textSizeClassName,
      ].join(" ")}
      aria-pressed={selected}
    >
      <span className="absolute left-0.5 top-0.5 leading-none">
        <span className="block text-[0.95em] font-bold">{rankLabel(card)}</span>
        <span className="block text-[1em]">{isJoker(card) ? "★" : SUIT_SYMBOLS[card.originalSuit]}</span>
      </span>
      <span className="absolute bottom-0.5 right-0.5 font-serif text-[1.52em] leading-none">
        {isJoker(card) ? (
          <span className="font-black">$</span>
        ) : (
          SUIT_SYMBOLS[card.originalSuit]
        )}
      </span>
      {disabled ? (
        <span className="pointer-events-none absolute inset-0 z-20 rounded-md bg-[#6b7280]/42" />
      ) : null}
    </button>
  );
}
