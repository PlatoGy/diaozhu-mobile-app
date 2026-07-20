"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useGameRoomState } from "@/src/lib/client/use-game-room-state";
import { useActionCountdown } from "@/src/lib/client/use-action-countdown";
import {
  applyOptimisticEffectsToView,
  hasOptimisticEffect,
  mergeOptimisticSlotMessages,
  optimisticSlotCards,
  removeOptimisticEffectByRequestId,
  type OptimisticGameEffect,
} from "@/src/lib/client/optimistic-effects";
import { nowMs } from "@/src/lib/client/action-performance";
import { sortHandForDisplay } from "@/src/lib/game/display";
import { getDisabledFollowCardIds } from "@/src/lib/game/follow-selection";
import type { PlayerGameStateView } from "@/src/lib/game/player-view";
import { buildRelativePlayers, buildTrickSlots } from "@/src/lib/game/table-layout";
import { getPartnerSeat, getTeamForSeat } from "@/src/lib/game/teams";
import type {
  Card,
  DeclaredPlayType,
  GroupType,
  LeadPrivileges,
  PlayCategory,
  Seat,
  StandardSuit,
  TrumpBiddingResponse,
} from "@/src/lib/game/types";
import type { GameActionType } from "@/src/lib/realtime/protocol";

import { ActionBar } from "./ActionBar";
import { CentralTrickArea, type TrickSlotMessage } from "./CentralTrickArea";
import { MissingSuitsPanel, PlayerBadge, type PlayerMissingMarks } from "./PlayerBadge";
import { PlayerHand } from "./PlayerHand";
import { PortraitOrientationOverlay } from "./PortraitOrientationOverlay";
import { RoundResultPanel } from "./RoundResultPanel";
import { CornerGameInfo, TopStatusBar, phaseLabel } from "./TopStatusBar";

type GamePageClientProps = {
  roomId: string;
  playerToken: string;
};

function seatName(players: Array<{ seat: Seat; nickname: string }>, seat: Seat): string {
  return players.find((player) => player.seat === seat)?.nickname ?? `Seat ${seat}`;
}

function selectedCards(hand: readonly Card[], selectedCardIds: readonly string[]): Card[] {
  const byId = new Map(hand.map((card) => [card.id, card]));

  return selectedCardIds.flatMap((cardId) => {
    const card = byId.get(cardId);
    return card ? [card] : [];
  });
}

const PLAY_DECLARATIONS = new Set<DeclaredPlayType>([
  "single",
  "pair",
  "triple",
  "quad",
  "loose",
]);

const SUIT_SYMBOLS: Record<StandardSuit, string> = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
};

function playCardsPayload(
  payload: unknown,
): { cardIds: string[]; declaredType: DeclaredPlayType } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (
    !Array.isArray(record.cardIds) ||
    !record.cardIds.every((cardId) => typeof cardId === "string") ||
    typeof record.declaredType !== "string" ||
    !PLAY_DECLARATIONS.has(record.declaredType as DeclaredPlayType)
  ) {
    return null;
  }

  return {
    cardIds: record.cardIds,
    declaredType: record.declaredType as DeclaredPlayType,
  };
}

function cardIdsPayload(payload: unknown): string[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (
    !Array.isArray(record.cardIds) ||
    !record.cardIds.every((cardId) => typeof cardId === "string")
  ) {
    return null;
  }

  return record.cardIds;
}

function canBidTwos(cards: readonly Card[]): boolean {
  if (cards.length < 1 || cards.length > 4) {
    return false;
  }

  const first = cards[0];

  return Boolean(
    first &&
      first.originalSuit !== "joker" &&
      cards.every((card) => card.rank === "2" && card.originalSuit === first.originalSuit),
  );
}

function trumpBidResponseFromSelection(
  seat: Seat,
  cards: readonly Card[],
): TrumpBiddingResponse | null {
  if (!canBidTwos(cards)) {
    return null;
  }

  const first = cards[0];

  if (!first || first.originalSuit === "joker") {
    return null;
  }

  return {
    type: "bid",
    bid: {
      seat,
      suit: first.originalSuit,
      count: cards.length as 1 | 2 | 3 | 4,
      cardIds: cards.map((card) => card.id),
    },
  };
}

