import { TABLE_POSITIONS, type TrickSlot } from "@/src/lib/game/table-layout";
import type { RelativeTablePosition } from "@/src/lib/game/display";
import type { Card, Seat } from "@/src/lib/game/types";
import type { OptimisticSlotMessage } from "@/src/lib/client/optimistic-effects";

import { PlayingCard } from "./PlayingCard";
import { TurnCountdownBadge } from "./TurnCountdownBadge";

const SLOT_PLACEMENT: Record<RelativeTablePosition, string> = {
  top: "left-1/2 top-1 -translate-x-1/2",
  bottom: "left-1/2 bottom-1 -translate-x-1/2",
  left: "left-2 top-1/2 -translate-y-1/2",
  right: "right-2 top-1/2 -translate-y-1/2",
};

export type TrickSlotMessage = OptimisticSlotMessage;

export function CentralTrickArea({
  slots,
  centerHint,
  countdownSeats,
  countdownSeconds,
  slotMessages,
  slotCards,
  centerCards,
}: {
  slots: Record<RelativeTablePosition, TrickSlot>;
  centerHint: string | null;
  countdownSeats: readonly TrickSlot["seat"][];
  countdownSeconds: number;
  slotMessages?: Partial<Record<Seat, TrickSlotMessage>>;
  slotCards?: Partial<Record<Seat, Card[]>>;
  centerCards?: readonly Card[];
}) {
  const countdownSeatSet = new Set<Seat>(countdownSeats);
  const hasCenterContent = Boolean(centerHint) || Boolean(centerCards?.length);

  return (
    <section className="relative h-full min-h-0 rounded-xl border border-white/16 bg-white/[0.055] shadow-inner">
      {hasCenterContent ? (
        <div className="absolute left-1/2 top-1/2 z-10 flex max-w-[78%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center">
          {centerHint ? (
            <div className="text-xs font-black text-[#f87171]">
              {centerHint}
            </div>
          ) : null}
          {centerCards?.length ? (
            <div className="flex items-center rounded-lg border border-[#d2a84f]/70 bg-[#221b09]/72 px-3 py-2 shadow-[0_8px_22px_rgba(0,0,0,0.25)]">
              {centerCards.slice(0, 8).map((card, index) => (
                <div
                  key={card.id}
                  className="-mr-5 last:mr-0"
                  style={{ zIndex: index }}
                >
                  <PlayingCard card={card} size="table" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {TABLE_POSITIONS.map((position) => (
        <TrickPlaySlot
          key={position}
          slot={slots[position]}
          countdownSeconds={countdownSeconds}
          slotMessage={slotMessages?.[slots[position].seat] ?? null}
          cards={slotCards?.[slots[position].seat] ?? null}
          showCountdown={countdownSeatSet.has(slots[position].seat)}
        />
      ))}
    </section>
  );
}

function TrickPlaySlot({
  slot,
  countdownSeconds,
  slotMessage,
  cards,
  showCountdown,
}: {
  slot: TrickSlot;
  countdownSeconds: number;
  slotMessage: TrickSlotMessage | null;
  cards: Card[] | null;
  showCountdown: boolean;
}) {
  const displayCards = cards ?? slot.cards;
  const hasCards = displayCards.length > 0;
  const messageClassName =
    slotMessage?.tone === "ready" || slotMessage?.tone === "skip"
      ? "px-2 py-1 text-base font-black text-[#f6c453] drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)]"
      : "rounded-lg bg-[#fffdf7] px-3 py-1.5 text-sm font-black text-[#3f2d08] shadow-[0_4px_12px_rgba(0,0,0,0.2)]";

  return (
    <div
      className={[
        "absolute min-h-11 min-w-[102px] px-1 py-1",
        SLOT_PLACEMENT[slot.position],
      ].join(" ")}
    >
      <div className="flex min-h-[42px] items-center">
        {hasCards ? (
          displayCards.slice(0, 4).map((card, index) => (
            <div
              key={card.id}
              className="-mr-3 last:mr-0"
              style={{ zIndex: index }}
            >
              <PlayingCard card={card} size="table" />
            </div>
          ))
        ) : showCountdown ? (
          <TurnCountdownBadge seconds={countdownSeconds} size="compact" />
        ) : slotMessage ? (
          <div className={messageClassName}>
            {slotMessage.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
