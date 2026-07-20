"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchGameState, GameApiError, ruleErrorMessage, submitGameAction } from "./game-api";
import { logGameActionPerformance, nowMs } from "./action-performance";
import { useGameRoomSocket } from "./use-game-room-socket";
import type { PlayerStateResponse } from "../game/state-service";
import type { PlayerGameStateView } from "../game/player-view";
import type { GameActionType } from "../realtime/protocol";

export type PendingGameAction = {
  actionType: GameActionType;
  requestId: string;
  baseVersion: number;
  startedAt: number;
};

const stateCache = new Map<string, PlayerStateResponse>();
const sessionStateCachePrefix = "diaozhu:player-state:";

function stateCacheKey(input: { roomId: string; playerToken: string }): string {
  return `${input.roomId}:${input.playerToken}`;
}

function readCachedState(cacheKey: string): PlayerStateResponse | null {
  const memoryState = stateCache.get(cacheKey);

  if (memoryState) {
    return memoryState;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(`${sessionStateCachePrefix}${cacheKey}`);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PlayerStateResponse;
  } catch {
    return null;
  }
}

function writeCachedState(cacheKey: string, nextState: PlayerStateResponse): void {
  stateCache.set(cacheKey, nextState);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${sessionStateCachePrefix}${cacheKey}`,
      JSON.stringify(nextState),
    );
  } catch {
    // Cache writes are best-effort only; the authoritative state still comes from the server.
  }
}

export function useGameRoomState(input: {
  roomId: string;
  playerToken: string;
}) {
  const cacheKey = stateCacheKey(input);
  const cachedState = readCachedState(cacheKey);
  const [state, setState] = useState<PlayerStateResponse | null>(cachedState);
  const [loading, setLoading] = useState(!cachedState);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingGameAction | null>(null);
  const inFlightRefreshRef = useRef(false);
  const stateRef = useRef<PlayerStateResponse | null>(cachedState);
  const latestVersionRef = useRef(cachedState?.room.version ?? 0);
  const pendingActionRef = useRef<PendingGameAction | null>(null);
  const deferredSocketVersionRef = useRef<number | null>(null);

  const commitState = useCallback(
    (nextState: PlayerStateResponse) => {
      latestVersionRef.current = nextState.room.version;
      stateRef.current = nextState;
      writeCachedState(cacheKey, nextState);
      setState(nextState);
    },
    [cacheKey],
  );

  const refresh = useCallback(async (): Promise<PlayerStateResponse | null> => {
    if (inFlightRefreshRef.current) {
      return null;
    }

    inFlightRefreshRef.current = true;

    try {
      const nextState = await fetchGameState(input.roomId, input.playerToken);
      commitState(nextState);
      setError(null);
      return nextState;
    } catch (requestError) {
      if (requestError instanceof GameApiError) {
        setError(ruleErrorMessage(requestError.code));
      } else {
        setError("网络连接失败，请稍后重试");
      }

      return null;
    } finally {
      setLoading(false);
      inFlightRefreshRef.current = false;
    }
  }, [commitState, input.playerToken, input.roomId]);

  const refreshDeferredSocketVersion = useCallback(
    async (actionType: GameActionType, requestId?: string) => {
      const deferredVersion = deferredSocketVersionRef.current;

      if (!deferredVersion || deferredVersion <= latestVersionRef.current) {
        deferredSocketVersionRef.current = null;
        return;
      }

      logGameActionPerformance({
        event: "deferred_refresh",
        actionType,
        requestId,
        socketVersion: deferredVersion,
      });
      deferredSocketVersionRef.current = null;
      await refresh();
    },
    [refresh],
  );

  const connectionStatus = useGameRoomSocket({
    roomId: input.roomId,
    playerToken: input.playerToken,
    onAuthenticated: (stateVersion) => {
      if (!stateRef.current || stateVersion > latestVersionRef.current) {
        void refresh();
      }
    },
    onStateChanged: (stateVersion, actionType) => {
      if (stateVersion <= latestVersionRef.current) {
        return;
      }

      const pending = pendingActionRef.current;

      if (pending) {
        deferredSocketVersionRef.current = Math.max(
          deferredSocketVersionRef.current ?? 0,
          stateVersion,
        );
        logGameActionPerformance({
          event: "socket_deferred",
          actionType,
          requestId: pending.requestId,
          baseVersion: pending.baseVersion,
          socketVersion: stateVersion,
        });
        return;
      }

      void refresh();
    },
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const submitAction = useCallback(
    async (actionInput: {
      actionType: GameActionType;
      payload?: unknown;
      requestId?: string;
    }): Promise<PlayerGameStateView | null> => {
      if (!state || pendingActionRef.current) {
        return null;
      }

      const requestId = actionInput.requestId ?? crypto.randomUUID();
      const baseVersion = state.room.version;
      const startedAt = nowMs();
      const nextPendingAction: PendingGameAction = {
        actionType: actionInput.actionType,
        requestId,
        baseVersion,
        startedAt,
      };
      pendingActionRef.current = nextPendingAction;
      setPendingAction(nextPendingAction);

      try {
        const view = await submitGameAction({
          roomId: input.roomId,
          playerToken: input.playerToken,
          requestId,
          expectedVersion: baseVersion,
          actionType: actionInput.actionType,
          payload: actionInput.payload,
        });

        latestVersionRef.current = view.stateVersion;
        const previous = stateRef.current;

        if (previous) {
          commitState({
            ...previous,
            room: {
              ...previous.room,
              roundNumber: view.roundNumber,
              version: view.stateVersion,
            },
            game: view,
          });
        }
        setError(null);
        logGameActionPerformance({
          event: "submit_success",
          actionType: actionInput.actionType,
          requestId,
          baseVersion,
          nextVersion: view.stateVersion,
          elapsedMs: nowMs() - startedAt,
        });
        await refreshDeferredSocketVersion(actionInput.actionType, requestId);

        return view;
      } catch (requestError) {
        if (requestError instanceof GameApiError && requestError.code === "STATE_VERSION_CONFLICT") {
          await refresh();
          setError("状态已更新，请重新操作");
          logGameActionPerformance({
            event: "submit_conflict",
            actionType: actionInput.actionType,
            requestId,
            baseVersion,
            elapsedMs: nowMs() - startedAt,
          });
          await refreshDeferredSocketVersion(actionInput.actionType, requestId);
          return null;
        }

        if (requestError instanceof GameApiError) {
          setError(ruleErrorMessage(requestError.code));
        } else {
          setError("网络连接失败，请稍后重试");
        }

        logGameActionPerformance({
          event: "submit_failed",
          actionType: actionInput.actionType,
          requestId,
          baseVersion,
          elapsedMs: nowMs() - startedAt,
        });
        await refreshDeferredSocketVersion(actionInput.actionType, requestId);

        return null;
      } finally {
        if (pendingActionRef.current?.requestId === requestId) {
          pendingActionRef.current = null;
          setPendingAction(null);
        }
      }
    },
    [commitState, input.playerToken, input.roomId, refresh, refreshDeferredSocketVersion, state],
  );

  return {
    view: state,
    loading,
    error,
    refresh,
    connectionStatus,
    pendingAction,
    submitAction,
  };
}