function declaredTypeOptions(
  count: number,
  isLeader: boolean,
): Array<{ type: DeclaredPlayType; label: string }> {
  if (count === 1) {
    return [{ type: "single", label: "出单张" }];
  }

  if (count === 2) {
    return isLeader
      ? [{ type: "pair", label: "出对子" }]
      : [
          { type: "pair", label: "出对子" },
          { type: "loose", label: "按散牌出" },
        ];
  }

  if (count === 3) {
    return isLeader
      ? [{ type: "triple", label: "出三个" }]
      : [
          { type: "triple", label: "出三个" },
          { type: "loose", label: "按散牌出" },
        ];
  }

  if (count === 4) {
    return isLeader
      ? [{ type: "quad", label: "出四个" }]
      : [
          { type: "quad", label: "出四个" },
          { type: "loose", label: "按散牌出" },
        ];
  }

  return [];
}

function categoryForCards(cards: readonly Card[], trumpSuit: StandardSuit | null): PlayCategory | null {
  const first = cards[0];

  if (!first || !trumpSuit) {
    return null;
  }

  if (
    first.originalSuit === "joker" ||
    first.originalSuit === trumpSuit ||
    first.rank === "2" ||
    first.rank === "3" ||
    first.rank === "5"
  ) {
    return "trump";
  }

  return first.originalSuit;
}

function hasPrivilege(
  privileges: LeadPrivileges | null,
  cards: readonly Card[],
  trumpSuit: StandardSuit | null,
  type: DeclaredPlayType,
): boolean {
  if (!privileges || type === "single" || type === "loose") {
    return true;
  }

  const category = categoryForCards(cards, trumpSuit);

  if (!category) {
    return true;
  }

  if (type === "pair" || type === "triple" || type === "quad") {
    return privileges[category][type];
  }

  return true;
}

type MissingMarksBySeat = Partial<Record<Seat, PlayerMissingMarks>>;

function addMissingMark(
  marks: MissingMarksBySeat,
  seat: Seat,
  category: PlayCategory,
  groupType: GroupType,
) {
  const seatMarks = marks[seat] ?? {};
  const categoryMarks = seatMarks[category] ?? {};

  categoryMarks[groupType] = true;
  seatMarks[category] = categoryMarks;
  marks[seat] = seatMarks;
}

function buildMissingMarks(game: PlayerGameStateView): MissingMarksBySeat {
  const marks: MissingMarksBySeat = {};
  const publicPlays = [
    ...game.trickHistory.flatMap((trick) => trick.plays),
    ...(game.currentTrick?.plays ?? []),
  ];

  for (const play of publicPlays) {
    for (const loss of play.privilegeLosses) {
      addMissingMark(marks, loss.seat, loss.category, loss.groupType);
    }
  }

  return marks;
}

function trumpBiddingMessage(response: TrumpBiddingResponse): TrickSlotMessage | null {
  if (response.type === "skipped") {
    return {
      text: "跳过",
      tone: "skip",
    };
  }

  if (response.type === "bid") {
    return {
      text: `${response.bid.isHeavenly ? "天摔" : "摔2"} ${SUIT_SYMBOLS[response.bid.suit]}×${response.bid.count}`,
      tone: "bid",
    };
  }

  return null;
}

function buildTrumpBiddingMessages(
  game: PlayerGameStateView,
): Partial<Record<Seat, TrickSlotMessage>> {
  const messages: Partial<Record<Seat, TrickSlotMessage>> = {};
  const responses = game.trumpBiddingRound?.responses;

  if (!responses) {
    return messages;
  }

  for (const seat of [0, 1, 2, 3] as const satisfies readonly Seat[]) {
    const message = trumpBiddingMessage(responses[seat]);

    if (message) {
      messages[seat] = message;
    }
  }

  return messages;
}

function buildReadyMessages(game: PlayerGameStateView): Partial<Record<Seat, TrickSlotMessage>> {
  if (game.phase !== "waiting_for_players") {
    return {};
  }

  const messages: Partial<Record<Seat, TrickSlotMessage>> = {};

  for (const seat of [0, 1, 2, 3] as const satisfies readonly Seat[]) {
    if (game.readyState[seat]) {
      messages[seat] = {
        text: "已准备",
        tone: "ready",
      };
    }
  }

  return messages;
}

