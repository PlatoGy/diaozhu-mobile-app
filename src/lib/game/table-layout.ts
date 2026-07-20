import { getRelativeTablePosition, type RelativeTablePosition } from "./display";
import { getNextSeat, getPartnerSeat, getPreviousSeat, getTeamForSeat } from "./teams";
import type { Card, DeclaredPlayType, PlayRecord, Seat, Team } from "./types";

export type TeamPresentation = {
  team: Team;
  label: "红队" | "蓝队";
  ringClassName: string;
  badgeClassName: string;
  slotClassName: string;
};

export type StableAvatarProfile = {
  symbol: string;
  gradientClassName: string;
};

export type RelativePlayer = {
  position: RelativeTablePosition;
  relationLabel: "自己" | "搭档" | "上家" | "下家";
  seat: Seat;
  nickname: string;
  cardCount: number;
  ready: boolean;
  dealer: boolean;
  active: boolean;
  team: TeamPresentation;
  avatar: StableAvatarProfile;
};

export type TrickSlot = {
  position: RelativeTablePosition;
  relationLabel: RelativePlayer["relationLabel"];
  seat: Seat;
  nickname: string;
  cards: Card[];
  declaredType: DeclaredPlayType | null;
  declaredTypeLabel: string | null;
  winner: boolean;
  team: TeamPresentation;
};

const AVATAR_SYMBOLS = ["竹", "松", "梅", "兰", "风", "月", "山", "川"] as const;
const AVATAR_GRADIENTS = [
  "from-[#fff7cc] to-[#f97316]",
  "from-[#d9f99d] to-[#15803d]",
  "from-[#bae6fd] to-[#2563eb]",
  "from-[#fecdd3] to-[#be123c]",
  "from-[#ddd6fe] to-[#7c3aed]",
  "from-[#fde68a] to-[#b45309]",
] as const;

export const TABLE_POSITIONS = ["top", "left", "right", "bottom"] as const;

export function teamPresentationForSeat(seat: Seat): TeamPresentation {
  const team = getTeamForSeat(seat);

  if (team === "team_0_2") {
    return {
      team,
      label: "红队",
      ringClassName: "ring-[#f04438]",
      badgeClassName: "border-[#fda29b] bg-[#fff1f2] text-[#b42318]",
      slotClassName: "border-[#f97066]/70",
    };
  }

  return {
    team,
    label: "蓝队",
    ringClassName: "ring-[#2e90fa]",
    badgeClassName: "border-[#84caff] bg-[#eff8ff] text-[#175cd3]",
    slotClassName: "border-[#53b1fd]/70",
  };
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function stableAvatarProfile(roomId: string, seat: Seat): StableAvatarProfile {
  const hash = hashString(`${roomId}:${seat}`);

  return {
    symbol: AVATAR_SYMBOLS[hash % AVATAR_SYMBOLS.length],
    gradientClassName: AVATAR_GRADIENTS[Math.floor(hash / 7) % AVATAR_GRADIENTS.length],
  };
}

export function relationLabelForPosition(
  position: RelativeTablePosition,
): RelativePlayer["relationLabel"] {
  if (position === "bottom") {
    return "自己";
  }

  if (position === "top") {
    return "搭档";
  }

  if (position === "left") {
    return "上家";
  }

  return "下家";
}

export function buildRelativePlayers(input: {
  roomId: string;
  viewerSeat: Seat;
  players: Array<{ seat: Seat; nickname: string }>;
  cardCounts: Record<Seat, { seat: Seat; cardCount: number }>;
  readyState: Record<Seat, boolean>;
  dealerSeat: Seat | null;
  currentTurnSeat: Seat | null;
}): Record<RelativeTablePosition, RelativePlayer> {
  const seats = [input.viewerSeat, getPartnerSeat(input.viewerSeat), getPreviousSeat(input.viewerSeat), getNextSeat(input.viewerSeat)];
  const relativePlayers = {} as Record<RelativeTablePosition, RelativePlayer>;

  for (const seat of seats) {
    const position = getRelativeTablePosition(input.viewerSeat, seat);

    relativePlayers[position] = {
      position,
      relationLabel: relationLabelForPosition(position),
      seat,
      nickname: input.players.find((player) => player.seat === seat)?.nickname ?? `Seat ${seat}`,
      cardCount: input.cardCounts[seat].cardCount,
      ready: input.readyState[seat],
      dealer: input.dealerSeat === seat,
      active: input.currentTurnSeat === seat,
      team: teamPresentationForSeat(seat),
      avatar: stableAvatarProfile(input.roomId, seat),
    };
  }

  return relativePlayers;
}

export function declaredTypeLabel(type: DeclaredPlayType | null): string | null {
  if (!type) {
    return null;
  }

  const labels: Record<DeclaredPlayType, string> = {
    single: "单张",
    pair: "对子",
    triple: "三个",
    quad: "四个",
    loose: "散牌",
  };

  return labels[type];
}

export function buildTrickSlots(input: {
  viewerSeat: Seat;
  relativePlayers: Record<RelativeTablePosition, RelativePlayer>;
  plays: readonly PlayRecord[];
  winnerSeat: Seat | null;
}): Record<RelativeTablePosition, TrickSlot> {
  const slots = {} as Record<RelativeTablePosition, TrickSlot>;

  for (const position of TABLE_POSITIONS) {
    const player = input.relativePlayers[position];
    const play = input.plays.find((candidate) => candidate.seat === player.seat);

    slots[position] = {
      position,
      relationLabel: player.relationLabel,
      seat: player.seat,
      nickname: player.nickname,
      cards: play?.cards ?? [],
      declaredType: play?.declaredType ?? null,
      declaredTypeLabel: declaredTypeLabel(play?.declaredType ?? null),
      winner: input.winnerSeat === player.seat,
      team: player.team,
    };
  }

  return slots;
}
