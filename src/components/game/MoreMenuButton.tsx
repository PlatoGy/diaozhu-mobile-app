"use client";

import { useState } from "react";

import type { SocketConnectionStatus } from "@/src/lib/client/use-game-room-socket";

import { connectionStatusLabel } from "./ConnectionStatus";

export function MoreMenuButton({ connectionStatus }: { connectionStatus: SocketConnectionStatus }) {
  const [open, setOpen] = useState(false);

  function exitRoom() {
    window.location.assign("/");
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="更多"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-white/10 text-xl leading-none text-white"
      >
        ⋯
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-30 w-36 rounded-md border border-white/15 bg-[#102c25] p-2 text-xs text-white shadow-lg">
          <div className="px-2 py-1 text-white/75">
            网络：{connectionStatusLabel(connectionStatus)}
          </div>
          <button
            type="button"
            onClick={exitRoom}
            className="mt-1 h-8 w-full rounded-md bg-white/10 px-2 text-left font-semibold text-white transition hover:bg-white/16"
          >
            退出牌桌
          </button>
        </div>
      ) : null}
    </div>
  );
}
