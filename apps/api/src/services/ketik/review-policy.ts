import { Type } from "@google/genai";

export interface KetikReviewScores {
  final: number;
  empathy: number;
  probing: number;
  resolution: number;
  typo: number;
  compliance: number;
}

export const KETIK_REVIEW_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    coachingFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
    scores: {
      type: Type.OBJECT,
      properties: {
        final: { type: Type.NUMBER },
        empathy: { type: Type.NUMBER },
        probing: { type: Type.NUMBER },
        resolution: { type: Type.NUMBER },
        typo: { type: Type.NUMBER },
        compliance: { type: Type.NUMBER },
      },
      required: [
        "final",
        "empathy",
        "probing",
        "resolution",
        "typo",
        "compliance",
      ],
    },
    typos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          messageId: { type: Type.STRING },
          originalWord: { type: Type.STRING },
          correctedWord: { type: Type.STRING },
          severity: {
            type: Type.STRING,
            enum: ["minor", "medium", "critical"],
          },
        },
        required: ["messageId", "originalWord", "correctedWord", "severity"],
      },
    },
  },
  required: [
    "summary",
    "strengths",
    "weaknesses",
    "coachingFocus",
    "scores",
    "typos",
  ],
};

export function buildKetikReviewSystemInstruction(): string {
  return `Anda adalah AI Quality Assurance (QA) dan coaching ahli untuk contact center.
Tinjau transkrip chat layanan pelanggan antara Agen (pengguna) dan Konsumen.

Kategori Evaluasi (skala 0-100):
- Empati & Komunikasi (kealamian, empati, keterbacaan, profesionalisme) -> key JSON: empathy
- Probing (kedalaman, relevansi, penggalian kronologi) -> key JSON: probing
- Resolusi (kejelasan, langkah yang dapat dilakukan, kelengkapan) -> key JSON: resolution
- Kepatuhan (tanpa misinformasi, victim blaming, atau bahasa kasar) -> key JSON: compliance
- Tata Tulis (frekuensi typo dan keterbacaan) -> key JSON: typo

Skor akhir adalah rata-rata lima kategori tersebut.

Rubrik Penilaian (0-100):
- 90-100: Sangat Baik
- 75-89: Baik
- 60-74: Cukup
- Di bawah 60: Perlu Coaching

Aturan Deteksi Typo:
- Abaikan singkatan atau bahasa Indonesia informal yang umum seperti "yg", "sy", "kak", "ga", "gak", "ok", dan "oke".
- Identifikasi typo formal yang memengaruhi profesionalisme atau keterbacaan.
- Severity wajib salah satu dari "minor", "medium", atau "critical".

Seluruh respons tekstual (summary, strengths, weaknesses, coachingFocus) WAJIB dalam Bahasa Indonesia.`;
}

function clampScore(value: unknown): number {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return 0;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

export function normalizeKetikReviewScores(value: unknown): KetikReviewScores {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const scores: KetikReviewScores = {
    final: clampScore(source.final),
    empathy: clampScore(source.empathy),
    probing: clampScore(source.probing),
    resolution: clampScore(source.resolution),
    typo: clampScore(source.typo),
    compliance: clampScore(source.compliance),
  };
  const calculatedFinal = Math.round(
    (scores.empathy +
      scores.probing +
      scores.resolution +
      scores.typo +
      scores.compliance) /
      5,
  );

  // The final score is deterministic and auditable: it is always the average
  // of the five persisted dimensions, regardless of the model's own total.
  scores.final = calculatedFinal;

  return scores;
}
