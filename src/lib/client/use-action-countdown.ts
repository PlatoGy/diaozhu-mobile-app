"use client";

import { useEffect, useState } from "react";

export function useActionCountdown(input: {
  key: string | null;
  durationSeconds?: number;
}): number {
  const durationSeconds = input.durationSeconds ?? 15;
  const [seconds, setSeconds] = useState(durationSeconds);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(durationSeconds);

    if (!input.key) {
      return;
    }

    const timer = setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [durationSeconds, input.key]);

  return seconds;
}
