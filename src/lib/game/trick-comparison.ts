import { compareSingleCards } from "./card-strength";
import { cardsFormDeclaredGroup, getPlayCategoryForCards } from "./privileges";
import type {
  Card,
  EffectiveDeclaredPlayType,
  GameActionResult,
  GameRuleErrorCode,
  GroupType,
  PlayCategory,
  PlayRecord,
  StandardSuit,
  TrickState,
  TrickWinnerResult,
} from "./types";

export type PlayComparison = "challenger_wins" | "current_winner_stays";

type SinglePlayTier = "trump" | "lead_category" | "off_category";

type GroupPlayTier = "trump_group" | "lead_category_group" | "loose";

const SINGLE_TIER_STRENGTH: Readonly<Record<SinglePlayTier, number>> = {
  off_category: 0,
  lead_category: 1,
  trump: 2,
};

const GROUP_TIER_STRENGTH: Readonly<Record<GroupPlayTier, number>> = {
  loose: 0,
  lead_category_group: 1,
  trump_group: 2,
};

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

function getSingleCard(play: PlayRecord): Card | null {
  return play.cards.length === 1 ? (play.cards[0] ?? null) : null;
}

function getSinglePlayTier(
  play: PlayRecord,
  leadCategory: PlayCategory,
): SinglePlayTier {
  if (play.playCategory === "trump") {
    return "trump";
  }

  if (leadCategory !== "trump" && play.playCategory === leadCategory) {
    return "lead_category";
  }

  return "off_category";
}

export function compareSinglePlays(
  challenger: PlayRecord,
  currentWinner: PlayRecord,
  leadCategory: PlayCategory,
  trumpSuit: StandardSuit,
): GameActionResult<PlayComparison> {
  const challengerCard = getSingleCard(challenger);
  const currentWinnerCard = getSingleCard(currentWinner);

  if (!challengerCard || !currentWinnerCard) {
    return err("INVALID_PLAY_RECORD", "Single play comparison requires one card per play.");
  }

  const challengerTier = getSinglePlayTier(challenger, leadCategory);
  const currentTier = getSinglePlayTier(currentWinner, leadCategory);
  const tierDelta =
    SINGLE_TIER_STRENGTH[challengerTier] - SINGLE_TIER_STRENGTH[currentTier];

  if (tierDelta > 0) {
    return ok("challenger_wins");
  }

  if (tierDelta < 0 || challengerTier === "off_category") {
    return ok("current_winner_stays");
  }

  return ok(
    compareSingleCards(challengerCard, currentWinnerCard, trumpSuit) > 0
      ? "challenger_wins"
      : "current_winner_stays",
  );
}

function getGroupType(leadType: EffectiveDeclaredPlayType): GroupType | null {
  if (leadType === "pair" || leadType === "triple" || leadType === "quad") {
    return leadType;
  }

  return null;
}

export function getRepresentativeCard(play: PlayRecord): GameActionResult<Card> {
  const representative = play.cards[0];

  if (!representative) {
    return err("INVALID_PLAY_RECORD", "Group play is missing cards.");
  }

  return ok(representative);
}

function getGroupPlayTier(
  play: PlayRecord,
  leadType: EffectiveDeclaredPlayType,
  leadCategory: PlayCategory,
  trumpSuit: StandardSuit,
): GameActionResult<GroupPlayTier> {
  const groupType = getGroupType(leadType);

  if (!groupType) {
    return err("INVALID_PLAY_RECORD", "Group tier requires a group lead type.");
  }

  if (play.declaredType === "loose") {
    return ok("loose");
  }

  if (play.declaredType !== leadType) {
    return err("INVALID_PLAY_RECORD", "Declared group type does not match lead type.");
  }

  if (!cardsFormDeclaredGroup(play.cards, groupType)) {
    return err("INVALID_PLAY_RECORD", "Declared group cards do not form the declared group.");
  }

  const actualPlayCategory = getPlayCategoryForCards(play.cards, trumpSuit);

  if (actualPlayCategory !== play.playCategory || actualPlayCategory === "mixed") {
    return err("INVALID_PLAY_RECORD", "Declared group has an invalid play category.");
  }

  if (play.playCategory === "trump") {
    return ok("trump_group");
  }

  if (leadCategory !== "trump" && play.playCategory === leadCategory) {
    return ok("lead_category_group");
  }

  return err("INVALID_PLAY_RECORD", "Declared group cannot compete in this trick.");
}

export function compareGroupPlays(
  challenger: PlayRecord,
  currentWinner: PlayRecord,
  leadType: EffectiveDeclaredPlayType,
  leadCategory: PlayCategory,
  trumpSuit: StandardSuit,
): GameActionResult<PlayComparison> {
  const challengerTierResult = getGroupPlayTier(
    challenger,
    leadType,
    leadCategory,
    trumpSuit,
  );

  if (!challengerTierResult.ok) {
    return challengerTierResult;
  }

  const currentTierResult = getGroupPlayTier(
    currentWinner,
    leadType,
    leadCategory,
    trumpSuit,
  );

  if (!currentTierResult.ok) {
    return currentTierResult;
  }

  const challengerTier = challengerTierResult.value;
  const currentTier = currentTierResult.value;
  const tierDelta =
    GROUP_TIER_STRENGTH[challengerTier] - GROUP_TIER_STRENGTH[currentTier];

  if (tierDelta > 0) {
    return ok("challenger_wins");
  }

  if (tierDelta < 0 || challengerTier === "loose") {
    return ok("current_winner_stays");
  }

  const challengerCardResult = getRepresentativeCard(challenger);

  if (!challengerCardResult.ok) {
    return challengerCardResult;
  }

  const currentCardResult = getRepresentativeCard(currentWinner);

  if (!currentCardResult.ok) {
    return currentCardResult;
  }

  return ok(
    compareSingleCards(challengerCardResult.value, currentCardResult.value, trumpSuit) > 0
      ? "challenger_wins"
      : "current_winner_stays",
  );
}

export function comparePlayAgainstCurrentWinner(
  challenger: PlayRecord,
  currentWinner: PlayRecord,
  leadType: EffectiveDeclaredPlayType,
  leadCategory: PlayCategory,
  trumpSuit: StandardSuit,
): GameActionResult<PlayComparison> {
  if (leadType === "single") {
    return compareSinglePlays(challenger, currentWinner, leadCategory, trumpSuit);
  }

  return compareGroupPlays(
    challenger,
    currentWinner,
    leadType,
    leadCategory,
    trumpSuit,
  );
}

export function resolveTrickWinner(
  trick: TrickState,
  trumpSuit: StandardSuit,
): GameActionResult<TrickWinnerResult> {
  if (!trick.leadType || !trick.leadCategory) {
    return err("INVALID_PLAY_RECORD", "Trick is missing lead data.");
  }

  const orderedPlays = [...trick.plays].sort((left, right) => left.orderIndex - right.orderIndex);
  const firstPlay = orderedPlays[0];

  if (!firstPlay) {
    return err("INVALID_PLAY_RECORD", "Trick has no plays.");
  }

  let winningPlay = firstPlay;

  for (const challenger of orderedPlays.slice(1)) {
    const comparison = comparePlayAgainstCurrentWinner(
      challenger,
      winningPlay,
      trick.leadType,
      trick.leadCategory,
      trumpSuit,
    );

    if (!comparison.ok) {
      return comparison;
    }

    if (comparison.value === "challenger_wins") {
      winningPlay = challenger;
    }
  }

  return ok({
    winnerSeat: winningPlay.seat,
    winningPlay,
    winningPlayOrderIndex: winningPlay.orderIndex,
  });
}
