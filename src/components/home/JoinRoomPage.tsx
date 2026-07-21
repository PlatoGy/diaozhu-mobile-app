"use client";

import { useState } from "react";

type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

type JoinRoomResponse = {
  playerPath: string;
};

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

export function JoinRoomPage() {
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateJoinCode(value: string) {
    setJoinCode(value.replace(/\D/g, "").slice(0, 5));
    setError("");
  }

  async function submitJoinCode() {
    if (!/^\d{5}$/.test(joinCode)) {
      setError("请输入五位房间号。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ joinCode }),
      });
      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        setError(isApiError(payload) ? payload.error.message : "进入房间失败。");
        return;
      }

      const result = payload as JoinRoomResponse;
      window.location.assign(result.playerPath);
    } catch {
      setError("网络连接失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b3027] px-5 py-8 text-[#f8fff4]">
      <section className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-[#f6c453]">吊主</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal">进入牌桌</h1>
        </div>

        <div className="rounded-xl border border-white/12 bg-white/[0.07] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <label
            className="mb-3 block text-sm font-semibold text-white/80"
            htmlFor="join-code"
          >
            五位房间号
          </label>
          <input
            id="join-code"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            value={joinCode}
            onChange={(event) => updateJoinCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submitJoinCode();
              }
            }}
            className="h-16 w-full rounded-lg border border-[#d2a84f]/60 bg-[#fffdf7] px-4 text-center font-mono text-3xl font-black tracking-[0.22em] text-[#111827] outline-none focus:border-[#f6c453] focus:ring-2 focus:ring-[#f6c453]/50"
            maxLength={5}
            placeholder="12341"
          />

          {error ? (
            <p className="mt-3 rounded-md border border-[#fda29b]/70 bg-[#7f1d1d]/70 px-3 py-2 text-sm text-[#fee2e2]">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={submitting || joinCode.length !== 5}
            onClick={submitJoinCode}
            className="mt-4 h-12 w-full rounded-full bg-[#d2a84f] px-4 text-base font-black text-[#271904] shadow-[0_8px_20px_rgba(0,0,0,0.25)] transition hover:bg-[#e0bb60] disabled:cursor-not-allowed disabled:bg-[#7a765f] disabled:text-white/45"
          >
            {submitting ? "进入中..." : "进入房间"}
          </button>
        </div>
      </section>
    </main>
  );
}
