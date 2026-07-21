"use client";

import { useState } from "react";

type OrientationLock = {
  lock?: (orientation: "landscape") => Promise<void>;
};

async function requestLandscapeFullscreen(): Promise<"ok" | "unsupported" | "failed"> {
  const root = document.documentElement;
  let requestedSomething = false;

  if (!document.fullscreenElement && root.requestFullscreen) {
    requestedSomething = true;
    await root.requestFullscreen();
  }

  const orientation = screen.orientation as OrientationLock | undefined;

  if (orientation?.lock) {
    requestedSomething = true;
    await orientation.lock("landscape");
  }

  return requestedSomething ? "ok" : "unsupported";
}

export function PortraitOrientationOverlay() {
  const [message, setMessage] = useState("点按图标尝试全屏横屏");

  async function handleActivate() {
    try {
      const result = await requestLandscapeFullscreen();

      setMessage(
        result === "unsupported"
          ? "当前浏览器不支持自动横屏，请手动旋转或添加到主屏幕"
          : "已请求全屏横屏，请旋转手机",
      );
    } catch {
      setMessage("当前浏览器拦截了自动横屏，请手动旋转或添加到主屏幕");
    }
  }

  return (
    <div className="fixed inset-0 z-50 hidden place-items-center bg-[#0b3027] p-8 text-center text-white portrait:grid">
      <div>
        <button
          type="button"
          onClick={handleActivate}
          className="mx-auto mb-4 grid h-16 w-10 rotate-90 touch-manipulation place-items-center rounded-xl border-2 border-white/60 text-2xl active:scale-95"
          aria-label="尝试全屏横屏"
        >
          ↻
        </button>
        <p className="text-xl font-semibold">请将手机横过来</p>
        <p className="mt-3 text-sm text-white/70">{message}</p>
      </div>
    </div>
  );
}
