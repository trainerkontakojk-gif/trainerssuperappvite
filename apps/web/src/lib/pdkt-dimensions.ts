import type {
  PdktDimensionKey,
  PdktEvaluationScoreBreakdown,
} from "@trainers/types";

/** Nama aspek telaah PDKT yang tampil ke pengguna. */
export const PDKT_DIMENSION_LABELS: Record<PdktDimensionKey, string> = {
  recipientDirection: "Arah penerima",
  normative: "Kualitas OJK",
  clarity: "Kejelasan",
  typo: "Ejaan",
  template: "Format balasan",
};

/** Penjelasan singkat apa yang ditelaah tiap aspek. */
export const PDKT_DIMENSION_DESCRIPTIONS: Record<PdktDimensionKey, string> = {
  recipientDirection: "balasan ditujukan ke pihak yang benar",
  normative: "kronologi, solusi, dan batas waktu lengkap",
  clarity: "kalimat mudah dipahami konsumen",
  typo: "ejaan dan tanda baca",
  template: "salam, isi, dan penutup sesuai format",
};

/** Kolom skor di hasil evaluasi untuk tiap aspek, dalam urutan tampil. */
export const PDKT_DIMENSION_SCORE_FIELDS: ReadonlyArray<
  [PdktDimensionKey, keyof PdktEvaluationScoreBreakdown]
> = [
  ["recipientDirection", "recipientDirectionScore"],
  ["normative", "normativeResponseScore"],
  ["clarity", "clarityScore"],
  ["typo", "typoScore"],
  ["template", "templateComplianceScore"],
];
