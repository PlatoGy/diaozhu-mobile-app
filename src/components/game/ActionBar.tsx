"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { PlayerGameStateView } from "@/src/lib/game/player-view";
import type { Team } from "@/src/lib/game/types";
import type { Card, DeclaredPlayType } from "@/src/lib/game/types";
import type { GameActionType } from "@/src/lib/realtime/protocol";

type PlayOption = {
  type: DeclaredPlayType;
  label: string;
  disabled: boolean;
  reason?: string;
};

function cardsFormDeclaredGroup(cards: readonly Card[], type: DeclaredPlayType): boolean {
  if (type === "single" || type === "loose") {
    return true;
  }

  const requiredCount: Record<"pair" | "triple" | "quad", number> = {
    pair: 2,
    triple: 3,
    quad: 4,
  };
  const first = cards[0];

  if (!first || cards.length !== requiredCount[type]) {
    return false;
  }

  return cards.every(
    (card) => card.originalSuit === first.originalSuit && card.rank === first.rank,
  );
}

function selectedCountHint(game: PlayerGameStateView, selectedCount: number): string | null {
  if (game.phase === "burying_bottom" && game.dealerSeat === game.viewerSeat) {
    return `已选择 ${selectedCount} / 8`;
  }

  if (game.phase === "tribute" && game.allowedActions.canSubmitTribute) {
    const task = game.tributeView?.givingTasks.find(
      (candidate) => candidate.id === game.allowedActions.requiredTributeTaskId,
    );

    return task ? `请选择 ${task.requiredCount} 张牌进贡，已选择 ${selectedCount}` : null;
  }

  if (game.phase === "tribute" && game.allowedActions.canSubmitReturnTribute) {
    const task = game.tributeView?.returnTasks.find(
      (candidate) => candidate.id === game.allowedActions.requiredReturnTaskId,
    );

    return task ? `请选择 ${task.requiredCount} 张牌回贡，已选择 ${selectedCount}` : null;
  }

  return null;
}

function teamLabel(team: Team): string {
  return team === "team_0_2" ? "一方" : "二方";
}

