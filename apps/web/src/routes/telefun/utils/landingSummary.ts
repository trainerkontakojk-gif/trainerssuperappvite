import type { CallRecord } from "../types";
import {
  lowestTelefunAspect,
  readTelefunAspects,
  readTelefunScore,
  sortTelefunNewestFirst,
  telefunAnalysisState,
  telefunParticipant,
  telefunStatusLabel,
} from "./reviewDisplay";

/** Jumlah telaah terbaru yang dipakai untuk rata-rata dan fokus. */
export const TELEFUN_LANDING_REVIEW_WINDOW = 5;
const LIST_LIMIT = 3;
const RECENT_LIMIT = 5;

export interface TelefunFollowUp {
  record: CallRecord;
  meta: string;
  status: string;
  tone: "failed" | "missing";
}

export interface TelefunRecentReview {
  record: CallRecord;
  participant: string;
  score: number;
  lowestAspect: string | null;
}

export interface TelefunLandingSummary {
  /** `null` bila jumlah dari server belum/tidak tersedia. */
  callsThisMonth: number | null;
  average: { score: number; calls: number } | null;
  analyzing: number;
  followUps: TelefunFollowUp[];
  focus: { label: string; score: number } | null;
  recent: TelefunRecentReview[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageFocus(records: readonly CallRecord[]) {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const record of records) {
    if (!record.voiceAssessment) continue;
    for (const aspect of readTelefunAspects(record.voiceAssessment)) {
      if (aspect.score === null) continue;
      const entry = totals.get(aspect.label) ?? { sum: 0, count: 0 };
      totals.set(aspect.label, {
        sum: entry.sum + aspect.score,
        count: entry.count + 1,
      });
    }
  }
  let lowest: TelefunLandingSummary["focus"] = null;
  for (const [label, { sum, count }] of totals) {
    const score = round1(sum / count);
    if (!lowest || score < lowest.score) lowest = { label, score };
  }
  return lowest;
}

/**
 * Ringkasan halaman awal Telefun dari riwayat yang sudah dimuat. Tidak ada
 * angka yang dikarang: bagian tanpa data mengembalikan `null` atau daftar kosong.
 */
export function summarizeTelefunLanding(
  history: readonly CallRecord[],
  /** Panggilan bulan ini di server (`GET /sessions/month-count`). */
  serverMonthCount: number | null,
): TelefunLandingSummary {
  const sorted = sortTelefunNewestFirst(history);
  const scored = sorted.filter((record) => readTelefunScore(record) !== null);
  const window = scored.slice(0, TELEFUN_LANDING_REVIEW_WINDOW);

  return {
    // Server menghitung semua panggilan (riwayat hanya 50 terbaru). Panggilan
    // yang belum tersinkron pun sudah punya baris server sejak dimulai.
    callsThisMonth: serverMonthCount,
    average: window.length
      ? {
          score: round1(
            window.reduce(
              (total, record) => total + readTelefunScore(record)!,
              0,
            ) / window.length,
          ),
          calls: window.length,
        }
      : null,
    analyzing: sorted.filter((record) => {
      const state = telefunAnalysisState(record);
      return state === "pending" || state === "processing";
    }).length,
    followUps: sorted
      .filter((record) => {
        const state = telefunAnalysisState(record);
        return state === "failed" || state === "no_recording";
      })
      .slice(0, LIST_LIMIT)
      .map((record) => ({
        record,
        meta: [
          telefunParticipant(record).name,
          record.consumerName,
          record.consumerCity,
        ]
          .filter(Boolean)
          .join(" · "),
        status: telefunStatusLabel(record),
        tone: telefunAnalysisState(record) === "failed" ? "failed" : "missing",
      })),
    focus: averageFocus(window),
    recent: scored.slice(0, RECENT_LIMIT).map((record) => ({
      record,
      participant: telefunParticipant(record).name,
      score: readTelefunScore(record)!,
      lowestAspect: record.voiceAssessment
        ? (lowestTelefunAspect(record.voiceAssessment)?.label ?? null)
        : null,
    })),
  };
}

