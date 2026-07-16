"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PlayerStateResponse } from "@/src/lib/game/state-service";

type GamePageClientProps = {
  roomId: string;
  playerToken: string;
};

type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

const POLL_INTERVAL_MS = 1500;

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiError).error?.code === "string" &&
    typeof (value as ApiError).error?.message === "string"
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function shortRoomId(roomId: string): string {
  return roomId.length > 8 ? roomId.slice(0, 8) : roomId;
}

function messageForError(error: ApiError | null, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (error.error.code === "INVALID_PLAYER_LINK") {
    return "玩家链接无效，请确认你打开的是创建牌桌时生成的专属链接。";
  }

  if (error.error.code === "ROOM_NOT_FOUND") {
    return "房间不存在或已被删除。";
  }

  return error.error.message;
}

export function GamePageClient({ roomId, playerToken }: GamePageClientProps) {
  const [state, setState] = useState<PlayerStateResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const displayRoomId = useMemo(() => shortRoomId(roomId), [roomId]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    async function refreshState() {
      if (inFlightRef.current || disposed) {
        return;
      }

      inFlightRef.current = true;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(`/api/game/${roomId}/state`, {
          headers: {
            "x-player-token": playerToken,
          },
          signal: controller.signal,
        });
        const payload = await parseJsonResponse(response);

        if (!response.ok) {
          setError(
            isApiError(payload)
              ? payload
              : {
                  error: {
                    code: "GAME_STATE_FAILED",
                    message: "牌局状态读取失败。",
                  },
                },
          );
          setNetworkError(false);
          return;
        }

        setState(payload as PlayerStateResponse);
        setError(null);
        setNetworkError(false);
        setLastUpdatedAt(new Date());
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }

        setNetworkError(true);
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    }

    function clearPolling() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    function configurePolling() {
      clearPolling();

      if (document.visibilityState === "visible") {
        interval = setInterval(refreshState, POLL_INTERVAL_MS);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshState();
      }

      configurePolling();
    }

    void refreshState();
    configurePolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      clearPolling();
      abortControllerRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [playerToken, roomId]);

  const errorMessage = networkError
    ? "网络连接失败，请稍后重试。"
    : messageForError(error, "牌局状态读取失败。");

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#1f2933]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6">
        <header className="rounded-lg border border-[#d8d7cf] bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-[#667085]">牌局页面</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#111827]">
            房间 {displayRoomId}
          </h1>
        </header>

        {isLoading && !state ? (
          <section className="rounded-lg border border-[#d8d7cf] bg-white p-5 text-sm text-[#667085] shadow-sm">
            正在读取牌局状态...
          </section>
        ) : null}

        {!isLoading && !state && (error || networkError) ? (
          <section className="rounded-lg border border-[#fecaca] bg-[#fff1f2] p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#b42318]">无法进入牌桌</h2>
            <p className="mt-2 text-sm text-[#7f1d1d]">{errorMessage}</p>
          </section>
        ) : null}

        {state ? (
          <>
            <section className="rounded-lg border border-[#d8d7cf] bg-white p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-[#667085]">当前玩家</p>
                  <p className="mt-1 text-xl font-semibold text-[#111827]">
                    {state.me.nickname}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#667085]">固定座位</p>
                  <p className="mt-1 text-xl font-semibold text-[#111827]">
                    座位 {state.me.seat}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#667085]">房间状态</p>
                  <p className="mt-1 font-medium text-[#111827]">{state.room.status}</p>
                </div>
                <div>
                  <p className="text-sm text-[#667085]">当前局数</p>
                  <p className="mt-1 font-medium text-[#111827]">
                    {state.room.roundNumber}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#667085]">
                {lastUpdatedAt ? `最后更新 ${lastUpdatedAt.toLocaleTimeString()}` : ""}
              </p>
            </section>

            <section className="rounded-lg border border-[#d8d7cf] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-[#111827]">玩家座位</h2>
              <div className="mt-3 grid gap-2">
                {state.players.map((player) => (
                  <div
                    key={player.seat}
                    className="flex items-center justify-between rounded-md border border-[#e4e2da] bg-[#fbfbf8] px-3 py-2"
                  >
                    <span className="text-sm font-medium text-[#344054]">
                      座位 {player.seat}
                    </span>
                    <span className="text-sm text-[#111827]">{player.nickname}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#d8d7cf] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[#667085]">当前通用阶段</p>
                  <h2 className="mt-1 text-xl font-semibold text-[#111827]">
                    {state.game.phase}
                  </h2>
                </div>
                <span className="rounded-md bg-[#e0f2fe] px-2 py-1 text-xs font-medium text-[#075985]">
                  v{state.room.version}
                </span>
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-[#c9c8c0] bg-[#f8fafc] p-5 text-center">
                <p className="font-medium text-[#344054]">游戏规则尚未配置</p>
                <p className="mt-2 text-sm text-[#667085]">
                  当前页面只提供玩家身份、座位和通用状态读取框架。
                </p>
              </div>
            </section>

            {networkError ? (
              <p className="rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a3412]">
                网络连接失败，页面会继续尝试刷新。
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
