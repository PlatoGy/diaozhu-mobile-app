import { getCardsPoints } from "./scoring";
import { getOpponentTeam, getTeamForSeat, isDefenderSeat } from "./teams";
import { createTrick } from "./trick";
import type {
  Card,
  GameActionResult,
  GameRuleErrorCode,
  LastTrickScoreResult,
  ResolvedTrick,
  RoundResult,
  RoundState,
  RoundWinningSide,
  Seat,
  SeatHands,
  Team,
} from "./types";

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const BOTTOM_CARD_COUNT = 8;

function ok<T>(value: T): GameActionResult<T> {
  return {
    ok: true,
    value,
  };
}

function err<T>(code: GameRuleErrorCode, message: string): GameActionResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function cloneCard(card: Card): Card {
  return {
    ...card,
  };
}

function cloneResolvedTrick(resolvedTrick: ResolvedTrick): ResolvedTrick {
  return {
    ...resolvedTrick,
    winningPlay: {
      ...resolvedTrick.winningPlay,
      cards: resolvedTrick.winningPlay.cards.map(cloneCard),
      cardIds: [...resolvedTrick.winningPlay.cardIds],
      privilegeLosses: resolvedTrick.winningPlay.privilegeLosses.map((loss) => ({ ...loss })),
    },
    plays: resolvedTrick.plays.map((play) => ({
      ...play,
      cards: play.cards.map(cloneCard),
      cardIds: [...play.cardIds],
      privilegeLosses: play.privilegeLosses.map((loss) => ({ ...loss })),
    })),
  };
}

function cloneHands(hands: SeatHands): SeatHands {
  return {
    0: [...hands[0]],
    1: [...hands[1]],
    2: [...hands[2]],
    3: [...hands[3]],
  };
}

export function calculateNormalTrickScoreAddition(
  resolvedTrick: ResolvedTrick,
  dealerSeat: Seat,
): number {
  return isDefenderSeat(resolvedTrick.winnerSeat, dealerSeat) ? resolvedTrick.trickPoints : 0;
}

export function isFinalTrick(hands: Readonly<Record<Seat, readonly Card[]>>): boolean {
  return SEATS.every((seat) => hands[seat].length === 0);
}

export function hasInconsistentFinalHands(
  hands: Readonly<Record<Seat, readonly Card[]>>,
): boolean {
  const emptyHandCount = SEATS.filter((seat) => hands[seat].length === 0).length;

  return emptyHandCount > 0 && emptyHandCount < SEATS.length;
}

function multiplierFromResolvedTrick(
  resolvedTrick: ResolvedTrick,
): GameActionResult<1 | 2 | 3 | 4> {
  const cardCount = resolvedTrick.winningPlay.cards.length;

  if (cardCount === 1 || cardCount === 2 || cardCount === 3 || cardCount === 4) {
    return ok(cardCount);
  }

  return err("INVALID_LAST_TRICK_MULTIPLIER", "Last trick multiplier must be 1, 2, 3, or 4.");
}

export function calculateLastTrickScoreAddition(
  resolvedTrick: ResolvedTrick,
  bottomCards: readonly Card[],
  dealerSeat: Seat,
): GameActionResult<LastTrickScoreResult> {
  if (bottomCards.length !== BOTTOM_CARD_COUNT) {
    return err("INVALID_BOTTOM_SIZE", "Last trick scoring requires exactly 8 bottom cards.");
  }

  const multiplierResult = multiplierFromResolvedTrick(resolvedTrick);

  if (!multiplierResult.ok) {
    return multiplierResult;
  }

  const defendersWonLastTrick = isDefenderSeat(resolvedTrick.winnerSeat, dealerSeat);
  const bottomPoints = getCardsPoints(bottomCards);
  const lastTrickPoints = resolvedTrick.trickPoints;

  return ok({
    defendersWonLastTrick,
    bottomPoints,
    lastTrickPoints,
    multiplier: multiplierResult.value,
    scoreAdded: defendersWonLastTrick
      ? (bottomPoints + lastTrickPoints) * multiplierResult.value
      : 0,
  });
}

export function getDealerWinTributeCount(defenderScore: number): GameActionResult<number> {
  if (defenderScore >= 160) {
    return err("INVALID_PLAY_RECORD", "Dealer-win tribute count requires defender score below 160.");
  }

  if (defenderScore >= 125) {
    return ok(0);
  }

  if (defenderScore >= 85) {
    return ok(1);
  }

  if (defenderScore >= 45) {
    return ok(2);
  }

  if (defenderScore >= 5) {
    return ok(3);
  }

  return ok(4);
}

export function getDefenderWinTributeCount(defenderScore: number): GameActionResult<number> {
  if (defenderScore < 160) {
    return err("INVALID_PLAY_RECORD", "Defender-win tribute count requires defender score at least 160.");
  }

  return ok(Math.floor((defenderScore - 160) / 40));
}

export function calculateTributeCount(
  defenderScore: number,
): GameActionResult<{
  winningSide: RoundWinningSide;
  tributeCount: number;
}> {
  if (defenderScore >= 160) {
    const tributeResult = getDefenderWinTributeCount(defenderScore);

    if (!tributeResult.ok) {
      return tributeResult;
    }

    return ok({
      winningSide: "defender_team",
      tributeCount: tributeResult.value,
    });
  }

  const tributeResult = getDealerWinTributeCount(defenderScore);

  if (!tributeResult.ok) {
    return tributeResult;
  }

  return ok({
    winningSide: "dealer_team",
    tributeCount: tributeResult.value,
  });
}

