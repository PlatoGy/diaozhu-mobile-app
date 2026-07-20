import { TABLE_POSITIONS, type TrickSlot } from "@/src/lib/game/table-layout";
import type { RelativeTablePosition } from "@/src/lib/game/display";

import { PlayingCard } from "./PlayingCard";

const SLOT_PLACEMENT: Record<RelativeTablePosition, string> = {
  top: "left-1/2 top-1 -translate-x-1/2",
  bottom: "left-1/2 bottom-1 -translate-x-1/2",
  left: "left-2 top-1/2 -translate-y-1/2",
  right: "right-2 top-1/2 -translate-y-1/2",
};

export function CentralTrickArea({
  slots,
  centerHint,
}: {
  slots: Record<RelativeTablePosition, TrickSlot>;
  centerHint: string | null;
}) {
  return (
    <section className="relative h-full min-h-0 rounded-xl border border-white/16 bg-white/[0.055] shadow-inner">
      {centerHint ? (
        <div className="absolute left-1/2 top-1/2 max-w-[72%] -translate-x-1/2 -translate-y-1/2 text-center text-xs font-medium text-white/70">
          {centerHint}
        </div>
      ) : null}

      {TABLE_POSITIONS.map((position) => (
        <TrickPlaySlot key={position} slot={slots[position]} />
      ))}
    </section>
  );
}

function TrickPlaySlot({ slot }: { slot: TrickSlot }) {
  const hasCards = slot.cards.length > 0;

  return (
    <div
      className={[
        "absolute min-h-11 min-w-[102px] px-1 py-1",
        SLOT_PLACEMENT[slot.position],
      ].join(" ")}
    >
      <div className="flex min-h-[42px] items-center">
        {hasCards ? (
          slot.cards.slice(0, 4).map((card, index) => (
            <div
              key={card.id}
              className="-mr-3 last:mr-0"
              style={{ zIndex: index }}
            >
              <PlayingCard card={card} size="table" />
            </div>
          ))
        ) : null}
      </div>
    </div>
  );
}
