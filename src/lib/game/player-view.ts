import {
  getHighestTributeCandidates,
  getReturnTributeOptions,
} from "./tribute-candidates";
import type {
  Card,
  GamePhase,
  LeadPrivileges,
  RoundResult,
  ResolvedTrick,
  Seat,
  ServerGameState,
  StandardSuit,
  Team,
  TrickState,
  TributeState,
  TrumpBid,
  TrumpBiddingRound,
  TrumpBiddingResponse,
} from "./types";

export type PlayerDealerSelectionView = {
  sourceRoundNumber: number;
  winningTeam: Team;
  losingTeam: Team;
  tributeCount: number;
  dealerCandidates: [Seat, Seat];
  dealerClicks: Seat[];
  resolvedDealerSeat: Seat | null;
};

export type AllowedPlayerActions = {
  canChooseDealer: boolean;
  canPlaceTrumpBid: boolean;
  canSkipTrumpBid: boolean;
  canResolveHeavenlyTrump: boolean;
  canTakeBottom: boolean;
  canBuryBottom: boolean;
  canPlayCards: boolean;
  canSubmitTribute: boolean;
  canSubmitReturnTribute: boolean;
  currentTurn: boolean;
  requiredTributeTaskId?: string;
  requiredReturnTaskId?: string;
  tributeCandidateCardIds?: string[];
  returnOptionCardIds?: string[];
};

export type PlayerTrumpBiddingRoundView = {
  batchNumber: TrumpBiddingRound["batchNumber"];
  cardsPerPlayerDealt: TrumpBiddingRound["cardsPerPlayerDealt"];
  responses: Record<Seat, TrumpBiddingResponse>;
};

export type PlayerTributeView = {
  status: TributeState["status"];
  totalTributes: number;
  givingTasks: Array<{
    id: string;
    giverSeat: Seat;
    receiverSeat: Seat;
    requiredCount: number;
    status: string;
  }>;
  returnTasks: Array<{
    id: string;
    returnerSeat: Seat;
    receiverSeat: Seat;
    requiredCount: number;
    status: string;
  }>;
};

export type PlayerGameStateView = {
  roomId: string;
  stateVersion: number;
  phase: GamePhase;
  roundNumber: number;
  viewerSeat: Seat;
  dealerSeat: Seat | null;
  trumpSuit: StandardSuit | null;
  readyState: Record<Seat, boolean>;
  ownLeadPrivileges: LeadPrivileges | null;
  ownHand: Card[];
  players: Record<Seat, { seat: Seat; cardCount: number }>;
  highestTrumpBid: TrumpBid | null;
  highestTrumpBidCards: Card[];
  trumpBiddingRound: PlayerTrumpBiddingRoundView | null;
  heavenlyTrumpPrompt: {
    seat: Seat;
    suit: StandardSuit;
    resolved: boolean;
  } | null;
  pendingBottomCards: Card[];
  buriedBottomCards: Card[];
  currentTrick: TrickState | null;
  trickHistory: ResolvedTrick[];
  defenderScore: number;
  tributeView: PlayerTributeView | null;
  dealerSelection: PlayerDealerSelectionView | null;
  roundResult: RoundResult | null;
  allowedActions: AllowedPlayerActions;
};

function emptyAllowedActions(): AllowedPlayerActions {
  return {
    canChooseDealer: false,
    canPlaceTrumpBid: false,
    canSkipTrumpBid: false,
    canResolveHeavenlyTrump: false,
    canTakeBottom: false,
    canBuryBottom: false,
    canPlayCards: false,
    canSubmitTribute: false,
    canSubmitReturnTribute: false,
    currentTurn: false,
  };
}

function publicTributeView(tributeState: TributeState | null): PlayerTributeView | null {
  if (!tributeState) {
    return null;
  }

  return {
    status: tributeState.status,
    totalTributes: tributeState.totalTributes,
    givingTasks: tributeState.givingTasks.map((task) => ({
      id: task.id,
      giverSeat: task.giverSeat,
      receiverSeat: task.receiverSeat,
      requiredCount: task.requiredCount,
      status: task.status,
    })),
    returnTasks: tributeState.returnTasks.map((task) => ({
      id: task.id,
      returnerSeat: task.returnerSeat,
      receiverSeat: task.receiverSeat,
      requiredCount: task.requiredCount,
      status: task.status,
    })),
  };
}

