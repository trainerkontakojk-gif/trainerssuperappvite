import {
  TELEFUN_AGENT_NOTE_VERDICTS,
  TELEFUN_CONSUMER_POINT_STATUSES,
  type TelefunAgentNote,
  type TelefunConsumerPoint,
  type TelefunContentReview,
  type TelefunTranscriptEntry,
  type TelefunTranscriptSpeaker,
} from "@trainers/types";
import { sanitizeAiResponse } from "./ai-sanitize";

/**
 * Anotasi isi Telefun: AI membaca transkrip dua arah yang tersimpan dan
 * menandai inti kasus, pertanyaan konsumen, dan kalimat agen. Backend hanya
 * menyimpan kutipan yang benar-benar ada di baris pembicara yang tepat.
 */

export const TELEFUN_CONTENT_REVIEW_LIMITS = {
  consumerPoints: 5,
  agentNotes: 8,
  quote: 300,
  text: 400,
} as const;

/** Properti tambahan di skema respons AI; dinormalisasi ke `contentReview`. */
export const TELEFUN_CONTENT_REVIEW_AI_PROPERTIES = {
  caseCore: { type: "string" },
  consumerPoints: {
    type: "array",
    items: {
      type: "object",
      properties: {
        line: { type: "number" },
        quote: { type: "string" },
        summary: { type: "string" },
        status: { type: "string", enum: [...TELEFUN_CONSUMER_POINT_STATUSES] },
        reason: { type: "string", nullable: true },
        answerLine: { type: "number", nullable: true },
        answerQuote: { type: "string", nullable: true },
      },
      required: ["line", "quote", "summary", "status"],
    },
  },
  agentNotes: {
    type: "array",
    items: {
      type: "object",
      properties: {
        line: { type: "number" },
        quote: { type: "string" },
        verdict: { type: "string", enum: [...TELEFUN_AGENT_NOTE_VERDICTS] },
        note: { type: "string" },
        example: { type: "string", nullable: true },
      },
      required: ["line", "quote", "verdict", "note"],
    },
  },
} as const;

/** Transkrip dua arah cukup untuk ditelaah bila kedua pihak bicara. */
export function canReviewTelefunContent(
  transcript: readonly TelefunTranscriptEntry[],
): boolean {
  return (
    transcript.some((entry) => entry.speaker === "consumer") &&
    transcript.some((entry) => entry.speaker === "agent")
  );
}

/** Bagian prompt: transkrip bernomor dan aturan anotasi. */
export function buildTelefunContentReviewPrompt(
  transcript: readonly TelefunTranscriptEntry[],
): string {
  const lines = transcript
    .map(
      (entry, index) =>
        `[${index + 1}] ${entry.speaker === "agent" ? "Agen" : "Konsumen"}: ${entry.text.replace(/\s+/g, " ").trim()}`,
    )
    .join("\n");
  return `
    TELAAH ISI PERCAKAPAN (dari transkrip dua arah di bawah, bukan dari audio):
    ${lines}

    - "caseCore": 1-2 kalimat inti kasus — apa masalah konsumen dan apa yang ia butuhkan. Tanpa nama/PII.
    - "consumerPoints": maksimal 5 pertanyaan atau permintaan konsumen, urut sesuai kemunculan. Setiap poin: "line" (nomor baris konsumen), "quote" (salinan PERSIS 3-15 kata dari baris itu), "summary" (inti pertanyaan, maks 12 kata), "status" ("answered" bila dijawab tuntas, "partial" bila baru sebagian, "unanswered" bila tidak dijawab), "reason" (1 kalimat alasan status, atau null), "answerLine" dan "answerQuote" (nomor baris agen yang menjawab dan salinan PERSIS kalimatnya, atau null bila tidak ada).
    - "agentNotes": maksimal 8 kalimat agen yang paling menentukan mutu layanan, baik maupun buruk. Setiap catatan: "line" (nomor baris agen), "quote" (salinan PERSIS kalimat agen), "verdict" ("good" bila sudah tepat, "fix" bila perlu diperbaiki), "note" (1 kalimat alasannya), "example" (kalimat utuh yang sebaiknya diucapkan agen untuk verdict "fix"; null untuk "good").
    - Kutipan WAJIB disalin persis dari transkrip. Kutipan yang tidak ada di transkrip akan dibuang.
  `;
}

