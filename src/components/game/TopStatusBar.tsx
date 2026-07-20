import type { SocketConnectionStatus } from "@/src/lib/client/use-game-room-socket";
import type { Card, GamePhase, StandardSuit } from "@/src/lib/game/types";

import { MoreMenuButton } from "./MoreMenuButton";
import { PlayingCard } from "./PlayingCard";

const GAME_PHASE_LABELS: Record<GamePhase, string> = {
  waiting_for_players: "等待玩家",
  choosing_dealer: "选庄",
  dealing: "发牌",
  heavenly_trump_bidding: "天摔",
  final_trump_bidding: "等待摔2",
  tribute: "进贡",
  taking_bottom: "拿底",
  burying_bottom: "扣底",
  playing: "牌局中",
  round_finished: "本局结束",
};

export const SUIT_LABELS: Record<StandardSuit, string> = {
  spades: "♠ 黑桃",
  hearts: "♥ 红桃",
  clubs: "♣ 梅花",
  diamonds: "♦ 方块",
};

export function phaseLabel(phase: GamePhase): string {
  return GAME_PHASE_LABELS[phase];
}

export function TopStatusBar(props: {
  buriedBottomCards: Card[];
  connectionStatus: SocketConnectionStatus;
}) {
  return (
    <header className="relative z-20 flex h-[58px] shrink-0 items-start justify-between gap-2 px-2 text-[11px] text-[#f2f7ed]">
      <div className="flex min-h-[56px] min-w-0 shrink-0 items-center gap-1 rounded-lg border border-[#f8e7a6]/80 bg-[#3f2d08]/58 px-2 py-1 shadow-sm">
        <span className="mr-0.5 text-[10px] text-[#f5d38a]">底牌</span>
        {props.buriedBottomCards.length > 0 ? (
          props.buriedBottomCards.slice(0, 8).map((card, index) => (
            <div key={card.id} className="-mr-[21px] last:mr-0" style={{ zIndex: index }}>
              <PlayingCard card={card} size="mini" />
            </div>
          ))
        ) : (
          <span className="text-[10px] text-white/36">未扣</span>
        )}
      </div>
      <div className="ml-auto flex min-w-0 items-center justify-end gap-2 overflow-hidden">
        <MoreMenuButton connectionStatus={props.connectionStatus} />
      </div>
    </header>
  );
}

export function CornerGameInfo(props: {
  roundNumber: number;
  trumpSuit: StandardSuit | null;
  defenderScore: number;
  tributeLabel: string;
}) {
  const trumpSuitColorClassName =
    props.trumpSuit === "hearts" || props.trumpSuit === "diamonds"
      ? "text-[#c1121f]"
      : "text-[#111827]";

  return (
    <div className="flex h-full items-center justify-end gap-1.5 text-[10px] text-[#f2f7ed]">
      <div className="flex items-center gap-1">
        <span className="text-white/64">第 {props.roundNumber} 局</span>
      </div>
      <span className="rounded-md border border-[#d2a84f]/50 bg-[#102c25]/82 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#f8e7a6]">
        贡 {props.tributeLabel}
      </span>
      <span
        className="rounded-md border border-[#d1d5db] bg-[#fffdf7] px-1.5 py-0.5 text-[10px] font-bold leading-none"
      >
        <span className="text-[#111827]">主</span>
        <span className="px-0.5 text-[#111827]/55">｜</span>
        <span className={props.trumpSuit ? trumpSuitColorClassName : "text-[#667085]"}>
          {props.trumpSuit ? SUIT_LABELS[props.trumpSuit] : "未定"}
        </span>
      </span>
      <div className="flex items-center">
        <span className="relative z-10 grid h-6 w-6 place-items-center rounded-full bg-[#fde68a] text-xs font-black text-[#ea580c] shadow-sm">
          分
        </span>
        <span className="-ml-2 rounded-r-md border border-[#fde68a]/70 bg-[#fff7d6] py-0.5 pl-4 pr-1.5 text-xs font-black leading-none text-[#9a3412]">
          {props.defenderScore}
        </span>
      </div>
    </div>
  );
}
