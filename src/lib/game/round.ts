import { createDeck, shuffleDeck } from "./deck";
import { createInitialPlayerPrivileges } from "./privileges";
import { createTrick } from "./trick";
import type {
  Card,
  DealOrderItem,
  GameActionResult,
  GamePhase,
  GameRuleErrorCode,
  HeavenlyTrumpPrompt,
  RoundState,
  Seat,
  SeatHands,
  StandardSuit,
  Team,
  TrumpBid,
} from "./types";

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const CARDS_PER_PLAYER = 52;
const DEALT_CARD_COUNT = CARDS_PER_PLAYER * SEATS.length;
const BOTTOM_CARD_COUNT = 8;
const FULL_DECK_CARD_COUNT = 216;

type StartRoundInput = {
  roundNumber: number;
  dealerSeat?: Seat | null;
  previousWinnerTeam?: Team | null;
  previousLosingTeam?: Team | null;
  pendingTributeCount?: number;
  random?: () => number;
};

type PlaceTrumpBidInput = {
  seat: Seat;
  cardIds: string[];
};

type PlaceTrumpBidValue = {
  state: RoundState;
  highestTrumpBid: TrumpBid;
  shouldResetFinalBidTimer: boolean;
};

type ResolveFinalTrumpBiddingInput = {
  hasPendingTribute?: boolean;
};

type ResolveHeavenlyTrumpInput = {
  seat: Seat;
  accept: boolean;
};

type ResolveDealerSelectionInput = {
  winnerTeamSeats: readonly [Seat, Seat];
  clickedSeats: readonly Seat[];
  random?: () => number;
};

type TakeBottomCardsInput = {
  seat: Seat;
};

