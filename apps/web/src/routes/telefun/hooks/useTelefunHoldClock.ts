import { useState, useEffect } from "react";

export interface TelefunHoldClock {
  elapsedMs: number;
  remainingMs: number;
  overtimeMs: number;
  phase: "normal" | "warning" | "overtime";
}

export function useTelefunHoldClock(
  active: boolean,
  startedAtEpochMs: number | null,
  limitMs: number,
): TelefunHoldClock {
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    if (!active || startedAtEpochMs === null) return;

    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 250);

    return () => clearInterval(timer);
  }, [active, startedAtEpochMs]);

  if (!active || startedAtEpochMs === null) {
    return { elapsedMs: 0, remainingMs: 0, overtimeMs: 0, phase: "normal" };
  }

  const elapsedMs = Math.max(0, nowMs - startedAtEpochMs);
  const remainingMs = Math.max(0, limitMs - elapsedMs);
  const overtimeMs = Math.max(0, elapsedMs - limitMs);

  let phase: TelefunHoldClock["phase"] = "normal";
  if (overtimeMs > 0) {
    phase = "overtime";
  } else if (remainingMs <= 10_000 && remainingMs > 0) {
    phase = "warning";
  }

  return { elapsedMs, remainingMs, overtimeMs, phase };
}