/** Huruf kecil dan spasi dirapatkan, supaya kutipan AI cocok dengan transkrip. */
function fold(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/** Teks AI yang tampil sebagai narasi, bukan kutipan. */
function readAiText(value: unknown): string | null {
  const text = readText(value, TELEFUN_CONTENT_REVIEW_LIMITS.text);
  return text ? sanitizeAiResponse(text) : null;
}

/**
 * Baris pembicara `speaker` yang memuat `quote`. Baris yang disebut AI
 * (bernomor mulai 1) dicoba dulu; bila salah, kutipan dicari di baris lain
 * dari pembicara yang sama.
 */
function locateQuote(
  transcript: readonly TelefunTranscriptEntry[],
  speaker: TelefunTranscriptSpeaker,
  line: unknown,
  quote: string,
): number | null {
  const needle = fold(quote);
  const candidates = transcript.filter((entry) => entry.speaker === speaker);
  const named =
    typeof line === "number" && Number.isInteger(line)
      ? transcript[line - 1]
      : undefined;
  const ordered =
    named && named.speaker === speaker
      ? [named, ...candidates.filter((entry) => entry !== named)]
      : candidates;
  return (
    ordered.find((entry) => fold(entry.text).includes(needle))?.startMs ?? null
  );
}

function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

function readConsumerPoint(
  raw: unknown,
  transcript: readonly TelefunTranscriptEntry[],
): TelefunConsumerPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const quote = readText(item.quote, TELEFUN_CONTENT_REVIEW_LIMITS.quote);
  const summary = readAiText(item.summary);
  if (!quote || !summary) return null;
  if (!isOneOf(TELEFUN_CONSUMER_POINT_STATUSES, item.status)) return null;
  const startMs = locateQuote(transcript, "consumer", item.line, quote);
  if (startMs === null) return null;

  // Jawaban yang tidak menunjuk kalimat agen dibuang; poinnya tetap ada.
  const answerQuote = readText(
    item.answerQuote,
    TELEFUN_CONTENT_REVIEW_LIMITS.quote,
  );
  const answerStartMs = answerQuote
    ? locateQuote(transcript, "agent", item.answerLine, answerQuote)
    : null;

  return {
    startMs,
    quote,
    summary,
    status: item.status,
    reason: readAiText(item.reason),
    answerStartMs,
    answerQuote: answerStartMs !== null ? answerQuote : null,
  };
}

function readAgentNote(
  raw: unknown,
  transcript: readonly TelefunTranscriptEntry[],
): TelefunAgentNote | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const quote = readText(item.quote, TELEFUN_CONTENT_REVIEW_LIMITS.quote);
  const note = readAiText(item.note);
  if (!quote || !note) return null;
  if (!isOneOf(TELEFUN_AGENT_NOTE_VERDICTS, item.verdict)) return null;
  const startMs = locateQuote(transcript, "agent", item.line, quote);
  if (startMs === null) return null;

  return {
    startMs,
    quote,
    verdict: item.verdict,
    note,
    example: item.verdict === "fix" ? readAiText(item.example) : null,
  };
}

function readList<T>(
  raw: unknown,
  read: (item: unknown) => T | null,
  limit: number,
): T[] {
  if (!Array.isArray(raw)) return [];
  const items: T[] = [];
  for (const entry of raw) {
    const item = read(entry);
    if (item) items.push(item);
    if (items.length === limit) break;
  }
  return items;
}

/**
 * Anotasi isi dari respons AI. Selalu mengembalikan ketiga field, supaya
 * hasil baru bisa dibedakan dari hasil lama yang belum punya anotasi.
 */
export function normalizeTelefunContentReview(
  raw: unknown,
  transcript: readonly TelefunTranscriptEntry[],
): TelefunContentReview {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    caseCore: readAiText(source.caseCore),
    consumerPoints: readList(
      source.consumerPoints,
      (item) => readConsumerPoint(item, transcript),
      TELEFUN_CONTENT_REVIEW_LIMITS.consumerPoints,
    ),
    agentNotes: readList(
      source.agentNotes,
      (item) => readAgentNote(item, transcript),
      TELEFUN_CONTENT_REVIEW_LIMITS.agentNotes,
    ),
  };
}
