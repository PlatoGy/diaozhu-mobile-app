import { getSeatsForTeam } from "./teams";
import { resolveDealerSelection } from "./round";
import type {
  BetweenRoundsState,
  GameActionResult,
  GameRuleErrorCode,
  RoundResult,
  Seat,
} from "./types";

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

function uniqueSeats(seats: readonly Seat[]): Seat[] {
  return [...new Set(seats)];
}

export function createBetweenRoundsState(
  roundResult: RoundResult,
): BetweenRoundsState {
  return {
    sourceRoundNumber: roundResult.roundNumber,
    winningTeam: roundResult.winningTeam,
    losingTeam: roundResult.losingTeam,
    tributeCount: roundResult.tributeCount,
    dealerCandidates: getSeatsForTeam(roundResult.winningTeam),
    dealerClicks: [],
    resolvedDealerSeat: null,
  };
}

export function chooseDealerCandidate(
  state: BetweenRoundsState,
  seat: Seat,
): GameActionResult<BetweenRoundsState> {
  if (state.resolvedDealerSeat !== null) {
    return err("DEALER_ALREADY_RESOLVED", "Dealer selection has already been resolved.");
  }

  if (!state.dealerCandidates.includes(seat)) {
    return err("NOT_DEALER_CANDIDATE", "Only winning-team candidates can choose dealer.");
  }

  return ok({
    ...state,
    dealerClicks: uniqueSeats([...state.dealerClicks, seat]),
  });
}

export function resolveBetweenRoundsDealer(
  state: BetweenRoundsState,
  random?: () => number,
): GameActionResult<BetweenRoundsState> {
  if (state.resolvedDealerSeat !== null) {
    return err("DEALER_ALREADY_RESOLVED", "Dealer selection has already been resolved.");
  }

  if (
    state.dealerCandidates.length !== 2 ||
    state.dealerCandidates[0] === state.dealerCandidates[1]
  ) {
    return err("INVALID_DEALER_CANDIDATES", "Dealer candidates must be two distinct seats.");
  }

  const resolvedDealerSeat = resolveDealerSelection({
    winnerTeamSeats: state.dealerCandidates,
    clickedSeats: state.dealerClicks,
    random,
  });

  return ok({
    ...state,
    dealerClicks: uniqueSeats(state.dealerClicks),
    resolvedDealerSeat,
  });
}
