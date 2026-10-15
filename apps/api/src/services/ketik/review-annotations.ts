import {
  KETIK_AGENT_NOTE_VERDICTS,
  KETIK_CONSUMER_POINT_STATUSES,
  type KetikAgentNote,
  type KetikConsumerPoint,
  type KetikDimensionKey,
} from "@trainers/types";
import { KETIK_DIMENSION_ORDER } from "./review-policy";

export const KETIK_ANNOTATION_LIMITS = {
  consumerPoints: 5,
  agentNotes: 8,
  quote: 300,
  text: 400,
} as const;

export interface KetikAnnotations {
  caseCore: string | null;
  consumerPoints: KetikConsumerPoint[];
  agentNotes: KetikAgentNote[];
}

interface TranscriptMessage {
  id: string;
  sender: string;
  text: string;
}

type Sender = "consumer" | "agent";

/** Huruf kecil dan spasi dirapatkan, supaya kutipan AI cocok dengan transkrip. */
function fold(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function readMessages(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.sender === "string" &&
    typeof item.text === "string"
      ? [{ id: item.id, sender: item.sender, text: item.text }]
      : [],
  );
}

/**
 * Pesan pengirim `sender` yang memuat `quote`. Pesan yang disebut AI dicoba
 * dulu; bila salah, kutipan dicari di pesan lain dari pengirim yang sama.
 */
function locateQuote(
  messages: TranscriptMessage[],
  sender: Sender,
  messageId: unknown,
  quote: string,
): string | null {
  const needle = fold(quote);
  const candidates = messages.filter((message) => message.sender === sender);
  const named = candidates.find((message) => message.id === messageId);
  const ordered = named
    ? [named, ...candidates.filter((message) => message !== named)]
    : candidates;
  return (
    ordered.find((message) => fold(message.text).includes(needle))?.id ?? null
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
  messages: TranscriptMessage[],
): KetikConsumerPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const quote = readText(item.quote, KETIK_ANNOTATION_LIMITS.quote);
  const summary = readText(item.summary, KETIK_ANNOTATION_LIMITS.text);
  if (!quote || !summary) return null;
  if (!isOneOf(KETIK_CONSUMER_POINT_STATUSES, item.status)) return null;
  const messageId = locateQuote(messages, "consumer", item.messageId, quote);
  if (!messageId) return null;

  // Jawaban yang tidak menunjuk kalimat agen dibuang; poinnya tetap ada.
  const answerQuote = readText(item.answerQuote, KETIK_ANNOTATION_LIMITS.quote);
  const answerMessageId = answerQuote
    ? locateQuote(messages, "agent", item.answerMessageId, answerQuote)
    : null;

  return {
    messageId,
    quote,
    summary,
    status: item.status,
    reason: readText(item.reason, KETIK_ANNOTATION_LIMITS.text),
    answerMessageId,
    answerQuote: answerMessageId ? answerQuote : null,
  };
}

function readAgentNote(
  raw: unknown,
  messages: TranscriptMessage[],
): KetikAgentNote | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const quote = readText(item.quote, KETIK_ANNOTATION_LIMITS.quote);
  const note = readText(item.note, KETIK_ANNOTATION_LIMITS.text);
  if (!quote || !note) return null;
  if (!isOneOf<KetikDimensionKey>(KETIK_DIMENSION_ORDER, item.dimension)) {
    return null;
  }
  if (!isOneOf(KETIK_AGENT_NOTE_VERDICTS, item.verdict)) return null;
  const messageId = locateQuote(messages, "agent", item.messageId, quote);
  if (!messageId) return null;

  return {
    messageId,
    quote,
    dimension: item.dimension,
    verdict: item.verdict,
    note,
    example:
      item.verdict === "fix"
        ? readText(item.example, KETIK_ANNOTATION_LIMITS.text)
        : null,
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
 * Anotasi Telaah dari AI, hanya yang kutipannya benar-benar ada di pesan
 * pengirim yang tepat. Selalu mengembalikan ketiga field, supaya telaah baru
 * bisa dibedakan dari telaah lama yang belum punya anotasi.
 */
export function normalizeKetikAnnotations(
  raw: unknown,
  rawMessages: unknown,
): KetikAnnotations {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const messages = readMessages(rawMessages);
  return {
    caseCore: readText(source.caseCore, KETIK_ANNOTATION_LIMITS.text),
    consumerPoints: readList(
      source.consumerPoints,
      (item) => readConsumerPoint(item, messages),
      KETIK_ANNOTATION_LIMITS.consumerPoints,
    ),
    agentNotes: readList(
      source.agentNotes,
      (item) => readAgentNote(item, messages),
      KETIK_ANNOTATION_LIMITS.agentNotes,
    ),
  };
}
