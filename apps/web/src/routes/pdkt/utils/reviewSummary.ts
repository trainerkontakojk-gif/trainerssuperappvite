import type {
  PdktActionItem,
  PdktDimensionKey,
  PdktDimensionExplanation,
  PdktEvaluationResult,
} from "@trainers/types";
import {
  PDKT_DIMENSION_DESCRIPTIONS,
  PDKT_DIMENSION_LABELS,
  PDKT_DIMENSION_SCORE_FIELDS,
} from "../../../lib/pdkt-dimensions";

/** Nilai aspek di bawah ini diberi tanda "Perlu perbaikan" saja. Tips tidak bergantung pada ambang skor. */
export const PDKT_LOW_DIMENSION_SCORE = 75;

/** Predikat skor total, mengikuti rentang yang dipakai panel monitoring. */
export function pdktScoreGrade(score: number): string {
  if (score >= 90) return "Sangat baik";
  if (score >= 75) return "Baik";
  if (score >= 60) return "Cukup";
  return "Perlu latihan";
}

export interface PdktReviewDimensionRow {
  dimension: PdktDimensionKey;
  label: string;
  description: string;
  value: number;
  low: boolean;
  tip: string | null;
  explanation: PdktDimensionExplanation | null;
}

/** Baris "Rincian skor" dalam urutan tetap; kosong untuk hasil lama tanpa rincian. */
export function pdktReviewDimensionRows(
  evaluation: PdktEvaluationResult,
): PdktReviewDimensionRow[] {
  const breakdown = evaluation.scoreBreakdown;
  if (!breakdown) return [];
  return PDKT_DIMENSION_SCORE_FIELDS.map(([dimension, field]) => {
    const value = breakdown[field];
    const low = value < PDKT_LOW_DIMENSION_SCORE;
    return {
      dimension,
      label: PDKT_DIMENSION_LABELS[dimension],
      description: PDKT_DIMENSION_DESCRIPTIONS[dimension],
      value,
      low,
      tip: evaluation.edu?.dimensionTips?.[dimension] ?? null,
      explanation: evaluation.edu?.dimensionExplanations?.[dimension] ?? null,
    };
  });
}

/** Action item urut prioritas backend; yang pertama tampil sebagai "Perbaiki ini dulu". */
export function pdktRankedActionItems(
  evaluation: PdktEvaluationResult,
): PdktActionItem[] {
  return [...(evaluation.edu?.actionItems ?? [])].sort(
    (a, b) => a.priorityRank - b.priorityRank,
  );
}

/** "3 menit 45 detik" dari jumlah detik. */
export function formatPdktDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} detik`;
  return rest === 0 ? `${minutes} menit` : `${minutes} menit ${rest} detik`;
}

/** Telaah tanpa penanda kalimat atau tanpa poin konsumen; bisa ditelaah ulang. */
export const PDKT_INCOMPLETE_REVIEW = {
  marks: {
    label: "Telaah lama tanpa penanda",
    text: "Telaah ini dibuat sebelum fitur penanda kalimat ada, jadi AI belum menandai kalimat yang perlu diperbaiki. Telaah ulang untuk melihat tandanya di balasan Anda.",
  },
  points: {
    label: "Telaah tanpa poin konsumen",
    text: "Telaah ini belum menandai permintaan di email konsumen. Telaah ulang untuk melihat poin mana yang sudah dan belum Anda jawab.",
  },
} as const;

/** Isi "Temuan lain"; ejaan dan kejelasan hanya untuk telaah tanpa penanda. */
export function pdktOtherFindings(
  evaluation: PdktEvaluationResult,
): { kind: string; text: string }[] {
  // Telaah bertanda sudah menampilkan ejaan dan kejelasan di "Catatan pada
  // balasan"; hanya telaah lama yang masih membutuhkannya di sini.
  const notedInReply = Array.isArray(evaluation.annotations);
  return [
    ...(notedInReply ? [] : (evaluation.typos ?? [])).map((text) => ({
      kind: "Ejaan",
      text,
    })),
    ...(notedInReply ? [] : (evaluation.clarityIssues ?? [])).map((text) => ({
      kind: "Kejelasan",
      text,
    })),
    ...(evaluation.contentGaps ?? []).map((text) => ({
      kind: "Isi yang kurang",
      text,
    })),
  ];
}
