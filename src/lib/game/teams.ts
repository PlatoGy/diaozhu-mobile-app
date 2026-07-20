import type { Seat, Team } from "./types";

export function getTeamForSeat(seat: Seat): Team {
  return seat === 0 || seat === 2 ? "team_0_2" : "team_1_3";
}

export function getPartnerSeat(seat: Seat): Seat {
  if (seat === 0) {
    return 2;
  }

  if (seat === 1) {
    return 3;
  }

  if (seat === 2) {
    return 0;
  }

  return 1;
}

export function getSeatsForTeam(team: Team): [Seat, Seat] {
  return team === "team_0_2" ? [0, 2] : [1, 3];
}

export function getNextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function getPreviousSeat(seat: Seat): Seat {
  return ((seat + 3) % 4) as Seat;
}

export function getOpponentTeam(team: Team): Team {
  return team === "team_0_2" ? "team_1_3" : "team_0_2";
}

export function isDefenderSeat(seat: Seat, dealerSeat: Seat): boolean {
  return getTeamForSeat(seat) !== getTeamForSeat(dealerSeat);
}
