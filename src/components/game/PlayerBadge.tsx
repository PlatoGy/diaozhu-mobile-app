import type { RelativePlayer } from "@/src/lib/game/table-layout";
import { STANDARD_SUITS } from "@/src/lib/game/constants";
import type { GroupType, PlayCategory, StandardSuit, TrumpBid } from "@/src/lib/game/types";

import { PlayerRemainingCard } from "./PlayerRemainingCard";

export type PlayerMissingMarks = Partial<Record<PlayCategory, Partial<Record<GroupType, boolean>>>>;

const GROUP_MARKS = [
  { type: "pair", label: "2" },
  { type: "triple", label: "3" },
  { type: "quad", label: "4" },
] as const satisfies ReadonlyArray<{ type: GroupType; label: string }>;

const SUIT_SYMBOLS: Record<StandardSuit, string> = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
};

function suitColorClassName(suit: StandardSuit): string {
  return suit === "hearts" || suit === "diamonds" ? "text-[#ef4444]" : "text-[#111827]";
}

export function PlayerBadge({
  player,
  placement,
  trumpSuit,
  trumpBid,
  missingMarks,
}: {
  player: RelativePlayer;
  placement: "top" | "left" | "right" | "bottom";
  trumpSuit?: StandardSuit | null;
  trumpBid?: TrumpBid | null;
  missingMarks?: PlayerMissingMarks;
}) {
  const isOpponent = placement !== "bottom";
  const avatar = (
    <div
      className={[
        "relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-[#102017]",
        isOpponent ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm",
        player.avatar.gradientClassName,
        player.active ? "animate-pulse opacity-[0.65]" : "",
      ].join(" ")}
    >
      {player.avatar.symbol}
      {player.dealer ? (
        <span className="absolute -right-1 -top-1 rounded-full border border-[#fff7cc] bg-[#fde68a] px-1 text-[10px] font-black leading-4 text-[#7c2d12] shadow">
          庄
        </span>
      ) : null}
    </div>
  );
  const name = (
    <span
      className={[
        "truncate rounded-full border border-[#d2a84f]/55 bg-[#08271f]/80 text-center font-semibold leading-tight text-[#f7f0c6] shadow-sm",
        isOpponent
          ? "min-w-[42px] max-w-[74px] px-1.5 py-px text-[9px]"
          : "min-w-[52px] max-w-[92px] px-2 py-0.5 text-[11px]",
      ].join(" ")}
    >
      {player.nickname}
    </span>
  );
  const opponentFrameClassName =
    "rounded-lg border border-[#f5d38a]/45 bg-[#041a15]/30 px-2 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.18)]";
  const cardStatus = (
    <div className="flex flex-col items-center gap-0.5">
      <PlayerRemainingCard count={player.cardCount} />
      <TrumpBidStrip bid={trumpBid} />
    </div>
  );
  const missingPanel = (
    <MissingSuitsPanel
      marks={missingMarks ?? {}}
      trumpSuit={trumpSuit ?? null}
    />
  );

  if (placement === "top") {
    return (
      <div className={`flex max-w-[250px] items-start gap-1.5 text-[#f8fff4] ${opponentFrameClassName}`}>
        <div className="flex flex-col items-center gap-0.5">
          {avatar}
          {name}
        </div>
        {cardStatus}
        {missingPanel}
      </div>
    );
  }

  if (placement === "left") {
    return (
      <div className={`flex max-w-[128px] flex-col items-center gap-1 text-[#f8fff4] ${opponentFrameClassName}`}>
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-0.5">
            {avatar}
            {name}
          </div>
          {cardStatus}
        </div>
        {missingPanel}
      </div>
    );
  }

  if (placement === "right") {
    return (
      <div className={`ml-auto flex max-w-[128px] flex-col items-center gap-1 text-[#f8fff4] ${opponentFrameClassName}`}>
        <div className="flex items-center gap-1.5">
          {cardStatus}
          <div className="flex flex-col items-center gap-0.5">
            {avatar}
            {name}
          </div>
        </div>
        {missingPanel}
      </div>
    );
  }

  return (
    <div className="flex max-w-[250px] items-center gap-2 text-[#f8fff4]">
      {avatar}
      {name}
    </div>
  );
}

function TrumpBidStrip({ bid }: { bid?: TrumpBid | null }) {
  if (!bid) {
    return <div className="h-4 w-11" />;
  }

  return (
    <div className="flex h-4 w-11 items-center justify-center">
      {Array.from({ length: bid.count }, (_, index) => (
        <div
          key={index}
          className={[
            "grid h-4 w-3 place-items-center rounded-sm border border-[#f5d38a]/70 bg-[#fffdf7] text-[8px] font-black leading-none shadow-sm",
            index > 0 ? "-ml-1" : "",
            suitColorClassName(bid.suit),
          ].join(" ")}
          style={{ zIndex: index }}
        >
          <span className="-space-y-1 text-center">
            <span className="block">2</span>
            <span className="block text-[7px]">{SUIT_SYMBOLS[bid.suit]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function MissingSuitsPanel({
  marks,
  trumpSuit,
}: {
  marks: PlayerMissingMarks;
  trumpSuit: StandardSuit | null;
}) {
  if (!trumpSuit) {
    return <div className="h-[47px] w-[90px]" />;
  }

  const categories: Array<{ category: PlayCategory; label: string; colorClassName: string }> = [
    { category: "trump", label: "主", colorClassName: suitColorClassName(trumpSuit) },
    ...STANDARD_SUITS.filter((suit) => suit !== trumpSuit).map((suit) => ({
      category: suit,
      label: SUIT_SYMBOLS[suit],
      colorClassName: suitColorClassName(suit),
    })),
  ];

  return (
    <div className="grid w-[90px] grid-cols-4 gap-0.5">
      {categories.map((item) => (
        <div
          key={item.category}
          className="grid min-h-[47px] grid-rows-[13px_repeat(3,10px)] gap-px overflow-hidden rounded border border-[#f5d38a]/25 bg-[#051e18]/55"
        >
          <div className={`grid place-items-center bg-[#fffdf7] text-[9px] font-black leading-none ${item.colorClassName}`}>
            {item.label}
          </div>
          {GROUP_MARKS.map((group) => (
            <MissingGroupCell
              key={group.type}
              label={group.label}
              missing={Boolean(marks[item.category]?.[group.type])}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function MissingGroupCell({
  label,
  missing,
}: {
  label: string;
  missing: boolean;
}) {
  return (
    <div
      className={[
        "grid place-items-center bg-white/[0.06] text-[8px] leading-none",
        missing ? "font-black text-[#ef4444]" : "font-bold text-[#e9ead7]/70",
      ].join(" ")}
    >
      <span>{label}</span>
    </div>
  );
}
