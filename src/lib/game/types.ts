export type Seat = 0 | 1 | 2 | 3;

export type Team = "team_0_2" | "team_1_3";

export type RoundWinningSide = "dealer_team" | "defender_team";

export type RoomStatus = "waiting" | "active" | "round_finished" | "archived";

export type GamePhase =
  | "waiting_for_players"
  | "choosing_dealer"
  | "dealing"
  | "heavenly_trump_bidding"
  | "final_trump_bidding"
  | "tribute"
  | "taking_bottom"
  | "burying_bottom"
  | "playing"
  | "round_finished";

export type DeckIndex = 0 | 1 | 2 | 3;

export type StandardSuit = "spades" | "hearts" | "clubs" | "diamonds";

export type OriginalSuit = StandardSuit | "joker";

export type EffectiveSuit = "trump" | StandardSuit;

export type PlayCategory = EffectiveSuit;

export type StandardRank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export type JokerRank = "small_joker" | "big_joker";

export type CardRank = StandardRank | JokerRank;

export type Card = {
  id: string;
  deckIndex: DeckIndex;
  originalSuit: OriginalSuit;
  rank: CardRank;
};

export type DeclaredPlayType = "single" | "pair" | "triple" | "quad" | "loose";

export type EffectiveDeclaredPlayType = Exclude<DeclaredPlayType, "loose">;

export type GroupType = "pair" | "triple" | "quad";

export type GroupPrivileges = {
  pair: boolean;
  triple: boolean;
  quad: boolean;
};

export type LeadPrivileges = {
  trump: GroupPrivileges;
  spades: GroupPrivileges;
  hearts: GroupPrivileges;
  clubs: GroupPrivileges;
  diamonds: GroupPrivileges;
};

export type PlayerPrivileges = Record<Seat, LeadPrivileges>;

export type TrumpBid = {
  seat: Seat;
  suit: StandardSuit;
  count: 1 | 2 | 3 | 4;
  isHeavenly?: true;
};

export type HeavenlyTrumpPrompt = {
  seat: Seat;
  cardId: string;
  suit: StandardSuit;
  resolved: boolean;
};

export type SeatHands = Record<Seat, Card[]>;

export type PlayerReadyState = Record<Seat, boolean>;

export type DealOrderItem = {
  seat: Seat;
  cardId: string;
};

export type TrickStatus = "in_progress" | "awaiting_resolution" | "resolved";

export type PrivilegeLoss = {
  seat: Seat;
  category: PlayCategory;
  groupType: GroupType;
};

export type PlayRecord = {
  seat: Seat;
  cards: Card[];
  cardIds: string[];
  declaredType: DeclaredPlayType;
  playCategory: PlayCategory | "mixed";
  orderIndex: 0 | 1 | 2 | 3;
  privilegeLosses: PrivilegeLoss[];
};

export type TrickState = {
  trickNumber: number;
  leaderSeat: Seat;
  currentTurnSeat: Seat;
  leadType: EffectiveDeclaredPlayType | null;
  leadCategory: PlayCategory | null;
  expectedCardCount: 1 | 2 | 3 | 4 | null;
  plays: PlayRecord[];
  status: TrickStatus;
  resolution: ResolvedTrick | null;
};

export type ResolvedTrick = {
  trickNumber: number;
  winnerSeat: Seat;
  winningPlay: PlayRecord;
  winningPlayOrderIndex: number;
  leaderSeat: Seat;
  leadType: EffectiveDeclaredPlayType;
  leadCategory: PlayCategory;
  trickPoints: number;
  plays: PlayRecord[];
};

export type TrickWinnerResult = {
  winnerSeat: Seat;
  winningPlay: PlayRecord;
  winningPlayOrderIndex: number;
};

export type LastTrickScoreResult = {
  defendersWonLastTrick: boolean;
  bottomPoints: number;
  lastTrickPoints: number;
  multiplier: 1 | 2 | 3 | 4;
  scoreAdded: number;
};

export type RoundResult = {
  roundNumber: number;
  dealerSeat: Seat;
  dealerTeam: Team;
  defenderTeam: Team;
  winningSide: RoundWinningSide;
  winningTeam: Team;
  losingTeam: Team;
  defenderScore: number;
  tributeCount: number;
  lastTrickWinnerSeat: Seat;
  defendersWonLastTrick: boolean;
  bottomPoints: number;
  lastTrickPoints: number;
  lastTrickMultiplier: 1 | 2 | 3 | 4;
  lastTrickScoreAdded: number;
  totalTricks: number;
};

