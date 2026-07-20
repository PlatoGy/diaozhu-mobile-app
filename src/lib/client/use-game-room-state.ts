"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchGameState, GameApiError, ruleErrorMessage, submitGameAction } from "./game-api";
import { useGameRoomSocket } from "./use-game-room-socket";
import type { PlayerStateResponse } from "../game/state-service";
import type { PlayerGameStateView } from "../game/player-view";
import type { GameActionType } from "../realtime/protocol";

export function useGameRoomState(input: {
  roomId: string;
  playerToken: string;
}) {
  const [state, setState] = useState<PlayerStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRefreshRef = useRef(false);
  const latestVersionRef = useRef(0);

  const refresh = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      return;
    }

    inFlightRefreshRef.current = true;

    try {
      const nextState = await fetchGameState(input.roomId, input.playerToken);
      latestVersionRef.current = nextState.room.version;
      setState(nextState);
      setError(null);
    } catch (requestError) {
      if (requestError instanceof GameApiError) {
        setError(ruleErrorMessage(requestError.code));
      } else {
        setError("网络连接失败，请稍后重试");
      }
    } finally {
      setLoading(false);
      inFlightRefreshRef.current = false;
    }
  }, [input.playerToken, input.roomId]);

  const connectionStatus = useGameRoomSocket({
    roomId: input.roomId,
    playerToken: input.playerToken,
    onAuthenticated: refresh,
    onStateChanged: (stateVersion) => {
      if (stateVersion <= latestVersionRef.current) {
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
      if (!state) {
        return null;
      }

      const requestId = actionInput.requestId ?? crypto.randomUUID();

      try {
        const view = await submitGameAction({
          roomId: input.roomId,
          playerToken: input.playerToken,
          requestId,
          expectedVersion: state.room.version,
          actionType: actionInput.actionType,
          payload: actionInput.payload,
        });

        latestVersionRef.current = view.stateVersion;
        setState((previous) =>
          previous
            ? {
                ...previous,
                room: {
                  ...previous.room,
                  roundNumber: view.roundNumber,
                  version: view.stateVersion,
                },
                game: view,
              }
            : previous,
        );
        setError(null);

        return view;
      } catch (requestError) {
        if (requestError instanceof GameApiError && requestError.code === "STATE_VERSION_CONFLICT") {
          await refresh();
          setError("状态已更新，请重新操作");
          return null;
        }

        if (requestError instanceof GameApiError) {
          setError(ruleErrorMessage(requestError.code));
        } else {
          setError("网络连接失败，请稍后重试");
        }

        return null;
      }
    },
    [input.playerToken, input.roomId, refresh, state],
  );

  return {
    view: state,
    loading,
    error,
    refresh,
    connectionStatus,
    submitAction,
  };
}