function getWinningTeam(
  winningSide: RoundWinningSide,
  dealerTeam: Team,
  defenderTeam: Team,
): Team {
  return winningSide === "dealer_team" ? dealerTeam : defenderTeam;
}

function createRoundResult(
  roundState: RoundState,
  resolvedTrick: ResolvedTrick,
  finalDefenderScore: number,
  lastTrickScore: LastTrickScoreResult,
): GameActionResult<RoundResult> {
  if (roundState.dealerSeat === null) {
    return err("DEALER_NOT_SET", "Dealer seat is required to create round result.");
  }

  const tributeResult = calculateTributeCount(finalDefenderScore);

  if (!tributeResult.ok) {
    return tributeResult;
  }

  const dealerTeam = getTeamForSeat(roundState.dealerSeat);
  const defenderTeam = getOpponentTeam(dealerTeam);
  const winningTeam = getWinningTeam(tributeResult.value.winningSide, dealerTeam, defenderTeam);

  return ok({
    roundNumber: roundState.roundNumber,
    dealerSeat: roundState.dealerSeat,
    dealerTeam,
    defenderTeam,
    winningSide: tributeResult.value.winningSide,
    winningTeam,
    losingTeam: getOpponentTeam(winningTeam),
    defenderScore: finalDefenderScore,
    tributeCount: tributeResult.value.tributeCount,
    lastTrickWinnerSeat: resolvedTrick.winnerSeat,
    defendersWonLastTrick: lastTrickScore.defendersWonLastTrick,
    bottomPoints: lastTrickScore.bottomPoints,
    lastTrickPoints: lastTrickScore.lastTrickPoints,
    lastTrickMultiplier: lastTrickScore.multiplier,
    lastTrickScoreAdded: lastTrickScore.scoreAdded,
    totalTricks: roundState.trickHistory.length + 1,
  });
}

function assertReadyToFinalize(roundState: RoundState): GameActionResult<ResolvedTrick> {
  if (roundState.phase !== "playing") {
    return err("INVALID_PHASE", "Only playing rounds can finalize a trick.");
  }

  if (roundState.dealerSeat === null) {
    return err("DEALER_NOT_SET", "Dealer seat must be set before trick scoring.");
  }

  if (!roundState.trumpSuit) {
    return err("TRUMP_NOT_SET", "Trump suit must be set before trick scoring.");
  }

  if (!roundState.currentTrick) {
    return err("CURRENT_TRICK_NOT_FOUND", "Current trick is required for scoring.");
  }

  if (roundState.currentTrick.status !== "resolved") {
    return err("TRICK_NOT_RESOLVED", "Current trick must be resolved before scoring.");
  }

  if (!roundState.currentTrick.resolution) {
    return err("TRICK_RESOLUTION_MISSING", "Resolved trick is missing resolution data.");
  }

  const resolvedTrick = roundState.currentTrick.resolution;

  if (roundState.trickHistory.some((trick) => trick.trickNumber === resolvedTrick.trickNumber)) {
    return err("TRICK_ALREADY_APPLIED", "Current trick has already been applied.");
  }

  if (resolvedTrick.trickNumber !== roundState.trickHistory.length + 1) {
    return err("INVALID_TRICK_SEQUENCE", "Resolved trick number is not next in sequence.");
  }

  if (hasInconsistentFinalHands(roundState.hands)) {
    return err("INCONSISTENT_FINAL_HANDS", "Only some players have empty hands after a trick.");
  }

  return ok(resolvedTrick);
}

export function finalizeCurrentTrick(roundState: RoundState): GameActionResult<RoundState> {
  const readyResult = assertReadyToFinalize(roundState);

  if (!readyResult.ok) {
    return readyResult;
  }

  const dealerSeat = roundState.dealerSeat;

  if (dealerSeat === null) {
    return err("DEALER_NOT_SET", "Dealer seat must be set before trick scoring.");
  }

  const resolvedTrick = readyResult.value;
  const finalTrick = isFinalTrick(roundState.hands);
  const scoreResult = finalTrick
    ? calculateLastTrickScoreAddition(resolvedTrick, roundState.bottomCards, dealerSeat)
    : ok({
        defendersWonLastTrick: isDefenderSeat(resolvedTrick.winnerSeat, dealerSeat),
        bottomPoints: getCardsPoints(roundState.bottomCards),
        lastTrickPoints: resolvedTrick.trickPoints,
        multiplier: resolvedTrick.winningPlay.cards.length as 1 | 2 | 3 | 4,
        scoreAdded: calculateNormalTrickScoreAddition(resolvedTrick, dealerSeat),
      });

  if (!scoreResult.ok) {
    return scoreResult;
  }

  const nextDefenderScore = roundState.defenderScore + scoreResult.value.scoreAdded;
  const nextHistory = [...roundState.trickHistory, cloneResolvedTrick(resolvedTrick)];

  if (!finalTrick) {
    return ok({
      ...roundState,
      hands: cloneHands(roundState.hands),
      bottomCards: roundState.bottomCards.map(cloneCard),
      defenderScore: nextDefenderScore,
      trickHistory: nextHistory,
      currentTrick: createTrick(resolvedTrick.trickNumber + 1, resolvedTrick.winnerSeat),
    });
  }

  const roundResult = createRoundResult(
    roundState,
    resolvedTrick,
    nextDefenderScore,
    scoreResult.value,
  );

  if (!roundResult.ok) {
    return roundResult;
  }

  return ok({
    ...roundState,
    phase: "round_finished",
    hands: cloneHands(roundState.hands),
    bottomCards: roundState.bottomCards.map(cloneCard),
    defenderScore: nextDefenderScore,
    trickHistory: nextHistory,
    currentTrick: null,
    roundResult: roundResult.value,
  });
}
