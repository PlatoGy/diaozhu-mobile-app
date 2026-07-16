import type { ServerGameState } from "./types";

export function createInitialGameState(): ServerGameState {
  return {
    phase: "waiting",
    currentSeat: null,
    roundNumber: 0,
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