function allowedActionsForSeat(
  state: ServerGameState,
  viewerSeat: Seat,
): AllowedPlayerActions {
  const actions = emptyAllowedActions();
  const roundState = state.roundState;
  const betweenRounds = state.betweenRounds;

  actions.canChooseDealer =
    state.phase === "choosing_dealer" &&
    Boolean(betweenRounds?.dealerCandidates.includes(viewerSeat)) &&
    betweenRounds?.resolvedDealerSeat === null;

  if (!roundState) {
    return actions;
  }

  const ownBiddingResponse = roundState.trumpBiddingRound?.responses[viewerSeat];
  const isTrumpBiddingPhase =
    roundState.phase === "dealing" || roundState.phase === "final_trump_bidding";
  const canRaiseOwnBid =
    roundState.highestTrumpBid?.seat === viewerSeat &&
    roundState.highestTrumpBid.isHeavenly !== true;
  actions.canPlaceTrumpBid =
    isTrumpBiddingPhase &&
    (ownBiddingResponse?.type === "pending" || canRaiseOwnBid);
  actions.canSkipTrumpBid = isTrumpBiddingPhase && ownBiddingResponse?.type === "pending";
  actions.canResolveHeavenlyTrump =
    roundState.phase === "heavenly_trump_bidding" &&
    roundState.heavenlyTrumpPrompt?.seat === viewerSeat &&
    !roundState.heavenlyTrumpPrompt.resolved;
  actions.canTakeBottom =
    roundState.phase === "taking_bottom" && roundState.dealerSeat === viewerSeat;
  actions.canBuryBottom =
    roundState.phase === "burying_bottom" && roundState.dealerSeat === viewerSeat;
  actions.currentTurn =
    roundState.phase === "playing" &&
    roundState.currentTrick?.status === "in_progress" &&
    roundState.currentTrick.currentTurnSeat === viewerSeat;
  actions.canPlayCards = actions.currentTurn;

  const tributeState = roundState.tributeState;

  if (roundState.phase === "tribute" && tributeState?.status === "giving" && roundState.trumpSuit) {
    const task = tributeState.givingTasks.find(
      (candidate) => candidate.giverSeat === viewerSeat && candidate.status === "pending",
    );

    if (task) {
      actions.canSubmitTribute = true;
      actions.requiredTributeTaskId = task.id;
      actions.tributeCandidateCardIds = getHighestTributeCandidates(
        roundState.hands[viewerSeat],
        roundState.trumpSuit,
      ).map((card) => card.id);
    }
  }

  if (roundState.phase === "tribute" && tributeState?.status === "returning" && roundState.trumpSuit) {
    const task = tributeState.returnTasks.find(
      (candidate) => candidate.returnerSeat === viewerSeat && candidate.status === "pending",
    );

    if (task) {
      actions.canSubmitReturnTribute = true;
      actions.requiredReturnTaskId = task.id;
      actions.returnOptionCardIds = getReturnTributeOptions(
        roundState.hands[viewerSeat],
        task.requiredCount,
        roundState.trumpSuit,
      ).map((card) => card.id);
    }
  }

  return actions;
}

function publicTrumpBiddingRoundView(
  round: TrumpBiddingRound | null | undefined,
): PlayerTrumpBiddingRoundView | null {
  if (!round) {
    return null;
  }

  return {
    batchNumber: round.batchNumber,
    cardsPerPlayerDealt: round.cardsPerPlayerDealt,
    responses: round.responses,
  };
}

function publicDealerSelectionView(
  state: ServerGameState,
): PlayerDealerSelectionView | null {
  const betweenRounds = state.betweenRounds;

  if (!betweenRounds) {
    return null;
  }

  return {
    sourceRoundNumber: betweenRounds.sourceRoundNumber,
    winningTeam: betweenRounds.winningTeam,
    losingTeam: betweenRounds.losingTeam,
    tributeCount: betweenRounds.tributeCount,
    dealerCandidates: [...betweenRounds.dealerCandidates],
    dealerClicks: [...betweenRounds.dealerClicks],
    resolvedDealerSeat: betweenRounds.resolvedDealerSeat,
  };
}

function visibleDealerSeat(state: ServerGameState): Seat | null {
  if (state.phase === "choosing_dealer") {
    return state.betweenRounds?.resolvedDealerSeat ?? null;
  }

  return state.roundState?.dealerSeat ?? null;
}

