"use client";

import { useEffect, useRef, useState } from "react";

import type { GameActionType, ServerWebSocketMessage } from "../realtime/protocol";

export type SocketConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 10_000] as const;

export function getReconnectDelayMs(attempt: number): number {
  return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
}

function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/ws`;
}

function parseServerMessage(value: string): ServerWebSocketMessage | null {
  try {
    return JSON.parse(value) as ServerWebSocketMessage;
  } catch {
    return null;
  }
}

export function useGameRoomSocket(input: {
  roomId: string;
  playerToken: string;
  onStateChanged: (stateVersion: number, actionType: GameActionType) => void;
  onAuthenticated?: (stateVersion: number) => void;
}) {
  const [status, setStatus] = useState<SocketConnectionStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const disposedRef = useRef(false);
  const onStateChangedRef = useRef(input.onStateChanged);
  const onAuthenticatedRef = useRef(input.onAuthenticated);

  useEffect(() => {
    onStateChangedRef.current = input.onStateChanged;
    onAuthenticatedRef.current = input.onAuthenticated;
  }, [input.onAuthenticated, input.onStateChanged]);

  useEffect(() => {
    disposedRef.current = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function connect() {
      if (disposedRef.current || socketRef.current) {
        return;
      }

      setStatus(reconnectAttemptRef.current === 0 ? "connecting" : "reconnecting");
      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "AUTH",
            roomId: input.roomId,
            playerToken: input.playerToken,
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const message = parseServerMessage(event.data);

        if (!message) {
          return;
        }

        if (message.type === "AUTH_OK") {
          reconnectAttemptRef.current = 0;
          setStatus("connected");
          onAuthenticatedRef.current?.(message.stateVersion);
          return;
        }

        if (message.type === "ROOM_STATE_CHANGED") {
          onStateChangedRef.current(message.stateVersion, message.actionType);
          return;
        }

        if (message.type === "ERROR") {
          setStatus("error");
        }
      });

      socket.addEventListener("close", () => {
        socketRef.current = null;

        if (disposedRef.current) {
          setStatus("disconnected");
          return;
        }

        const delay = getReconnectDelayMs(reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        setStatus("reconnecting");
        reconnectTimerRef.current = setTimeout(connect, delay);
      });

      socket.addEventListener("error", () => {
        setStatus("error");
      });
    }

    connect();

    return () => {
      disposedRef.current = true;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [input.playerToken, input.roomId]);

  return status;
}
