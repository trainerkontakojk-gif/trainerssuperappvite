import { Type } from "@google/genai";

// ── Evaluasi Edukatif (deterministic education layer) ──
export type KetikDimensionKey =
  | "empathy"
  | "probing"
  | "resolution"
  | "typo"
  | "compliance";

export interface KetikReviewScores {
  final: number;
  empathy: number;
  probing: number;
  resolution: number;
  typo: number;
  compliance: number;
}

/** Fixed dimension order — deterministic tie-breaker for priorityRank. */
export const KETIK_DIMENSION_ORDER: KetikDimensionKey[] = [
  "empathy",
  "probing",
  "resolution",
  "typo",
  "compliance",
];

const KETIK_DIMENSION_LABELS: Record<KetikDimensionKey, string> = {
  empathy: "Empati & Komunikasi",
  probing: "Probing",
  resolution: "Resolusi",
  typo: "Tata Tulis",
  compliance: "Kepatuhan",
};

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
    // Evaluasi Edukatif: AI only narrates; backend owns score/label/verdict/priority.
    dimensionGuidance: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: {
            type: Type.STRING,
            enum: KETIK_DIMENSION_ORDER,
          },
          diagnosis: { type: Type.STRING },
          howToFix: { type: Type.STRING },
          exampleRewrite: { type: Type.STRING },
        },
        required: ["key", "diagnosis", "howToFix", "exampleRewrite"],
      },
    },
    overallNextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
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

Seluruh respons tekstual (summary, strengths, weaknesses, coachingFocus) WAJIB dalam Bahasa Indonesia.