function highestTrumpBidCards(roundState: {
  highestTrumpBid: TrumpBid | null;
  hands: Record<Seat, Card[]>;
}): Card[] {
  const bid = roundState.highestTrumpBid;

  if (!bid) {
    return [];
  }

  const cardIds = new Set(bid.cardIds);
  const exactCards = roundState.hands[bid.seat].filter((card) => cardIds.has(card.id));

  if (exactCards.length > 0) {
    return exactCards;
  }

  return roundState.hands[bid.seat]
    .filter((card) => card.rank === "2" && card.originalSuit === bid.suit)
    .slice(0, bid.isHeavenly ? 1 : bid.count);
}

function isTrumpBidDisplayedOnTable(phase: GamePhase): boolean {
  return phase === "dealing" || phase === "final_trump_bidding";
}

export function createPlayerGameView(
  roomId: string,
  gameState: ServerGameState,
  viewerSeat: Seat,
  stateVersion: number,
): PlayerGameStateView {
  const roundState = gameState.roundState;

  if (!roundState) {
    return {
      roomId,
      stateVersion,
      phase: gameState.phase,
      roundNumber: gameState.roundNumber,
      viewerSeat,
      dealerSeat: null,
      trumpSuit: null,
      readyState: gameState.readyState,
      ownLeadPrivileges: null,
      ownHand: [],
      players: {
        0: { seat: 0, cardCount: 0 },
        1: { seat: 1, cardCount: 0 },
        2: { seat: 2, cardCount: 0 },
        3: { seat: 3, cardCount: 0 },
      },
      highestTrumpBid: null,
      highestTrumpBidCards: [],
      trumpBiddingRound: null,
      heavenlyTrumpPrompt: null,
      pendingBottomCards: [],
      buriedBottomCards: [],
      currentTrick: null,
      trickHistory: [],
      defenderScore: 0,
      tributeView: null,
      dealerSelection: publicDealerSelectionView(gameState),
      roundResult: null,
      allowedActions: emptyAllowedActions(),
    };
  }

  const bidCards = highestTrumpBidCards(roundState);
  const displayedBidCardIds = new Set(
    isTrumpBidDisplayedOnTable(roundState.phase) ? bidCards.map((card) => card.id) : [],
  );
  const ownHand =
    roundState.highestTrumpBid?.seat === viewerSeat
      ? roundState.hands[viewerSeat].filter((card) => !displayedBidCardIds.has(card.id))
      : [...roundState.hands[viewerSeat]];
  const cardCountForSeat = (seat: Seat): number => {
    const hiddenBidCardCount =
      roundState.highestTrumpBid?.seat === seat ? displayedBidCardIds.size : 0;

    return Math.max(0, roundState.hands[seat].length - hiddenBidCardCount);
  };

  return {
    roomId,
    stateVersion,
    phase: gameState.phase,
    roundNumber: roundState.roundNumber,
    viewerSeat,
    dealerSeat: visibleDealerSeat(gameState),
    trumpSuit: roundState.trumpSuit,
    readyState: gameState.readyState,
    ownLeadPrivileges: roundState.playerPrivileges[viewerSeat],
    ownHand,
    players: {
      0: { seat: 0, cardCount: cardCountForSeat(0) },
      1: { seat: 1, cardCount: cardCountForSeat(1) },
      2: { seat: 2, cardCount: cardCountForSeat(2) },
      3: { seat: 3, cardCount: cardCountForSeat(3) },
    },
    highestTrumpBid: roundState.highestTrumpBid,
    highestTrumpBidCards: bidCards,
    trumpBiddingRound: publicTrumpBiddingRoundView(roundState.trumpBiddingRound),
    heavenlyTrumpPrompt: roundState.heavenlyTrumpPrompt
      ? {
          seat: roundState.heavenlyTrumpPrompt.seat,
          suit: roundState.heavenlyTrumpPrompt.suit,
          resolved: roundState.heavenlyTrumpPrompt.resolved,
        }
      : null,
    pendingBottomCards:
      roundState.phase === "burying_bottom" ? [...roundState.takenBottomCards] : [],
    buriedBottomCards:
      roundState.phase === "playing" || roundState.phase === "round_finished"
        ? [...roundState.bottomCards]
        : [],
    currentTrick: roundState.currentTrick,
    trickHistory: roundState.trickHistory,
    defenderScore: roundState.defenderScore,
    tributeView: publicTributeView(roundState.tributeState),
    dealerSelection: publicDealerSelectionView(gameState),
    roundResult: roundState.roundResult,
    allowedActions: allowedActionsForSeat(gameState, viewerSeat),
  };
}