function ActionButton({
  children,
  disabled,
  onClick,
  variant = "primary",
  title,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary" | "play";
  title?: string;
}) {
  const variantClassName: Record<"primary" | "secondary" | "play", string> = {
    primary: "bg-[#f8e7a6] text-[#24320f] active:translate-y-px",
    secondary: "border border-[#f8e7a6]/55 bg-[#102c25]/80 text-[#f8e7a6]",
    play: "w-auto min-w-[72px] max-w-[116px] rounded-full bg-[#d6a33a] px-5 font-black text-white shadow-[0_5px_14px_rgba(0,0,0,0.24)] [-webkit-text-stroke:0.7px_#6b3f1d] active:translate-y-px",
  };
  const sizeClassName =
    variant === "play"
      ? "h-10"
      : "h-10 min-w-[104px] rounded-full px-4";

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={[
        "relative z-50 touch-manipulation",
        sizeClassName,
        "text-sm font-semibold shadow-sm transition",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variantClassName[variant],
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function playableOptionForSelection(
  playOptions: readonly PlayOption[],
  selected: readonly Card[],
): { type: DeclaredPlayType; disabled: boolean; reason?: string } | null {
  const validOptions = playOptions.map((option) => {
    const formDisabled = !cardsFormDeclaredGroup(selected, option.type);
    const disabled = option.disabled || formDisabled;

    return {
      type: option.type,
      disabled,
      reason: formDisabled ? "所选牌不能组成该组合" : option.reason,
    };
  });
  const playable = validOptions.find((option) => !option.disabled);

  return playable ?? validOptions[0] ?? null;
}

export function ActionBar(props: {
  game: PlayerGameStateView;
  selected: Card[];
  selectedIds: string[];
  bidEnabled: boolean;
  error: string | null;
  playOptions: PlayOption[];
  submit: (actionType: GameActionType, payload?: unknown) => Promise<void>;
}) {
  const [popupError, setPopupError] = useState<string | null>(null);
  const ownSeat = props.game.viewerSeat;
  const tributeAction = props.game.allowedActions.canSubmitTribute
    ? "SUBMIT_TRIBUTE"
    : props.game.allowedActions.canSubmitReturnTribute
      ? "SUBMIT_RETURN_TRIBUTE"
      : null;
  const tributeTaskId =
    props.game.allowedActions.requiredTributeTaskId ??
    props.game.allowedActions.requiredReturnTaskId;
  const hint = selectedCountHint(props.game, props.selectedIds.length);
  const playOption = playableOptionForSelection(props.playOptions, props.selected);

  useEffect(() => {
    if (!props.error) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPopupError(props.error);
    const timer = setTimeout(() => {
      setPopupError(null);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [props.error]);

  return (
    <div className="pointer-events-auto relative z-40 flex min-h-11 flex-col items-center justify-end gap-1">
      {popupError ? (
        <div className="absolute bottom-12 left-1/2 z-[70] max-w-[78vw] -translate-x-1/2 rounded-xl border border-[#f6c453]/70 bg-[#2a1c10]/92 px-4 py-2 text-center text-xs font-semibold text-[#fff7d6] shadow-[0_8px_24px_rgba(0,0,0,0.34)]">
          {popupError}
        </div>
      ) : hint ? (
        <div className="rounded-full bg-[#102c25]/80 px-3 py-1 text-xs font-medium text-[#f8fff4]/85">
          {hint}
        </div>
      ) : null}

      <div className="flex max-w-[82vw] items-center justify-center gap-2 overflow-x-auto pb-1">
        {props.game.phase === "waiting_for_players" ? (
          <ActionButton
            onClick={() => props.submit("SET_READY", { ready: !props.game.readyState[ownSeat] })}
          >
            {props.game.readyState[ownSeat] ? "取消准备" : "准备"}
          </ActionButton>
        ) : null}

        {props.game.phase === "round_finished" ? (
          <ActionButton onClick={() => props.submit("PREPARE_NEXT_ROUND")}>下一局</ActionButton>
        ) : null}

        {props.game.phase === "choosing_dealer" ? (
          <>
            {props.game.dealerSelection ? (
              <span className="whitespace-nowrap rounded-full bg-[#102c25]/80 px-3 py-2 text-xs text-[#f8fff4]/85">
                {teamLabel(props.game.dealerSelection.winningTeam)}选庄
              </span>
            ) : null}
            {props.game.allowedActions.canChooseDealer ? (
              <ActionButton onClick={() => props.submit("CHOOSE_DEALER")}>我坐庄</ActionButton>
            ) : null}
            <ActionButton variant="secondary" onClick={() => props.submit("RESOLVE_DEALER_SELECTION")}>
              确定坐庄
            </ActionButton>
            {props.game.dealerSelection?.resolvedDealerSeat !== null ? (
              <ActionButton onClick={() => props.submit("START_NEXT_ROUND")}>开始下一局</ActionButton>
            ) : null}
          </>
        ) : null}

        {props.game.phase === "dealing" ? (
          <ActionButton onClick={() => props.submit("DEAL_CARDS")}>完成发牌</ActionButton>
        ) : null}

        {props.game.phase === "heavenly_trump_bidding" ? (
          props.game.allowedActions.canResolveHeavenlyTrump ? (
            <>
              <ActionButton onClick={() => props.submit("RESOLVE_HEAVENLY_TRUMP", { accept: true })}>
                天摔
              </ActionButton>
              <ActionButton
                variant="secondary"
                onClick={() => props.submit("RESOLVE_HEAVENLY_TRUMP", { accept: false })}
              >
                跳过
              </ActionButton>
            </>
          ) : (
            <span className="rounded-full bg-[#102c25]/80 px-3 py-2 text-xs text-[#f8fff4]/85">
              等待天摔选择
            </span>
          )
        ) : null}

        {props.game.phase === "dealing" || props.game.phase === "final_trump_bidding" ? (
          <>
            <ActionButton
              disabled={!props.bidEnabled}
              title={props.bidEnabled ? undefined : "请选择 1 至 4 张同花色的 2"}
              onClick={() => props.submit("PLACE_TRUMP_BID", { cardIds: props.selectedIds })}
            >
              摔 2
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => props.submit("RESOLVE_TRUMP")}>
              定主
            </ActionButton>
          </>
        ) : null}

        {props.game.phase === "tribute" && tributeAction && tributeTaskId ? (
          <ActionButton
            onClick={() => props.submit(tributeAction, { taskId: tributeTaskId, cardIds: props.selectedIds })}
          >
            {tributeAction === "SUBMIT_TRIBUTE" ? "进贡" : "回贡"}
          </ActionButton>
        ) : props.game.phase === "tribute" ? (
          <span className="rounded-full bg-[#102c25]/80 px-3 py-2 text-xs text-[#f8fff4]/85">
            等待其他玩家完成进贡或回贡
          </span>
        ) : null}

        {props.game.phase === "taking_bottom" ? (
          props.game.dealerSeat === ownSeat ? (
            <ActionButton onClick={() => props.submit("TAKE_BOTTOM")}>拿底牌</ActionButton>
          ) : (
            <span className="rounded-full bg-[#102c25]/80 px-3 py-2 text-xs text-[#f8fff4]/85">
              等待拿底
            </span>
          )
        ) : null}

        {props.game.phase === "burying_bottom" ? (
          props.game.dealerSeat === ownSeat ? (
            <ActionButton
              disabled={props.selectedIds.length !== 8}
              onClick={() => props.submit("BURY_BOTTOM", { cardIds: props.selectedIds })}
            >
              扣底
            </ActionButton>
          ) : (
            <span className="rounded-full bg-[#102c25]/80 px-3 py-2 text-xs text-[#f8fff4]/85">
              等待扣底
            </span>
          )
        ) : null}

        {props.game.phase === "playing" ? (
          props.game.allowedActions.canPlayCards ? (
            <ActionButton
              variant="play"
              disabled={!playOption || playOption.disabled || props.selectedIds.length === 0}
              title={!playOption ? "请选择要出的牌" : playOption.disabled ? playOption.reason : undefined}
              onClick={() =>
                playOption
                  ? props.submit("PLAY_CARDS", {
                      cardIds: props.selectedIds,
                      declaredType: playOption.type,
                    })
                  : Promise.resolve()
              }
            >
              出牌
            </ActionButton>
          ) : null
        ) : null}
      </div>
    </div>
  );
}