export type BetweenRoundsState = {
  sourceRoundNumber: number;
  winningTeam: Team;
  losingTeam: Team;
  tributeCount: number;
  dealerCandidates: [Seat, Seat];
  dealerClicks: Seat[];
  resolvedDealerSeat: Seat | null;
};

export type TributePhaseStatus = "giving" | "returning" | "completed";

export type TributeTaskStatus = "pending" | "completed";

export type TributeGivingTask = {
  id: string;
  giverSeat: Seat;
  receiverSeat: Seat;
  requiredCount: number;
  selectedCardIds: string[];
  transferredCardIds: string[];
  status: TributeTaskStatus;
};

export type TributeReturnTask = {
  id: string;
  returnerSeat: Seat;
  receiverSeat: Seat;
  requiredCount: number;
  receivedTributeCardIds: string[];
  selectedCardIds: string[];
  transferredCardIds: string[];
  status: TributeTaskStatus;
};

export type TributeState = {
  totalTributes: number;
  dealerSeat: Seat;
  dealerPartnerSeat: Seat;
  givingTasks: TributeGivingTask[];
  returnTasks: TributeReturnTask[];
  status: TributePhaseStatus;
};

export type TributeAllocation = {
  dealerReceives: number;
  dealerPartnerReceives: number;
};

export type TributeCandidateLayer = {
  selectionIndex: number;
  candidates: Card[];
};

export type PlayCardsInput = {
  seat: Seat;
  cardIds: string[];
  declaredType: DeclaredPlayType;
};

export type RoundState = {
  roundNumber: number;
  phase: GamePhase;
  dealerSeat: Seat | null;
  trumpSuit: StandardSuit | null;
  pendingTributeCount?: number;
  previousWinningTeam?: Team | null;
  previousLosingTeam?: Team | null;
  hands: SeatHands;
  bottomCards: Card[];
  drawPile: Card[];
  dealOrder: DealOrderItem[];
  highestTrumpBid: TrumpBid | null;
  heavenlyTrumpPrompt: HeavenlyTrumpPrompt | null;
  previousWinnerTeam: Team | null;
  playerPrivileges: PlayerPrivileges;
  currentTrick: TrickState | null;
  defenderScore: number;
  trickHistory: ResolvedTrick[];
  roundResult: RoundResult | null;
  tributeState: TributeState | null;
  takenBottomCards: Card[];
  firstLeadSeat: Seat | null;
};