function buildTrumpBidCards(game: PlayerGameStateView): Partial<Record<Seat, Card[]>> {
  if (
    !game.highestTrumpBid ||
    game.highestTrumpBidCards.length === 0 ||
    (game.phase !== "dealing" && game.phase !== "final_trump_bidding")
  ) {
    return {};
  }

  return {
    [game.highestTrumpBid.seat]: game.highestTrumpBidCards,
  };
}

export function GamePageClient({ roomId, playerToken }: GamePageClientProps) {
  const { view, loading, error, connectionStatus, pendingAction, refresh, submitAction } = useGameRoomState({
    roomId,
    playerToken,
  });
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [optimisticEffects, setOptimisticEffects] = useState<OptimisticGameEffect[]>([]);
  const playSubmitInFlightRef = useRef(false);
  const trumpSubmitInFlightRef = useRef(false);
  const readySubmitInFlightRef = useRef(false);

  const state = view;
  const authoritativeGame = state?.game;
  const game = useMemo(
    () => (authoritativeGame ? applyOptimisticEffectsToView(authoritativeGame, optimisticEffects) : null),
    [authoritativeGame, optimisticEffects],
  );
  const hand = useMemo(() => game?.ownHand ?? [], [game?.ownHand]);
  const trumpSuit = game?.trumpSuit ?? null;
  const provisionalTrumpSuit = game?.highestTrumpBid?.suit ?? null;
  const sortedHand = useMemo(
    () => sortHandForDisplay(hand, trumpSuit, provisionalTrumpSuit),
    [hand, provisionalTrumpSuit, trumpSuit],
  );
  const selected = useMemo(() => selectedCards(hand, selectedCardIds), [hand, selectedCardIds]);
  const disabledFollowCardIds = useMemo(() => {
    const currentTrick = game?.currentTrick;
    const viewerAlreadyPlayed = Boolean(
      game && currentTrick?.plays.some((play) => play.seat === game.viewerSeat),
    );

    return getDisabledFollowCardIds({
      hand,
      trumpSuit: game?.trumpSuit ?? null,
      leadCategory: currentTrick?.leadCategory ?? null,
      expectedCardCount: currentTrick?.expectedCardCount ?? null,
      shouldFollowLead: Boolean(
        game?.phase === "playing" &&
          currentTrick &&
          currentTrick.leaderSeat !== game.viewerSeat &&
          !viewerAlreadyPlayed &&
          currentTrick.plays.length > 0,
      ),
    });
  }, [game, hand]);
  const turnCountdownKey =
    game?.phase === "playing" && game.currentTrick?.status === "in_progress"
      ? `${game.currentTrick.trickNumber}:${game.currentTrick.currentTurnSeat}:${game.currentTrick.plays.length}`
      : null;
  const trumpBiddingRound = game?.trumpBiddingRound ?? null;
  const trumpActionPending = hasOptimisticEffect(
    optimisticEffects,
    (effect) => effect.kind === "slot_message" && Boolean(effect.hidesTrumpActions),
  );
  const pendingTrumpSeats = useMemo(() => {
    if (
      !game ||
      !trumpBiddingRound ||
      (game.phase !== "dealing" && game.phase !== "final_trump_bidding")
    ) {
      return [];
    }

    return ([0, 1, 2, 3] as const satisfies readonly Seat[]).filter(
      (seat) =>
        trumpBiddingRound.responses[seat].type === "pending" &&
        !(seat === game.viewerSeat && trumpActionPending),
    );
  }, [game, trumpActionPending, trumpBiddingRound]);
  const trumpCountdownKey =
    game && trumpBiddingRound && pendingTrumpSeats.length > 0
      ? [
          "trump",
          game.phase,
          trumpBiddingRound.batchNumber,
          trumpBiddingRound.cardsPerPlayerDealt,
          game.highestTrumpBid?.seat ?? "none",
          game.highestTrumpBid?.suit ?? "none",
          game.highestTrumpBid?.count ?? 0,
          pendingTrumpSeats.join(","),
        ].join(":")
      : null;
  const countdownSeconds = useActionCountdown({
    key: turnCountdownKey ?? trumpCountdownKey,
    durationSeconds: 15,
  });

  useEffect(() => {
    const handIds = new Set(hand.map((card) => card.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCardIds((current) => current.filter((cardId) => handIds.has(cardId)));
  }, [hand]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCardIds([]);
  }, [game?.phase]);

  useEffect(() => {
    const disabled = new Set(disabledFollowCardIds);

    if (disabled.size === 0) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCardIds((current) => current.filter((cardId) => !disabled.has(cardId)));
  }, [disabledFollowCardIds]);

  async function submit(actionType: GameActionType, payload: unknown = {}) {
    if (actionType === "SET_READY") {
      if (
        !authoritativeGame ||
        hasOptimisticEffect(optimisticEffects, (effect) => effect.kind === "ready") ||
        pendingAction ||
        readySubmitInFlightRef.current
      ) {
        return;
      }

      const requestId = crypto.randomUUID();
      const optimisticEffect: OptimisticGameEffect = {
        kind: "ready",
        requestId,
        seat: authoritativeGame.viewerSeat,
      };
      readySubmitInFlightRef.current = true;
      setOptimisticEffects((current) => [...current, optimisticEffect]);

      let result: PlayerGameStateView | null = null;

      try {
        result = await submitAction({ actionType, payload, requestId });
      } finally {
        setOptimisticEffects((current) =>
          removeOptimisticEffectByRequestId(current, requestId),
        );
        readySubmitInFlightRef.current = false;
      }

      if (!result) {
        void refresh();
      }
      return;
    }

    if (actionType === "PLAY_CARDS") {
      if (
        !authoritativeGame ||
        hasOptimisticEffect(optimisticEffects, (effect) => effect.kind === "play_cards") ||
        pendingAction ||
        playSubmitInFlightRef.current
      ) {
        return;
      }

      const parsedPayload = playCardsPayload(payload);

      if (!parsedPayload) {
        return;
      }

      const cardsToPlay = selectedCards(authoritativeGame.ownHand, parsedPayload.cardIds);

      if (cardsToPlay.length !== parsedPayload.cardIds.length) {
        return;
      }

      const requestId = crypto.randomUUID();
      playSubmitInFlightRef.current = true;
      const optimisticEffect: OptimisticGameEffect = {
        kind: "play_cards",
        requestId,
        seat: authoritativeGame.viewerSeat,
        cards: cardsToPlay,
        cardIds: parsedPayload.cardIds,
        declaredType: parsedPayload.declaredType,
        baseVersion: authoritativeGame.stateVersion,
        startedAt: nowMs(),
      };
      setOptimisticEffects((current) => [...current, optimisticEffect]);
      setSelectedCardIds([]);

      let result: PlayerGameStateView | null = null;

      try {
        result = await submitAction({ actionType, payload, requestId });
      } finally {
        setOptimisticEffects((current) =>
          removeOptimisticEffectByRequestId(current, requestId),
        );
        playSubmitInFlightRef.current = false;
      }

      if (result) {
        setSelectedCardIds([]);
        return;
      }

      void refresh();
      setSelectedCardIds(parsedPayload.cardIds);
      return;
    }

    if (actionType === "PLACE_TRUMP_BID" || actionType === "SKIP_TRUMP_BID") {
      if (
        !authoritativeGame ||
        hasOptimisticEffect(
          optimisticEffects,
          (effect) => effect.kind === "slot_message" && Boolean(effect.hidesTrumpActions),
        ) ||
        pendingAction ||
        trumpSubmitInFlightRef.current
      ) {
        return;
      }

      const requestId = crypto.randomUUID();
      const selectedIdsBeforeSubmit = [...selectedCardIds];
      const playableBidCards = [
        ...authoritativeGame.highestTrumpBidCards,
        ...authoritativeGame.ownHand,
      ];
      const response =
        actionType === "SKIP_TRUMP_BID"
          ? ({ type: "skipped" } satisfies TrumpBiddingResponse)
          : (() => {
              const cardIds = cardIdsPayload(payload);

              if (!cardIds) {
                return null;
              }

              const cardIdsForSubmit =
                authoritativeGame.highestTrumpBid?.seat === authoritativeGame.viewerSeat
                  ? [...authoritativeGame.highestTrumpBid.cardIds, ...cardIds]
                  : cardIds;
              const bidCards = selectedCards(playableBidCards, cardIdsForSubmit);

              if (bidCards.length !== cardIdsForSubmit.length) {
                return null;
              }

              return trumpBidResponseFromSelection(authoritativeGame.viewerSeat, bidCards);
            })();

      if (!response) {
        return;
      }
      const slotMessage = trumpBiddingMessage(response);

      if (!slotMessage) {
        return;
      }

      trumpSubmitInFlightRef.current = true;
      const optimisticEffect: OptimisticGameEffect = {
        kind: "slot_message",
        requestId,
        seat: authoritativeGame.viewerSeat,
        message: slotMessage,
        cards: response.type === "bid" ? selectedCards(playableBidCards, response.bid.cardIds) : undefined,
        hiddenCardIds: response.type === "bid" ? response.bid.cardIds : undefined,
        hidesTrumpActions: true,
        restoreSelectedCardIds: selectedIdsBeforeSubmit,
      };
      setOptimisticEffects((current) => [...current, optimisticEffect]);
      setSelectedCardIds([]);

      let result: PlayerGameStateView | null = null;

      try {
        result = await submitAction({
          actionType,
          payload:
            response.type === "bid"
              ? {
                  cardIds: response.bid.cardIds,
                }
              : payload,
          requestId,
        });
      } finally {
        setOptimisticEffects((current) =>
          removeOptimisticEffectByRequestId(current, requestId),
        );
        trumpSubmitInFlightRef.current = false;
      }

      if (result) {
        setSelectedCardIds([]);
        return;
      }

      if (actionType === "PLACE_TRUMP_BID") {
        setSelectedCardIds(selectedIdsBeforeSubmit);
      }
      return;
    }

    const result = await submitAction({ actionType, payload });

    if (result) {
      setSelectedCardIds([]);
    }
  }

  function toggleCard(cardId: string) {
    if (disabledFollowCardIds.includes(cardId)) {
      return;
    }

    setSelectedCardIds((current) =>
      current.includes(cardId)
        ? current.filter((candidate) => candidate !== cardId)
        : [...current, cardId],
    );
  }

  if (loading && !state) {
    return (
      <main className="grid h-dvh w-dvw place-items-center bg-[#0b3027] text-white">
        正在进入牌桌...
      </main>
    );
  }

  if (!state || !game) {
    return (
      <main className="grid h-dvh w-dvw place-items-center bg-[#0b3027] px-6 text-center text-white">
        <div>
          <h1 className="text-xl font-semibold">无法进入牌桌</h1>
          <p className="mt-3 text-sm text-white/80">{error ?? "牌局状态读取失败"}</p>
        </div>
      </main>
    );
  }

  const viewerSeat = game.viewerSeat;
  const currentTurnSeat = game.currentTrick?.currentTurnSeat ?? null;
  const tableCountdownSeats =
    game.phase === "playing" && currentTurnSeat !== null && currentTurnSeat !== viewerSeat
      ? [currentTurnSeat]
      : game.phase === "dealing" || game.phase === "final_trump_bidding"
        ? pendingTrumpSeats.filter((seat) => seat !== viewerSeat)
        : [];
  const relativePlayers = buildRelativePlayers({
    roomId,
    viewerSeat,
    players: state.players,
    cardCounts: game.players,
    readyState: game.readyState,
    dealerSeat: game.dealerSeat,
    currentTurnSeat,
  });
  const displayedTrick = {
    plays: game.currentTrick?.plays ?? [],
    winnerSeat: null,
  };
  const trickSlots = buildTrickSlots({
    viewerSeat,
    relativePlayers,
    plays: displayedTrick.plays,
    winnerSeat: displayedTrick.winnerSeat,
  });
  const selectedIds = selected.map((card) => card.id);
  const isLeader = game.currentTrick?.plays.length === 0;
  const playOptions = declaredTypeOptions(selected.length, isLeader).map((option) => {
    const privileged = hasPrivilege(game.ownLeadPrivileges, selected, game.trumpSuit, option.type);

    return {
      ...option,
      disabled: !privileged,
      reason: privileged ? undefined : "当前组合资格已失去",
    };
  });
  const highlightedCardIds =
    game.allowedActions.tributeCandidateCardIds ??
    game.allowedActions.returnOptionCardIds ??
    [];
  const missingMarks = buildMissingMarks(game);
  const slotMessages =
    game.phase === "waiting_for_players"
      ? mergeOptimisticSlotMessages(buildReadyMessages(game), optimisticEffects)
      : mergeOptimisticSlotMessages(buildTrumpBiddingMessages(game), optimisticEffects);
  const slotCards = {
    ...buildTrumpBidCards(game),
    ...optimisticSlotCards(optimisticEffects),
  };
  const centerHint = centerHintForGame(game, state.players);
  const roundResultVisible = game.phase === "round_finished" && game.roundResult;
  const tributeLabel = tributeLabelForGame(game);

  return (
    <main className="h-dvh w-dvw overflow-hidden bg-[#0b3027] text-[#f8fff4]">
      <PortraitOrientationOverlay />
      <div
        className="relative grid h-full grid-rows-[58px_minmax(118px,1fr)_44px_minmax(128px,38vh)] gap-1 overflow-hidden"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingRight: "max(8px, env(safe-area-inset-right))",
          paddingBottom: "max(2px, env(safe-area-inset-bottom))",
          paddingLeft: "max(8px, env(safe-area-inset-left))",
        }}
      >
        <TopStatusBar
          buriedBottomCards={game.buriedBottomCards}
          connectionStatus={connectionStatus}
        />

        <div className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2">
          <PlayerBadge
            player={relativePlayers.top}
            placement="top"
            trumpSuit={game.trumpSuit}
            trumpBid={null}
            missingMarks={missingMarks[relativePlayers.top.seat]}
          />
        </div>

        <section className="game-table-section row-start-2 row-end-4 grid min-h-0 grid-cols-[112px_minmax(0,1fr)_112px] items-center gap-1 pb-0 pt-1">
          <div className="col-start-1 flex -translate-y-[10%] items-center justify-start">
            <PlayerBadge
              player={relativePlayers.left}
              placement="left"
              trumpSuit={game.trumpSuit}
              trumpBid={null}
              missingMarks={missingMarks[relativePlayers.left.seat]}
            />
          </div>

          <div className="game-table-wrap relative col-start-2 flex h-full min-h-0 items-start justify-center px-1 pb-0 pt-2">
            <div className="game-table-frame relative h-full min-h-[150px] w-full">
              <CentralTrickArea
                slots={trickSlots}
                centerHint={displayedTrick.plays.length === 0 ? centerHint : null}
                countdownSeats={tableCountdownSeats}
                countdownSeconds={countdownSeconds}
                slotMessages={slotMessages}
                slotCards={slotCards}
                centerCards={game.pendingBottomCards}
              />
            </div>
            {roundResultVisible && game.roundResult ? (
              <RoundResultPanel
                result={game.roundResult}
                winnerName={seatName(state.players, game.roundResult.lastTrickWinnerSeat)}
              />
            ) : null}
          </div>

          <div className="col-start-3 flex -translate-y-[10%] items-center justify-end">
            <PlayerBadge
              player={relativePlayers.right}
              placement="right"
              trumpSuit={game.trumpSuit}
              trumpBid={null}
              missingMarks={missingMarks[relativePlayers.right.seat]}
            />
          </div>
        </section>

        <footer className="relative row-start-4 grid min-h-0 grid-rows-[minmax(0,1fr)_26px] gap-1">
          <div className="game-action-anchor pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-[calc(100%+2px)]">
            <ActionBar
              game={game}
              selected={selected}
              selectedIds={selectedIds}
              bidEnabled={canBidTwos(selected)}
              error={error}
              pendingActionType={pendingAction?.actionType ?? null}
              trumpActionPending={trumpActionPending}
              countdownSeconds={countdownSeconds}
              playOptions={playOptions}
              submit={submit}
            />
          </div>
          <div className="grid min-h-0 grid-cols-[56px_minmax(0,1fr)_92px] gap-2">
            <div className="flex min-h-0 items-end justify-center pb-1">
              <div
                className={[
                  "relative grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-[#102017]",
                  relativePlayers.bottom.avatar.gradientClassName,
                  relativePlayers.bottom.active ? "animate-pulse opacity-[0.65]" : "",
                ].join(" ")}
              >
                {relativePlayers.bottom.avatar.symbol}
                {relativePlayers.bottom.dealer ? (
                  <span className="absolute -right-1 -top-1 rounded-full border border-[#fff7cc] bg-[#fde68a] px-1 text-[10px] font-black leading-4 text-[#7c2d12] shadow">
                    庄
                  </span>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 px-0 pb-0 pt-0">
              <PlayerHand
                cards={sortedHand}
                selectedCardIds={selectedCardIds}
                highlightedCardIds={highlightedCardIds}
                disabledCardIds={disabledFollowCardIds}
                onToggleCard={toggleCard}
              />
            </div>
            <div className="flex min-h-0 items-end justify-end pb-1">
              <MissingSuitsPanel
                marks={missingMarks[viewerSeat] ?? {}}
                trumpSuit={game.trumpSuit}
              />
            </div>
          </div>
          <div className="grid min-h-0 grid-cols-[minmax(110px,180px)_minmax(0,1fr)] items-center rounded-xl bg-[#061e19]/72 px-2 pb-0 pt-0">
            <span className="w-fit min-w-[72px] max-w-[170px] truncate rounded-full border border-[#d2a84f]/55 bg-[#08271f]/80 px-2 py-0.5 text-center text-[11px] font-semibold leading-tight text-[#f7f0c6] shadow-sm">
              {relativePlayers.bottom.nickname}
            </span>
            <CornerGameInfo
              roundNumber={game.roundNumber}
              trumpSuit={game.trumpSuit}
              defenderScore={game.defenderScore}
              tributeLabel={tributeLabel}
            />
          </div>
        </footer>
      </div>
    </main>
  );
}

function tributeLabelForGame(game: PlayerGameStateView): string {
  const ownSeats = new Set<Seat>([game.viewerSeat, getPartnerSeat(game.viewerSeat)]);
  const tributeView = game.tributeView;

  if (tributeView) {
    const eatingCount = tributeView.givingTasks
      .filter((task) => ownSeats.has(task.receiverSeat))
      .reduce((total, task) => total + task.requiredCount, 0);
    const givingCount = tributeView.givingTasks
      .filter((task) => ownSeats.has(task.giverSeat))
      .reduce((total, task) => total + task.requiredCount, 0);

    if (eatingCount > 0) {
      return `吃 ${eatingCount} 贡`;
    }

    if (givingCount > 0) {
      return `进 ${givingCount} 贡`;
    }
  }

  const dealerSelection = game.dealerSelection;

  if (dealerSelection && dealerSelection.tributeCount > 0) {
    const ownTeam = getTeamForSeat(game.viewerSeat);

    if (dealerSelection.winningTeam === ownTeam) {
      return `吃 ${dealerSelection.tributeCount} 贡`;
    }

    if (dealerSelection.losingTeam === ownTeam) {
      return `进 ${dealerSelection.tributeCount} 贡`;
    }
  }

  return "0";
}

function centerHintForGame(
  game: PlayerGameStateView,
  players: Array<{ seat: Seat; nickname: string }>,
): string | null {
  if (game.phase === "waiting_for_players") {
    const readyCount = ([0, 1, 2, 3] as const satisfies readonly Seat[]).filter(
      (seat) => game.readyState[seat],
    ).length;

    return `等待玩家准备 ${readyCount} / 4`;
  }

  if (game.highestTrumpBid && (game.phase === "dealing" || game.phase === "final_trump_bidding")) {
    return "等待玩家摔2";
  }

  if (game.phase === "dealing" || game.phase === "final_trump_bidding") {
    return "等待玩家摔2";
  }

  if (game.phase === "heavenly_trump_bidding" && game.heavenlyTrumpPrompt) {
    return `等待 ${seatName(players, game.heavenlyTrumpPrompt.seat)} 选择是否天摔`;
  }

  if (game.phase === "choosing_dealer") {
    return game.dealerSelection ? "获胜方选择坐庄玩家" : "选择坐庄玩家";
  }

  if (game.phase === "tribute") {
    return game.tributeView?.status === "returning" ? "等待玩家回贡" : "等待玩家进贡";
  }

  if (game.phase === "burying_bottom") {
    return null;
  }

  if (game.phase !== "playing") {
    return phaseLabel(game.phase);
  }

  return null;
}
