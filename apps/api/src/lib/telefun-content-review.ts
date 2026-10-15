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

/**
 * Skema respons AI dengan field anotasi yang WAJIB: Gemini sering melewati
 * properti opsional, sehingga anotasi kosong padahal transkrip ada.
 */
export function telefunContentReviewResponseSchema<
  T extends { properties: object; required: readonly string[] },
>(base: T) {
  return {
    ...base,
    properties: {
      ...base.properties,
      ...TELEFUN_CONTENT_REVIEW_AI_PROPERTIES,
    },
    required: [
      ...base.required,
      ...(Object.keys(
        TELEFUN_CONTENT_REVIEW_AI_PROPERTIES,
      ) as (keyof typeof TELEFUN_CONTENT_REVIEW_AI_PROPERTIES)[]),
    ],
  };
}

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
    TELAAH ISI PERCAKAPAN (WAJIB diisi; dari transkrip dua arah di bawah, bukan dari audio):
    ${lines}

    - "caseCore": 1-2 kalimat inti kasus — apa masalah konsumen dan apa yang ia butuhkan. Tanpa nama/PII.
    - "consumerPoints": maksimal 5 pertanyaan atau permintaan konsumen, urut sesuai kemunculan. Setiap poin: "line" (nomor baris konsumen), "quote" (salinan PERSIS 3-15 kata dari baris itu), "summary" (inti pertanyaan, maks 12 kata), "status" ("answered" bila dijawab tuntas, "partial" bila baru sebagian, "unanswered" bila tidak dijawab), "reason" (1 kalimat alasan status, atau null), "answerLine" dan "answerQuote" (nomor baris agen yang menjawab dan salinan PERSIS kalimatnya, atau null bila tidak ada).
    - "agentNotes": maksimal 8 kalimat agen yang paling menentukan mutu layanan, baik maupun buruk. Setiap catatan: "line" (nomor baris agen), "quote" (salinan PERSIS kalimat agen), "verdict" ("good" bila sudah tepat, "fix" bila perlu diperbaiki), "note" (1 kalimat alasannya), "example" (kalimat utuh yang sebaiknya diucapkan agen untuk verdict "fix"; null untuk "good").
    - "caseCore", "consumerPoints", dan "agentNotes" WAJIB ada di JSON. Isi array kosong hanya bila memang tidak ada pertanyaan konsumen atau kalimat agen yang layak dinilai.
    - Kutipan WAJIB disalin persis dari transkrip. Kutipan yang tidak ada di transkrip akan dibuang.
  `;
}

/**
 * Teks dilipat ke huruf kecil; spasi dan tanda baca menjadi satu spasi.
 * `index[i]` adalah posisi karakter ke-i hasil lipatan di teks asli.
 */
function fold(value: string): { text: string; index: number[] } {
  let text = "";
  const index: number[] = [];
  for (let position = 0; position < value.length; position += 1) {
    const char = value[position]!;
    if (/[\p{L}\p{N}]/u.test(char)) {
      text += char.toLowerCase();
      index.push(position);
    } else if (text.length > 0 && !text.endsWith(" ")) {
      text += " ";
      index.push(position);
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    index.pop();
  }
  return { text, index };
}

/** Potongan teks asli yang cocok dengan kutipan, atau `null`. */
function findQuote(text: string, quote: string): string | null {
  const needle = fold(quote).text;
  if (!needle) return null;
  const haystack = fold(text);
  const at = haystack.text.indexOf(needle);
  if (at < 0) return null;
  const start = haystack.index[at]!;
  const end = haystack.index[at + needle.length - 1]! + 1;
  return text.slice(start, end);
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
 * Baris pembicara `speaker` yang memuat `quote`, dengan kutipan persis seperti
 * di transkrip (supaya tanda di web selalu ketemu). Baris yang disebut AI
 * (bernomor mulai 1) dicoba dulu; bila salah, kutipan dicari di baris lain
 * dari pembicara yang sama.
 */
function locateQuote(
  transcript: readonly TelefunTranscriptEntry[],
  speaker: TelefunTranscriptSpeaker,
  line: unknown,
  quote: string,
): { startMs: number; quote: string } | null {
  const candidates = transcript.filter((entry) => entry.speaker === speaker);
  const named =
    typeof line === "number" && Number.isInteger(line)
      ? transcript[line - 1]
      : undefined;
  const ordered =
    named && named.speaker === speaker
      ? [named, ...candidates.filter((entry) => entry !== named)]
      : candidates;
  for (const entry of ordered) {
    const exact = findQuote(entry.text, quote);
    if (exact) return { startMs: entry.startMs, quote: exact };
  }
  return null;
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
  const asked = locateQuote(transcript, "consumer", item.line, quote);
  if (!asked) return null;

  // Jawaban yang tidak menunjuk kalimat agen dibuang; poinnya tetap ada.
  const answerQuote = readText(
    item.answerQuote,
    TELEFUN_CONTENT_REVIEW_LIMITS.quote,
  );
  const answer = answerQuote
    ? locateQuote(transcript, "agent", item.answerLine, answerQuote)
    : null;

  return {
    startMs: asked.startMs,
    quote: asked.quote,
    summary,
    status: item.status,
    reason: readAiText(item.reason),
    answerStartMs: answer?.startMs ?? null,
    answerQuote: answer?.quote ?? null,
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
  const located = locateQuote(transcript, "agent", item.line, quote);
  if (!located) return null;

  return {
    startMs: located.startMs,
    quote: located.quote,
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

function countOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Jumlah anotasi dari AI dan yang tersimpan, tanpa teks (bisa memuat data
 * konsumen), untuk menelusuri hasil yang kosong.
 */
export function logTelefunContentReview(
  sessionId: string,
  raw: unknown,
  review: TelefunContentReview,
): TelefunContentReview {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  console.info(
    `[Telefun ContentReview] session=${sessionId} caseCore=${review.caseCore ? 1 : 0} consumerPoints=${countOf(source.consumerPoints)}/${review.consumerPoints.length} agentNotes=${countOf(source.agentNotes)}/${review.agentNotes.length}`,
  );
  return review;
}