export type GameRuleErrorCode =
  | "INVALID_PHASE"
  | "ROUND_ALREADY_STARTED"
  | "CARD_NOT_IN_HAND"
  | "DUPLICATE_CARD_ID"
  | "INVALID_TRUMP_BID_COUNT"
  | "TRUMP_BID_CARDS_MUST_BE_TWOS"
  | "TRUMP_BID_SUITS_MUST_MATCH"
  | "TRUMP_BID_NOT_HIGHER"
  | "TRUMP_BID_SUIT_CANNOT_CHANGE"
  | "HEAVENLY_TRUMP_PROMPT_NOT_FOUND"
  | "NOT_HEAVENLY_TRUMP_CANDIDATE"
  | "HEAVENLY_TRUMP_BID_CANNOT_BE_RAISED"
  | "NOT_DEALER"
  | "INVALID_BOTTOM_SIZE"
  | "INVALID_HAND_SIZE"
  | "DEALER_NOT_SET"
  | "TRUMP_NOT_SET"
  | "CURRENT_TRICK_NOT_FOUND"
  | "TRICK_NOT_RESOLVED"
  | "TRICK_RESOLUTION_MISSING"
  | "TRICK_ALREADY_APPLIED"
  | "INVALID_TRICK_SEQUENCE"
  | "INCONSISTENT_FINAL_HANDS"
  | "INVALID_LAST_TRICK_MULTIPLIER"
  | "TRIBUTE_STATE_NOT_FOUND"
  | "INVALID_TRIBUTE_STATUS"
  | "TRIBUTE_TASK_NOT_FOUND"
  | "RETURN_TASK_NOT_FOUND"
  | "TRIBUTE_TASK_ALREADY_COMPLETED"
  | "RETURN_TASK_ALREADY_COMPLETED"
  | "NOT_TRIBUTE_GIVER"
  | "NOT_RETURNER"
  | "INVALID_TRIBUTE_COUNT"
  | "INVALID_TRIBUTE_ALLOCATION"
  | "CARD_NOT_HIGHEST"
  | "INVALID_TRIBUTE_SEQUENCE"
  | "INVALID_RETURN_OPTION"
  | "INSUFFICIENT_CARDS_FOR_TRIBUTE"
  | "TRIBUTE_TASKS_INCOMPLETE"
  | "RETURN_TASKS_INCOMPLETE"
  | "TRUMP_NOT_LOCKED"
  | "TRICK_NOT_FOUND"
  | "TRICK_ALREADY_COMPLETE"
  | "TRICK_NOT_READY"
  | "TRICK_ALREADY_RESOLVED"
  | "INVALID_PLAY_COUNT"
  | "DUPLICATE_PLAY_SEAT"
  | "INVALID_PLAY_ORDER"
  | "MISSING_LEAD_TYPE"
  | "MISSING_LEAD_CATEGORY"
  | "MISSING_EXPECTED_CARD_COUNT"
  | "INVALID_PLAY_CARD_COUNT"
  | "LEADER_PLAY_MISMATCH"
  | "INVALID_PLAY_RECORD"
  | "NOT_CURRENT_TURN"
  | "PLAYER_ALREADY_PLAYED"
  | "EMPTY_PLAY"
  | "INVALID_CARD_COUNT"
  | "INVALID_DECLARED_TYPE"
  | "LOOSE_CANNOT_LEAD"
  | "CARDS_DO_NOT_FORM_PAIR"
  | "CARDS_DO_NOT_FORM_TRIPLE"
  | "CARDS_DO_NOT_FORM_QUAD"
  | "LEAD_PRIVILEGE_LOST"
  | "MUST_FOLLOW_CATEGORY"
  | "MUST_EXHAUST_LEAD_CATEGORY"
  | "INVALID_GROUP_CATEGORY"
  | "INVALID_TRICK_STATE"
  | "BETWEEN_ROUNDS_STATE_NOT_FOUND"
  | "NOT_DEALER_CANDIDATE"
  | "DEALER_ALREADY_RESOLVED"
  | "DEALER_NOT_RESOLVED"
  | "INVALID_DEALER_CANDIDATES";

export type GameRuleError = {
  code: GameRuleErrorCode;
  message: string;
  requiredCategory?: PlayCategory;
  requiredCount?: number;
  selectedCount?: number;
  selectionIndex?: number;
  submittedCardId?: string;
  allowedCandidateIds?: string[];
  taskId?: string;
};

export type GameActionResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: GameRuleError;
    };

export type CardStrengthCategory =
  | "trump_five"
  | "big_joker"
  | "small_joker"
  | "offsuit_five"
  | "trump_three"
  | "offsuit_three"
  | "trump_two"
  | "offsuit_two"
  | "regular_trump"
  | "regular_suit";

export type CardStrength = {
  category: CardStrengthCategory;
  value: number;
  effectiveSuit: EffectiveSuit;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface Room {
  id: string;
  status: RoomStatus;
  roundNumber: number;
  currentState: ServerGameState | JsonObject;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomPlayer {
  id: string;
  roomId: string;
  seat: Seat;
  nickname: string;
  tokenHash: string;
  createdAt: string;
}

export interface PlayerSummary {
  id: string;
  seat: Seat;
  nickname: string;
}

export interface GameActionRecord {
  id: string;
  seat: Seat | null;
  phase: GamePhase;
  type: string;
  payload: JsonObject;
  createdAt: string;
}

export interface ServerGameState {
  schemaVersion: number;
  phase: GamePhase;
  currentSeat: Seat | null;
  roundNumber: number;
  readyState: PlayerReadyState;
  betweenRounds?: BetweenRoundsState;
  roundState?: RoundState;
  publicState: JsonObject;
  privateStateBySeat: Record<Seat, JsonObject>;
  actionHistory: JsonValue[];
  version: number;
}

export interface PlayerGameView {
  room: Room;
  player: PlayerSummary;
  players: PlayerSummary[];
  phase: GamePhase;
  currentSeat: Seat | null;
  roundNumber: number;
  publicState: JsonObject;
  privateState: JsonObject;
  actionHistory: JsonValue[];
  version: number;
}

export interface RoundRecord {
  id: string;
  roomId: string;
  roundNumber: number;
  record: JsonObject;
  createdAt: string;
}