Evaluasi Edukatif:
- Untuk setiap dari 5 kategori (empathy/probing/resolution/typo/compliance), berikan "dimensionGuidance" berisi HANYA "key", "diagnosis" (1-2 kalimat, kutip 3-6 kata dari transkrip tanpa nama/PII), "howToFix" (langkah konkret 1-2 kalimat), dan "exampleRewrite" (contoh sebelum → sesudah, maks 500 karakter).
- JANGAN menentukan score/label/verdict/priority — backend akan menentukannya dari skor kanonik.
- "overallNextSteps" opsional sebagai catatan tambahan; prioritas perbaikan di UI diambil dari ranking backend, bukan dari field ini.
- Semua teks edukasi WAJIB dalam Bahasa Indonesia.`;
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

// ── Evaluasi Edukatif: deterministic education builder ──

type KetikVerdict = "Sangat Baik" | "Baik" | "Cukup" | "Perlu Coaching";

export function ketikDimensionVerdict(score: number): KetikVerdict {
  if (score >= 90) return "Sangat Baik";
  if (score >= 75) return "Baik";
  if (score >= 60) return "Cukup";
  return "Perlu Coaching";
}

interface KetikEducationFallbackRule {
  diagnosis: string;
  howToFix: string;
  exampleRewrite: string;
}

/** Score bands: critical <60, medium 60-74, good >=75. */
type KetikEducationBand = "critical" | "medium" | "good";

function ketikScoreBand(score: number): KetikEducationBand {
  if (score < 60) return "critical";
  if (score < 75) return "medium";
  return "good";
}

const KETIK_EDUCATION_FALLBACK: Record<
  KetikDimensionKey,
  Record<KetikEducationBand, KetikEducationFallbackRule>
> = {
  empathy: {
    critical: {
      diagnosis:
        "Empati hampir tidak terlihat: agen langsung ke penjelasan atau permintaan data tanpa mengakui keluhan konsumen.",
      howToFix:
        "Mulai setiap balasan dengan validasi perasaan satu kalimat sebelum menjawab inti masalah.",
      exampleRewrite:
        "Sebelumnya: 'Silakan cek email Anda.' — Sesudahnya: 'Saya paham hal ini cukup mengganggu, Bapak/Ibu. Saya bantu cek emailnya sekarang ya.'",
    },
    medium: {
      diagnosis:
        "Ada empati tetapi belum konsisten di seluruh percakapan, terutama saat konsumen mengulang keluhan.",
      howToFix:
        "Berikan pengakuan singkat setiap kali konsumen menyampaikan keluhan baru, jangan hanya di awal percakapan.",
      exampleRewrite:
        "Sebelumnya: 'Sudah kami periksa.' — Sesudahnya: 'Maaf atas ketidaknyamanannya, saya sudah periksa ulang ya.'",
    },
    good: {
      diagnosis: "Empati sudah baik dan konsisten sepanjang percakapan.",
      howToFix: "Pertahankan pola validasi perasaan sebelum penjelasan.",
      exampleRewrite:
        "Contoh yang sudah benar: 'Terima kasih kesabarannya, Bapak/Ibu — saya bantu tindak lanjuti sekarang.'",
    },
  },
  probing: {
    critical: {
      diagnosis:
        "Penggalian informasi minim: kronologi dan detail kebutuhan konsumen tidak digali.",
      howToFix:
        "Ajukan minimal dua pertanyaan lanjutan: kapan kejadian dan apa dampaknya bagi konsumen.",
      exampleRewrite:
        "Sebelumnya: 'Baik, kami proses.' — Sesudahnya: 'Boleh saya tahu kapan pembayaran terakhir dilakukan dan nomor kontraknya, Bapak/Ibu?'",
    },
    medium: {
      diagnosis:
        "Probing berjalan tetapi belum mendalam; ada informasi penting yang terlewat.",
      howToFix:
        "Gunakan pertanyaan terbuka untuk melengkapi kronologi sebelum memberikan solusi.",
      exampleRewrite:
        "Sebelumnya: 'Apakah sudah pernah terjadi sebelumnya?' — Sesudahnya: 'Kapan pertama kali kendala ini muncul dan bagaimana bentuknya?'",
    },
    good: {
      diagnosis: "Probing sudah baik: kronologi dan kebutuhan tergali jelas.",
      howToFix: "Pertahankan pertanyaan terbuka sebelum menyimpulkan solusi.",
      exampleRewrite:
        "Contoh yang sudah benar: 'Agar tepat sasaran, boleh dijelaskan urutan kejadiannya dari awal?'",
    },
  },
  resolution: {
    critical: {
      diagnosis:
        "Solusi tidak actionable: konsumen tidak diberi langkah konkret atau estimasi waktu.",
      howToFix:
        "Tutup dengan langkah spesifik: apa yang dilakukan agen, apa yang dilakukan konsumen, dan estimasi waktunya.",
      exampleRewrite:
        "Sebelumnya: 'Nanti akan kami proses.' — Sesudahnya: 'Saya ajukan hari ini, hasilnya maksimal 2x24 jam dikirim ke email Bapak/Ibu.'",
    },
    medium: {
      diagnosis:
        "Solusi ada tetapi kurang lengkap; langkah konsumen atau estimasi waktu tidak disebut.",
      howToFix:
        "Lengkapi resolusi dengan estimasi waktu dan tindak lanjut yang jelas.",
      exampleRewrite:
        "Sebelumnya: 'Kami cek dulu ya.' — Sesudahnya: 'Saya cek sampai sore ini dan kabari progressnya lewat chat ini ya.'",
    },
    good: {
      diagnosis: "Resolusi sudah jelas, actionable, dan lengkap.",
      howToFix: "Pertahankan pola langkah + estimasi waktu pada setiap solusi.",
      exampleRewrite:
        "Contoh yang sudah benar: 'Pengajuan sudah saya buat, konfirmasi akan dikirim H+1 via WhatsApp.'",
    },
  },
  typo: {
    critical: {
      diagnosis:
        "Typo muncul berulang dan mengganggu keterbacaan serta profesionalisme pesan.",
      howToFix:
        "Baca ulang pesan sebelum kirim; gunakan template resmi untuk istilah produk.",
      exampleRewrite:
        "Sebelumnya: 'pembayaran sudah sauy diterima' — Sesudahnya: 'pembayaran sudah kami terima'.",
    },
    medium: {
      diagnosis: "Terdapat beberapa typo yang masih memengaruhi keterbacaan.",
      howToFix: "Periksa ejaan kata baku sebelum mengirim pesan.",
      exampleRewrite:
        "Sebelumnya: 'mohon ditungu ya kak' — Sesudahnya: 'Mohon ditunggu, Bapak/Ibu.'",
    },
    good: {
      diagnosis: "Penulisan sudah bersih dan profesional.",
      howToFix: "Pertahankan standar penulisan yang sudah baik.",
      exampleRewrite:
        "Contoh yang sudah benar: 'Dokumen telah kami terima dan sedang diproses.'",
    },
  },
  compliance: {
    critical: {
      diagnosis:
        "Ada pelanggaran kepatuhan: janji berlebihan, misinformasi, atau bahasa tidak pantas.",
      howToFix:
        "Hindari janji absolut ('pasti', 'dijamin'); sampaikan batas kewenangan dengan jujur.",
      exampleRewrite:
        "Sebelumnya: 'Dijamin lunas besok.' — Sesudahnya: 'Pengajuan saya teruskan hari ini; hasilnya akan dikonfirmasi oleh tim terkait.'",
    },
    medium: {
      diagnosis:
        "Secara umum patuh tetapi ada kalimat yang berpotensi ditafsirkan sebagai janji.",
      howToFix:
        "Gunakan frasa probabilitas yang aman untuk komitmen yang belum pasti.",
      exampleRewrite:
        "Sebelumnya: 'Pasti cepat kok.' — Sesudahnya: 'Estimasi kami 2-3 hari kerja sesuai SLA.'",
    },
    good: {
      diagnosis: "Kepatuhan terjaga: tanpa misinformasi dan bahasa pantas.",
      howToFix: "Pertahankan kepatuhan terhadap batas kewenangan dan informasi resmi.",
      exampleRewrite:
        "Contoh yang sudah benar: 'Sesuai ketentuan yang berlaku, dokumen ini dapat diajukan kembali.'",
    },
  },
};

export interface KetikDimensionGuidanceResult {
  key: KetikDimensionKey;
  label: string;
  score: number;
  verdict: KetikVerdict;
  priorityRank: 1 | 2 | 3 | 4 | 5;
  diagnosis: string;
  howToFix: string;
  exampleRewrite: string;
}

export interface KetikEducationResult {
  dimensionGuidance: KetikDimensionGuidanceResult[];
  overallNextSteps?: string[];
  typosEnriched?: Array<{
    messageId: string;
    originalWord: string;
    correctedWord: string;
    severity: string;
    contextSentence?: string;
    whyWrong?: string;
  }>;
}

function readNarration(
  raw: unknown,
  key: KetikDimensionKey,
  band: KetikEducationBand,
): KetikEducationFallbackRule {
  const fallback = KETIK_EDUCATION_FALLBACK[key][band];
  const list = Array.isArray(raw)
    ? (raw as unknown[])
    : Array.isArray((raw as any)?.dimensionGuidance)
      ? ((raw as any).dimensionGuidance as unknown[])
      : [];
  const match = list.find(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && (item as any).key === key,
  );
  if (!match) return fallback;
  const pick = (value: unknown, fb: string) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : fb;
  return {
    diagnosis: pick(match.diagnosis, fallback.diagnosis),
    howToFix: pick(match.howToFix, fallback.howToFix),
    exampleRewrite: pick(match.exampleRewrite, fallback.exampleRewrite),
  };
}

/**
 * Deterministic education builder. AI may only supply narration
 * (diagnosis/howToFix/exampleRewrite); score, label, verdict and priorityRank
 * are always derived from canonical stored scores. Works with or without an AI
 * payload so legacy histories get rule-based guidance without an AI rerun.
 */
export function buildKetikEducation(
  rawAiGuidance: unknown,
  canonicalScores: KetikReviewScores,
): KetikEducationResult {
  const ranked = [...KETIK_DIMENSION_ORDER]
    .sort((a, b) => {
      const diff = canonicalScores[a] - canonicalScores[b];
      if (diff !== 0) return diff; // lower score first
      return (
        KETIK_DIMENSION_ORDER.indexOf(a) - KETIK_DIMENSION_ORDER.indexOf(b)
      );
    })
    .map((key, index) => ({
      key,
      rank: index + 1,
    }));

  const dimensionGuidance = ranked.map(({ key, rank }) => {
    const score = clampScore(canonicalScores[key]);
    const narration = readNarration(rawAiGuidance, key, ketikScoreBand(score));
    return {
      key,
      label: KETIK_DIMENSION_LABELS[key],
      score,
      verdict: ketikDimensionVerdict(score),
      priorityRank: rank as 1 | 2 | 3 | 4 | 5,
      diagnosis: narration.diagnosis,
      howToFix: narration.howToFix,
      exampleRewrite: narration.exampleRewrite,
    };
  });

  return { dimensionGuidance };
}
