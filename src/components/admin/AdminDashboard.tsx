"use client";

import { useState } from "react";

type Seat = 0 | 1 | 2 | 3;

type CreatedRoomPlayer = {
  seat: Seat;
  nickname: string;
  joinCode: string;
  playerPath: string;
};

type CreatedRoom = {
  roomId: string;
  roomCode: string;
  players: CreatedRoomPlayer[];
};

type DisplayCreatedRoom = {
  roomId: string;
  roomCode: string;
  players: (CreatedRoomPlayer & {
    playerUrl: string;
  })[];
};

type RoomListPlayer = {
  seat: Seat;
  nickname: string;
  joinCode: string | null;
};

type RoomListItem = {
  id: string;
  roomCode: string | null;
  status: string;
  roundNumber: number;
  createdAt: string;
  updatedAt: string;
  players: RoomListPlayer[];
};

type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

const emptyNicknames = ["", "", "", ""];

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
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

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  return isApiError(payload) ? payload.error.message : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function withAbsoluteUrls(room: CreatedRoom): DisplayCreatedRoom {
  const origin = window.location.origin;

  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    players: room.players.map((player) => ({
      ...player,
      playerUrl: new URL(player.playerPath, origin).toString(),
    })),
  };
}

export function AdminDashboard() {
  const [adminSecret, setAdminSecret] = useState("");
  const [nicknames, setNicknames] = useState(emptyNicknames);
  const [createdRooms, setCreatedRooms] = useState<DisplayCreatedRoom[]>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [createError, setCreateError] = useState("");
  const [listError, setListError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

  function updateNickname(index: number, value: string) {
    setNicknames((current) =>
      current.map((nickname, currentIndex) =>
        currentIndex === index ? value : nickname,
      ),
    );
  }

  async function copyText(text: string, successMessage: string) {
    setCopyMessage("");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(successMessage);
    } catch {
      setCopyMessage("复制失败，请手动选择内容复制。");
    }
  }

  async function loadRooms() {
    setListError("");
    setIsLoadingRooms(true);

    try {
      const response = await fetch("/api/rooms", {
        headers: {
          "x-admin-secret": adminSecret,
        },
      });
      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        setListError(errorMessageFromPayload(payload, "读取牌桌失败。"));
        setRooms([]);
        return;
      }

      const listPayload = payload as { rooms: RoomListItem[] };
      setRooms(listPayload.rooms);
    } catch {
      setListError("读取牌桌失败，请稍后重试。");
      setRooms([]);
    } finally {
      setIsLoadingRooms(false);
    }
  }

  async function createRoom() {
    setCreateError("");
    setCopyMessage("");

    if (adminSecret.trim().length === 0) {
      setCreateError("请输入管理密码。");
      return;
    }

    const firstMissingNicknameIndex = nicknames.findIndex((nickname) => nickname.trim().length === 0);

    if (firstMissingNicknameIndex !== -1) {
      setCreateError(`请输入座位 ${firstMissingNicknameIndex + 1} 的昵称。`);
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          adminSecret,
          players: nicknames.map((nickname) => ({ nickname })),
        }),
      });
      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        setCreateError(errorMessageFromPayload(payload, "创建牌桌失败。"));
        return;
      }

      const room = payload as CreatedRoom;
      setCreatedRooms((current) => [withAbsoluteUrls(room), ...current]);
      setNicknames(emptyNicknames);
      await loadRooms();
    } catch {
      setCreateError("创建牌桌失败，请稍后重试。");
    } finally {
      setIsCreating(false);
    }
  }

  async function deleteRoom(roomId: string) {
    setListError("");
    setDeletingRoomId(roomId);

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: "DELETE",
        headers: {
          "x-admin-secret": adminSecret,
        },
      });
      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        setListError(errorMessageFromPayload(payload, "删除牌桌失败。"));
        return;
      }

      setRooms((current) => current.filter((room) => room.id !== roomId));
    } catch {
      setListError("删除牌桌失败，请稍后重试。");
    } finally {
      setDeletingRoomId(null);
    }
  }

  function roomLinksText(room: DisplayCreatedRoom): string {
    return room.players
      .map(
        (player) =>
          `座位 ${player.seat + 1} ${player.nickname}: ${player.joinCode} ${player.playerUrl}`,
      )
      .join("\n");
  }

  const allCreatedLinksText = createdRooms
    .flatMap((room) => [
      `牌桌 ${room.roomCode} (${room.roomId})`,
      roomLinksText(room),
    ])
    .join("\n\n");

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#1f2933]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2 border-b border-[#d8d7cf] pb-5">
          <p className="text-sm font-medium text-[#667085]">吊主Diao Zhu</p>
          <h1 className="text-3xl font-semibold tracking-normal text-[#111827]">
            牌局生成管理台
          </h1>
          <p className="text-sm text-[#667085]">玩家入口在首页，管理台地址为 /manage。</p>
        </header>

        <section className="rounded-lg border border-[#d8d7cf] bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label
                className="mb-2 block text-sm font-medium text-[#344054]"
                htmlFor="admin-secret"
              >
                管理密码
              </label>
              <input
                id="admin-secret"
                type="password"
                value={adminSecret}
                onChange={(event) => setAdminSecret(event.target.value)}
                className="h-11 w-full rounded-md border border-[#c9c8c0] bg-white px-3 text-base outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                autoComplete="current-password"
              />
            </div>
            <button
              type="button"
              disabled={adminSecret.trim().length === 0 || isLoadingRooms}
              onClick={loadRooms}
              className="h-11 rounded-md border border-[#9aa4b2] px-4 text-sm font-medium transition hover:bg-[#f2f4f7] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
            >
              {isLoadingRooms ? "查询中" : "查询牌局列表"}
            </button>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="rounded-lg border border-[#d8d7cf] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#111827]">牌局列表</h2>
                <p className="mt-1 text-sm text-[#667085]">列表会显示五位房间号，方便重新分享给玩家。</p>
              </div>
              <button
                type="button"
                disabled={adminSecret.trim().length === 0 || isLoadingRooms}
                onClick={loadRooms}
                className="h-10 rounded-md border border-[#9aa4b2] px-3 text-sm font-medium transition hover:bg-[#f2f4f7] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
              >
                {isLoadingRooms ? "查询中" : "刷新"}
              </button>
            </div>

            {listError ? (
              <p className="mt-3 rounded-md border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#b42318]">
                {listError}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-3">
              {rooms.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#c9c8c0] px-3 py-6 text-center text-sm text-[#667085]">
                  输入正确管理密码后刷新牌桌列表。
                </p>
              ) : null}

              {rooms.map((room) => (
                <article
                  key={room.id}
                  className="rounded-lg border border-[#e4e2da] bg-[#fbfbf8] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-2xl font-black text-[#111827]">
                        房号 {room.roomCode ?? "未生成"}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-[#475467]">{room.id}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-md bg-[#e0f2fe] px-2 py-1 text-[#075985]">
                          {room.status}
                        </span>
                        <span className="rounded-md bg-[#ecfdf3] px-2 py-1 text-[#166534]">
                          当前局数 {room.roundNumber}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={deletingRoomId === room.id}
                      onClick={() => deleteRoom(room.id)}
                      className="h-9 shrink-0 rounded-md border border-[#fda29b] px-3 text-sm font-medium text-[#b42318] transition hover:bg-[#fff1f2] disabled:cursor-not-allowed disabled:text-[#d0d5dd]"
                    >
                      {deletingRoomId === room.id ? "删除中" : "删除"}
                    </button>
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm text-[#475467]">
                    <div>
                      <dt className="font-medium text-[#344054]">玩家</dt>
                      <dd className="mt-1 flex flex-wrap gap-2">
                        {room.players.map((player) => (
                          <span
                            key={player.seat}
                            className="rounded-md border border-[#d0d5dd] bg-white px-2 py-1"
                          >
                            座位 {player.seat + 1}: {player.nickname}
                            {player.joinCode ? ` · ${player.joinCode}` : ""}
                          </span>
                        ))}
                      </dd>
                    </div>
                    <div className="grid gap-1 text-xs">
                      <span>创建：{formatDate(room.createdAt)}</span>
                      <span>更新：{formatDate(room.updatedAt)}</span>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[#d8d7cf] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#111827]">创建牌局</h2>
              <p className="mt-1 text-sm text-[#667085]">
                创建后会生成四个五位房间号，前四位相同，最后一位代表座位 1-4。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {nicknames.map((nickname, index) => (
                <div key={index}>
                  <label
                    className="mb-2 block text-sm font-medium text-[#344054]"
                    htmlFor={`nickname-${index}`}
                  >
                    座位 {index + 1} 昵称
                  </label>
                  <input
                    id={`nickname-${index}`}
                    value={nickname}
                    onChange={(event) => updateNickname(index, event.target.value)}
                    maxLength={24}
                    className="h-11 w-full rounded-md border border-[#c9c8c0] bg-white px-3 text-base outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                  />
                </div>
              ))}
            </div>

            {createError ? (
              <p className="rounded-md border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#b42318]">
                {createError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={isCreating}
              onClick={createRoom}
              className="h-11 rounded-md bg-[#14532d] px-4 text-base font-medium text-white transition hover:bg-[#166534] disabled:cursor-not-allowed disabled:bg-[#9ca3af]"
            >
              {isCreating ? "创建中..." : "创建牌桌"}
            </button>
          </div>
        </section>

        {createdRooms.length > 0 ? (
          <section className="rounded-lg border border-[#facc15] bg-[#fffbeb] p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#111827]">
                  本次创建的房间号
                </h2>
                <p className="mt-1 text-sm font-medium text-[#92400e]">
                  五位码可从牌局列表恢复；链接也会保留到页面重新加载。
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyText(allCreatedLinksText, "本次创建的全部房间号已复制。")}
                className="h-10 rounded-md bg-[#7c2d12] px-3 text-sm font-medium text-white transition hover:bg-[#9a3412]"
              >
                复制全部
              </button>
            </div>

            {copyMessage ? (
              <p className="mt-3 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">
                {copyMessage}
              </p>
            ) : null}

            <div className="mt-4 grid gap-4">
              {createdRooms.map((room) => (
                <article
                  key={room.roomId}
                  className="rounded-lg border border-[#fde68a] bg-white p-3"
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="min-w-0 font-medium text-[#111827]">
                      已创建房号 <span className="font-mono text-2xl font-black text-[#111827]">{room.roomCode}</span>
                      <span className="ml-2 font-mono text-xs text-[#475467]">{room.roomId}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => copyText(roomLinksText(room), "该牌桌房间号已复制。")}
                      className="h-9 rounded-md border border-[#a16207] px-3 text-sm font-medium text-[#854d0e] transition hover:bg-[#fef3c7]"
                    >
                      复制该牌桌
                    </button>
                  </div>
                  <div className="grid gap-3">
                    {room.players.map((player) => (
                      <div
                        key={player.seat}
                        className="rounded-lg border border-[#fde68a] bg-[#fffcf0] p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="font-medium text-[#111827]">
                            座位 {player.seat + 1} · {player.nickname}
                          </p>
                          <button
                            type="button"
                            onClick={() => copyText(player.joinCode, "房间号已复制。")}
                            className="h-9 rounded-md border border-[#a16207] px-3 text-sm font-medium text-[#854d0e] transition hover:bg-[#fef3c7]"
                          >
                            复制房号
                          </button>
                        </div>
                        <p className="rounded-md bg-[#f8fafc] p-2 font-mono text-2xl font-black text-[#111827]">
                          {player.joinCode}
                        </p>
                        <p className="mt-2 break-all rounded-md bg-[#f8fafc] p-2 font-mono text-xs text-[#344054]">
                          备用链接：{player.playerUrl}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
