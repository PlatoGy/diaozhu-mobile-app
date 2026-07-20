import { cardsFormDeclaredGroup, getPlayCategoryForCards } from "./privileges";
import { getCardsPoints } from "./scoring";
import { resolveTrickWinner } from "./trick-comparison";
import type {
  Card,
  EffectiveDeclaredPlayType,
  GameActionResult,
  GameRuleErrorCode,
  GroupType,
  PlayRecord,
  ResolvedTrick,
  Seat,
  StandardSuit,
  TrickState,
} from "./types";

const SEATS: readonly Seat[] = [0, 1, 2, 3];

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

function groupTypeForLeadType(leadType: EffectiveDeclaredPlayType): GroupType | null {
  if (leadType === "pair" || leadType === "triple" || leadType === "quad") {
    return leadType;
  }

  return null;
}

function cloneCard(card: Card): Card {
  return {
    ...card,
  };
}

function clonePlayRecord(play: PlayRecord): PlayRecord {
  return {
    ...play,
    cards: play.cards.map(cloneCard),
    cardIds: [...play.cardIds],
    privilegeLosses: play.privilegeLosses.map((loss) => ({ ...loss })),
  };
}

function hasDuplicateSeats(plays: readonly PlayRecord[]): boolean {
  return new Set(plays.map((play) => play.seat)).size !== plays.length;
}

function hasValidOrderIndexes(plays: readonly PlayRecord[]): boolean {
  const orderIndexes = new Set(plays.map((play) => play.orderIndex));

  return SEATS.every((orderIndex) => orderIndexes.has(orderIndex));
}

function cardIdsMatchCards(play: PlayRecord): boolean {
  if (play.cardIds.length !== play.cards.length) {
    return false;
  }

  return play.cardIds.every((cardId, index) => cardId === play.cards[index]?.id);
}

function validatePlayRecord(
  play: PlayRecord,
  leadType: EffectiveDeclaredPlayType,
  leadCategory: TrickState["leadCategory"],
  expectedCardCount: number,
  trumpSuit: StandardSuit,
): GameActionResult<true> {
  if (!leadCategory) {
    return err("MISSING_LEAD_CATEGORY", "Trick is missing lead category.");
  }

  if (play.cards.length !== expectedCardCount || play.cardIds.length !== expectedCardCount) {
    return err("INVALID_PLAY_CARD_COUNT", "Play card count does not match the lead count.");
  }

  if (!cardIdsMatchCards(play)) {
    return err("INVALID_PLAY_RECORD", "Play card ids do not match play cards.");
  }

  const actualPlayCategory = getPlayCategoryForCards(play.cards, trumpSuit);

  if (actualPlayCategory !== play.playCategory) {
    return err("INVALID_PLAY_RECORD", "Play category does not match the cards.");
  }

  if (leadType === "single") {
    if (play.declaredType !== "single") {
      return err("INVALID_PLAY_RECORD", "Single trick contains a non-single play.");
    }

    return ok(true);
  }

  if (play.declaredType === "loose") {
    return ok(true);
  }

  if (play.declaredType !== leadType) {
    return err("INVALID_PLAY_RECORD", "Group trick contains an invalid declared type.");
  }

  const groupType = groupTypeForLeadType(leadType);

  if (!groupType || !cardsFormDeclaredGroup(play.cards, groupType)) {
    return err("INVALID_PLAY_RECORD", "Declared group cards do not match the declared type.");
  }

  if (play.playCategory === "mixed") {
    return err("INVALID_PLAY_RECORD", "Declared group cannot have mixed play category.");
  }

  if (play.playCategory !== "trump" && play.playCategory !== leadCategory) {
    return err("INVALID_PLAY_RECORD", "Declared group cannot compete in this trick category.");
  }

  return ok(true);
}

function validateResolvableTrick(trick: TrickState, trumpSuit: StandardSuit): GameActionResult<true> {
  if (trick.status === "resolved") {
    return err("TRICK_ALREADY_RESOLVED", "Trick has already been resolved.");
  }

  if (trick.status !== "awaiting_resolution") {
    return err("TRICK_NOT_READY", "Trick is not ready for resolution.");
  }

  if (trick.plays.length !== 4) {
    return err("INVALID_PLAY_COUNT", "A trick must contain four plays before resolution.");
  }

  if (hasDuplicateSeats(trick.plays)) {
    return err("DUPLICATE_PLAY_SEAT", "A trick cannot contain duplicate player seats.");
  }

  if (!hasValidOrderIndexes(trick.plays)) {
    return err("INVALID_PLAY_ORDER", "Trick play order must contain indexes 0, 1, 2, and 3.");
  }

  if (!trick.leadType) {
    return err("MISSING_LEAD_TYPE", "Trick is missing lead type.");
  }

  if (!trick.leadCategory) {
    return err("MISSING_LEAD_CATEGORY", "Trick is missing lead category.");
  }

  if (!trick.expectedCardCount) {
    return err("MISSING_EXPECTED_CARD_COUNT", "Trick is missing expected card count.");
  }

  const orderedPlays = [...trick.plays].sort((left, right) => left.orderIndex - right.orderIndex);
  const firstPlay = orderedPlays[0];

  if (!firstPlay || firstPlay.seat !== trick.leaderSeat || firstPlay.declaredType !== trick.leadType) {
    return err("LEADER_PLAY_MISMATCH", "First play does not match the trick leader or lead type.");
  }

  for (const play of orderedPlays) {
    const playValidation = validatePlayRecord(
      play,
      trick.leadType,
      trick.leadCategory,
      trick.expectedCardCount,
      trumpSuit,
    );

    if (!playValidation.ok) {
      return playValidation;
    }
  }

  return ok(true);
}

export function canResolveTrick(trick: TrickState): boolean {
  return (
    trick.status === "awaiting_resolution" &&
    trick.plays.length === 4 &&
    !hasDuplicateSeats(trick.plays) &&
    hasValidOrderIndexes(trick.plays) &&
    Boolean(trick.leadType) &&
    Boolean(trick.leadCategory) &&
    Boolean(trick.expectedCardCount)
  );
}

export function calculateTrickPoints(plays: readonly PlayRecord[]): number {
  return getCardsPoints(plays.flatMap((play) => play.cards));
}

export function resolveTrick(
  trick: TrickState,
  trumpSuit: StandardSuit,
): GameActionResult<TrickState> {
  const validation = validateResolvableTrick(trick, trumpSuit);

  if (!validation.ok) {
    return validation;
  }

  if (!trick.leadType || !trick.leadCategory) {
    return err("INVALID_PLAY_RECORD", "Validated trick is missing lead data.");
  }

  const winnerResult = resolveTrickWinner(trick, trumpSuit);

  if (!winnerResult.ok) {
    return winnerResult;
  }

  const plays = trick.plays.map(clonePlayRecord);
  const winningPlay = clonePlayRecord(winnerResult.value.winningPlay);
  const resolution: ResolvedTrick = {
    trickNumber: trick.trickNumber,
    winnerSeat: winnerResult.value.winnerSeat,
    winningPlay,
    winningPlayOrderIndex: winnerResult.value.winningPlayOrderIndex,
    leaderSeat: trick.leaderSeat,
    leadType: trick.leadType,
    leadCategory: trick.leadCategory,
    trickPoints: calculateTrickPoints(trick.plays),
    plays,
  };

  return ok({
    ...trick,
    status: "resolved",
    resolution,
  });
}