type BuryBottomInput = {
  seat: Seat;
  cardIds: string[];
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

export function assertGamePhase(
  currentPhase: GamePhase,
  allowedPhases: readonly GamePhase[],
): GameActionResult<true> {
  if (!allowedPhases.includes(currentPhase)) {
    return err("INVALID_PHASE", `Action is not allowed during phase ${currentPhase}.`);
  }

  return ok(true);
}

export function createEmptyHands(): SeatHands {
  return {
    0: [],
    1: [],
    2: [],
    3: [],
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

function cardIdSet(cards: readonly Card[]): Set<string> {
  return new Set(cards.map((card) => card.id));
}

function hasDuplicateCardIds(cardIds: readonly string[]): boolean {
  return new Set(cardIds).size !== cardIds.length;
}

function getCardsByIds(cards: readonly Card[], cardIds: readonly string[]): Card[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  return cardIds.flatMap((cardId) => {
    const card = cardsById.get(cardId);
    return card ? [card] : [];
  });
}

function countCardsBySeat(hands: SeatHands): number {
  return SEATS.reduce<number>((total, seat) => total + hands[seat].length, 0);
}

function findHeavenlyTrumpPrompt(cards: readonly Card[]): HeavenlyTrumpPrompt | null {
  for (let index = 0; index < DEALT_CARD_COUNT; index += 1) {
    const card = cards[index];

    if (!card || card.rank !== "2" || card.originalSuit === "joker") {
      continue;
    }

    return {
      seat: SEATS[index % SEATS.length],
      cardId: card.id,
      suit: card.originalSuit,
      resolved: false,
    };
  }

  return null;
}

export function startRound(input: StartRoundInput): GameActionResult<RoundState> {
  if (input.roundNumber < 1) {
    return err("ROUND_ALREADY_STARTED", "Round number must start at 1.");
  }

  const drawPile = shuffleDeck(createDeck(), input.random);

  return ok({
    roundNumber: input.roundNumber,
    phase: "dealing",
    dealerSeat: input.dealerSeat ?? null,
    trumpSuit: null,
    hands: createEmptyHands(),
    bottomCards: [],
    drawPile,
    dealOrder: [],
    highestTrumpBid: null,
    heavenlyTrumpPrompt: null,
    previousWinnerTeam: input.previousWinnerTeam ?? null,
    previousWinningTeam: input.previousWinnerTeam ?? null,
    previousLosingTeam: input.previousLosingTeam ?? null,
    pendingTributeCount: input.pendingTributeCount ?? 0,
    takenBottomCards: [],
    firstLeadSeat: null,
    playerPrivileges: createInitialPlayerPrivileges(),
    currentTrick: null,
    defenderScore: 0,
    trickHistory: [],
    roundResult: null,
    tributeState: null,
  });
}

export function dealCards(state: RoundState): GameActionResult<RoundState> {
  const phaseResult = assertGamePhase(state.phase, ["dealing"]);

  if (!phaseResult.ok) {
    return phaseResult;
  }

  if (
    state.drawPile.length !== FULL_DECK_CARD_COUNT ||
    countCardsBySeat(state.hands) !== 0 ||
    state.bottomCards.length !== 0
  ) {
    return err("ROUND_ALREADY_STARTED", "Cards have already been dealt for this round.");
  }

  const hands = createEmptyHands();
  const dealOrder: DealOrderItem[] = [];

  state.drawPile.slice(0, DEALT_CARD_COUNT).forEach((card, index) => {
    const seat = SEATS[index % SEATS.length];
    hands[seat].push(card);
    dealOrder.push({
      seat,
      cardId: card.id,
    });
  });

  const bottomCards = state.drawPile.slice(DEALT_CARD_COUNT);
  const heavenlyTrumpPrompt = findHeavenlyTrumpPrompt(state.drawPile);

  if (bottomCards.length !== BOTTOM_CARD_COUNT) {
    return err("INVALID_BOTTOM_SIZE", "Dealing must leave exactly 8 bottom cards.");
  }

  return ok({
    ...state,
    phase: heavenlyTrumpPrompt ? "heavenly_trump_bidding" : "final_trump_bidding",
    hands,
    bottomCards,
    drawPile: [],
    dealOrder,
    heavenlyTrumpPrompt,
  });
}

export function resolveHeavenlyTrump(
  state: RoundState,
  input: ResolveHeavenlyTrumpInput,
): GameActionResult<RoundState> {
  const phaseResult = assertGamePhase(state.phase, ["heavenly_trump_bidding"]);

  if (!phaseResult.ok) {
    return phaseResult;
  }

  const prompt = state.heavenlyTrumpPrompt;

  if (!prompt) {
    return err("HEAVENLY_TRUMP_PROMPT_NOT_FOUND", "Heavenly trump prompt is missing.");
  }

  if (input.seat !== prompt.seat) {
    return err("NOT_HEAVENLY_TRUMP_CANDIDATE", "Only the heavenly trump candidate can answer.");
  }

  return ok({
    ...state,
    phase: "final_trump_bidding",
    heavenlyTrumpPrompt: {
      ...prompt,
      resolved: true,
    },
    highestTrumpBid: input.accept
      ? {
          seat: prompt.seat,
          suit: prompt.suit,
          count: 3,
          isHeavenly: true,
        }
      : state.highestTrumpBid,
  });
}

export function enterFinalTrumpBidding(state: RoundState): GameActionResult<RoundState> {
  const phaseResult = assertGamePhase(state.phase, ["dealing"]);

  if (!phaseResult.ok) {
    return phaseResult;
  }

  return ok({
    ...state,
    phase: "final_trump_bidding",
  });
}

function validateTrumpBidCards(
  hand: readonly Card[],
  cardIds: readonly string[],
): GameActionResult<{
  cards: Card[];
  suit: StandardSuit;
  count: 1 | 2 | 3 | 4;
}> {
  if (cardIds.length < 1 || cardIds.length > 4) {
    return err("INVALID_TRUMP_BID_COUNT", "Trump bid must contain 1 to 4 cards.");
  }

  if (hasDuplicateCardIds(cardIds)) {
    return err("DUPLICATE_CARD_ID", "Trump bid cannot contain duplicate card ids.");
  }

  const handCardIds = cardIdSet(hand);

  if (cardIds.some((cardId) => !handCardIds.has(cardId))) {
    return err("CARD_NOT_IN_HAND", "Trump bid contains a card outside the player's hand.");
  }

  const cards = getCardsByIds(hand, cardIds);

  if (cards.some((card) => card.rank !== "2")) {
    return err("TRUMP_BID_CARDS_MUST_BE_TWOS", "Trump bid cards must all be 2s.");
  }

  if (cards.some((card) => card.originalSuit === "joker")) {
    return err("TRUMP_BID_CARDS_MUST_BE_TWOS", "Jokers cannot be used for trump bids.");
  }

  const firstCard = cards[0];

  if (!firstCard || firstCard.originalSuit === "joker") {
    return err("TRUMP_BID_CARDS_MUST_BE_TWOS", "Trump bid must use standard-suit 2s.");
  }

  if (cards.some((card) => card.originalSuit !== firstCard.originalSuit)) {
    return err("TRUMP_BID_SUITS_MUST_MATCH", "Trump bid 2s must share one original suit.");
  }

  return ok({
    cards,
    suit: firstCard.originalSuit,
    count: cardIds.length as 1 | 2 | 3 | 4,
  });
}

export function placeTrumpBid(
  state: RoundState,
  input: PlaceTrumpBidInput,
): GameActionResult<PlaceTrumpBidValue> {
  const phaseResult = assertGamePhase(state.phase, ["dealing", "final_trump_bidding"]);

  if (!phaseResult.ok) {
    return phaseResult;
  }

  const validation = validateTrumpBidCards(state.hands[input.seat], input.cardIds);

  if (!validation.ok) {
    return validation;
  }

  const currentBid = state.highestTrumpBid;
  const nextBid: TrumpBid = {
    seat: input.seat,
    suit: validation.value.suit,
    count: validation.value.count,
  };

  if (currentBid) {
    if (currentBid.isHeavenly && currentBid.seat === input.seat) {
      return err(
        "HEAVENLY_TRUMP_BID_CANNOT_BE_RAISED",
        "Heavenly trump bidder cannot increase their own heavenly bid.",
      );
    }

    if (currentBid.seat === input.seat && currentBid.suit !== nextBid.suit) {
      return err(
        "TRUMP_BID_SUIT_CANNOT_CHANGE",
        "Current highest bidder cannot change trump bid suit.",
      );
    }

    if (nextBid.count <= currentBid.count) {
      return err("TRUMP_BID_NOT_HIGHER", "Trump bid must use more 2s than current bid.");
    }
  }

  const nextState = {
    ...state,
    highestTrumpBid: nextBid,
  };

  return ok({
    state: nextState,
    highestTrumpBid: nextBid,
    shouldResetFinalBidTimer: state.phase === "final_trump_bidding",
  });
}

export function determineTrumpFromBottom(
  bottomCards: readonly Card[],
): GameActionResult<StandardSuit> {
  if (bottomCards.length !== BOTTOM_CARD_COUNT) {
    return err("INVALID_BOTTOM_SIZE", "Bottom cards must contain exactly 8 cards.");
  }

  for (const card of bottomCards) {
    if (card.originalSuit !== "joker") {
      return ok(card.originalSuit);
    }
  }

  return ok("spades");
}

export function resolveFinalTrumpBidding(
  state: RoundState,
  input: ResolveFinalTrumpBiddingInput = {},
): GameActionResult<RoundState> {
  const phaseResult = assertGamePhase(state.phase, ["final_trump_bidding"]);

  if (!phaseResult.ok) {
    return phaseResult;
  }

  const nextPhase: GamePhase = input.hasPendingTribute ? "tribute" : "taking_bottom";

  if (state.highestTrumpBid) {
    return ok({
      ...state,
      dealerSeat:
        state.roundNumber === 1
          ? state.highestTrumpBid.seat
          : (state.dealerSeat ?? state.highestTrumpBid.seat),
      trumpSuit: state.highestTrumpBid.suit,
      phase: nextPhase,
    });
  }

  const trumpResult = determineTrumpFromBottom(state.bottomCards);

  if (!trumpResult.ok) {
    return trumpResult;
  }

  return ok({
    ...state,
    dealerSeat: state.roundNumber === 1 ? (state.dealerSeat ?? 0) : state.dealerSeat,
    trumpSuit: trumpResult.value,
    phase: nextPhase,
  });
}

export function resolveDealerSelection(input: ResolveDealerSelectionInput): Seat {
  const clickedWinnerSeats = input.winnerTeamSeats.filter((seat, index) => {
    const clicked = input.clickedSeats.includes(seat);
    return clicked && input.winnerTeamSeats.indexOf(seat) === index;
  });

  if (clickedWinnerSeats.length === 1) {
    return clickedWinnerSeats[0] ?? input.winnerTeamSeats[0];
  }

  const random = input.random ?? Math.random;
  const selectedIndex = Math.min(
    input.winnerTeamSeats.length - 1,
    Math.floor(random() * input.winnerTeamSeats.length),
  );

  return input.winnerTeamSeats[selectedIndex] ?? input.winnerTeamSeats[0];
}

export function takeBottomCards(
  state: RoundState,
  input: TakeBottomCardsInput,
): GameActionResult<RoundState> {
  const phaseResult = assertGamePhase(state.phase, ["taking_bottom"]);

  if (!phaseResult.ok) {
    return phaseResult;
  }

  if (state.dealerSeat === null || input.seat !== state.dealerSeat) {
    return err("NOT_DEALER", "Only the dealer can take bottom cards.");
  }

  if (!state.trumpSuit) {
    return err("TRUMP_NOT_LOCKED", "Trump suit must be locked before taking bottom cards.");
  }

  if (state.bottomCards.length !== BOTTOM_CARD_COUNT) {
    return err("INVALID_BOTTOM_SIZE", "Dealer can only take exactly 8 bottom cards.");
  }

  if (state.hands[state.dealerSeat].length !== CARDS_PER_PLAYER) {
    return err("INVALID_HAND_SIZE", "Dealer must have exactly 52 cards before taking bottom.");
  }

  const hands = cloneHands(state.hands);
  const takenBottomCards = [...state.bottomCards];

  hands[state.dealerSeat] = [...hands[state.dealerSeat], ...takenBottomCards];

  return ok({
    ...state,
    phase: "burying_bottom",
    hands,
    bottomCards: [],
    takenBottomCards,
  });
}

export function buryBottom(
  state: RoundState,
  input: BuryBottomInput,
): GameActionResult<RoundState> {
  const phaseResult = assertGamePhase(state.phase, ["burying_bottom"]);

  if (!phaseResult.ok) {
    return phaseResult;
  }

  if (state.dealerSeat === null || input.seat !== state.dealerSeat) {
    return err("NOT_DEALER", "Only the dealer can bury bottom cards.");
  }

  if (input.cardIds.length !== BOTTOM_CARD_COUNT) {
    return err("INVALID_BOTTOM_SIZE", "Dealer must bury exactly 8 cards.");
  }

  if (hasDuplicateCardIds(input.cardIds)) {
    return err("DUPLICATE_CARD_ID", "Bury bottom cannot contain duplicate card ids.");
  }

  const dealerHand = state.hands[state.dealerSeat];

  if (dealerHand.length !== CARDS_PER_PLAYER + BOTTOM_CARD_COUNT) {
    return err("INVALID_HAND_SIZE", "Dealer must have exactly 60 cards before burying.");
  }

  const dealerCardIds = cardIdSet(dealerHand);

  if (input.cardIds.some((cardId) => !dealerCardIds.has(cardId))) {
    return err("CARD_NOT_IN_HAND", "Bury bottom contains a card outside the dealer hand.");
  }

  const buriedCards = getCardsByIds(dealerHand, input.cardIds);
  const buriedCardIds = cardIdSet(buriedCards);
  const hands = cloneHands(state.hands);

  hands[state.dealerSeat] = dealerHand.filter((card) => !buriedCardIds.has(card.id));

  if (hands[state.dealerSeat].length !== CARDS_PER_PLAYER) {
    return err("INVALID_HAND_SIZE", "Dealer must have exactly 52 cards after burying.");
  }

  return ok({
    ...state,
    phase: "playing",
    hands,
    bottomCards: buriedCards,
    firstLeadSeat: state.dealerSeat,
    currentTrick: createTrick(1, state.dealerSeat),
  });
}
