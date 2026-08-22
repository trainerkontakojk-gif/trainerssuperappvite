import type {
  TelefunHoldMetrics,
  TelefunHoldAssessment,
  TelefunHoldInterval,
} from "@trainers/types";
import {
  TELEFUN_FIRST_HOLD_LIMIT_MS,
  TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS,
} from "@trainers/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalizeInterval(raw: unknown): TelefunHoldInterval | null {
  if (!isRecord(raw)) return null;
  const sequence =
    typeof raw.sequence === "number" && raw.sequence >= 1
      ? Math.floor(raw.sequence)
      : null;
  const startedAtMs =
    typeof raw.startedAtMs === "number" && raw.startedAtMs >= 0
      ? Math.floor(raw.startedAtMs)
      : 0;
  const endedAtMs =
    typeof raw.endedAtMs === "number" && raw.endedAtMs >= 0
      ? Math.floor(raw.endedAtMs)
      : 0;
  if (sequence === null || endedAtMs < startedAtMs) return null;
  const durationMs = endedAtMs - startedAtMs;
  const limitMs =
    typeof raw.limitMs === "number" && raw.limitMs > 0
      ? Math.floor(raw.limitMs)
      : sequence === 1
        ? TELEFUN_FIRST_HOLD_LIMIT_MS
        : TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS;
  const exceededByMs = Math.max(0, durationMs - limitMs);
  return {
    sequence,
    startedAtMs,
    endedAtMs,
    durationMs,
    limitMs,
    exceededByMs,
  };
}

export function normalizeTelefunHoldMetrics(
  value: unknown,
): TelefunHoldMetrics {
  if (!isRecord(value)) {
    return {
      count: 0,
      totalDurationMs: 0,
      longestDurationMs: 0,
      exceededCount: 0,
      intervals: [],
    };
  }

  const rawIntervals = Array.isArray(value.intervals) ? value.intervals : [];
  const intervals = rawIntervals
    .map(normalizeInterval)
    .filter((i): i is TelefunHoldInterval => i !== null && i.durationMs >= 0);

  const count = intervals.length;
  const totalDurationMs = intervals.reduce((s, i) => s + i.durationMs, 0);
  const longestDurationMs = intervals.reduce(
    (m, i) => Math.max(m, i.durationMs),
    0,
  );
  const exceededCount = intervals.filter((i) => i.exceededByMs > 0).length;

  return {
    count,
    totalDurationMs,
    longestDurationMs,
    exceededCount,
    intervals,
  };
}

export function evaluateTelefunHoldAssessment(
  metrics: TelefunHoldMetrics,
): TelefunHoldAssessment {
  // Always recompute from intervals — do not trust stored aggregates.
  const intervals = metrics.intervals;
  const count = intervals.length;
  const totalDurationMs = intervals.reduce((s, i) => s + i.durationMs, 0);
  const longestDurationMs = intervals.reduce(
    (m, i) => Math.max(m, i.durationMs),
    0,
  );
  const exceededCount = intervals.filter((i) => i.exceededByMs > 0).length;

  if (count === 0) {
    return {
      status: "not_used",
      score: null,
      verdict: "N/A",
      feedback: "User tidak menggunakan hold pada sesi ini.",
      holdCount: 0,
      totalDurationMs: 0,
      longestDurationMs: 0,
      exceededCount: 0,
    };
  }

  const exceeded = exceededCount > 0;

  if (exceeded) {
    const feedback =
      exceededCount === 1
        ? `Manajemen hold kurang. 1 hold melewati batas; hold terlama ${formatDuration(longestDurationMs)}.`
        : `Manajemen hold kurang. ${exceededCount} dari ${count} hold melewati batas; hold terlama ${formatDuration(longestDurationMs)}.`;
    // Rule-based coaching — limits sourced from TELEFUN_*_HOLD_LIMIT_MS,
    // never hardcoded.
    const nextSteps = [
      `Batasi hold pertama maksimal ${Math.round(TELEFUN_FIRST_HOLD_LIMIT_MS / 1000)} detik dan hold berikutnya maksimal ${Math.round(TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS / 1000)} detik.`,
      "Sebelum hold, beri tahu konsumen alasannya dan perkiraan durasi tunggu.",
      "Kembali ke saluran tepat waktu dan ucapkan terima kasih atas kesabaran konsumen.",
    ];
    return {
      status: "exceeded",
      score: 4,
      verdict: "Kurang",
      feedback,
      holdCount: count,
      totalDurationMs,
      longestDurationMs,
      exceededCount,
      nextSteps,
      drill: `Latihan manajemen hold: simulasi panggilan dengan skenario cek data — jaga setiap hold di bawah ${formatDuration(TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS)} dan selalu beri konteks ke konsumen sebelum menahan.`,
    };
  }

  return {
    status: "within_limit",
    score: 10,
    verdict: "Baik",
    feedback:
      "Hold digunakan sesuai ketentuan. Semua hold selesai dalam batas waktu.",
    holdCount: count,
    totalDurationMs,
    longestDurationMs,
    exceededCount: 0,
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) return `${mins}m${secs}s`;
  return `${secs}s`;
}

export function applyHoldAssessmentToOverallScore(
  aiOverallScore: number,
  hold: TelefunHoldAssessment,
): number {
  if (hold.score === null) return aiOverallScore;
  const clampedAi = clamp(aiOverallScore, 0, 10);
  const adjusted = (clampedAi * 5 + hold.score) / 6;
  return Math.round(adjusted * 10) / 10;
}
