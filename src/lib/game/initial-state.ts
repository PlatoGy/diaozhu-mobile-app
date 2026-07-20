import type { ServerGameState } from "./types";

export function createInitialGameState(): ServerGameState {
  return {
    schemaVersion: 1,
    phase: "waiting_for_players",
    currentSeat: null,
    roundNumber: 0,
    readyState: {
      0: false,
      1: false,
      2: false,
      3: false,
    },
    publicState: {},
    privateStateBySeat: {
      0: {},
      1: {},
      2: {},
      3: {},
    },
    actionHistory: [],
    version: 1,
  };
}
