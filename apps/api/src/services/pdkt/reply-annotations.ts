import {
  PDKT_DIMENSION_KEYS,
  PDKT_CONSUMER_POINT_LIMITS,
  PDKT_CONSUMER_POINT_STATUSES,
  type PdktConsumerPoint,
  PDKT_PROMPT_INPUT_LIMITS,
  PDKT_REPLY_ANNOTATION_LIMITS,
  type PdktDimensionKey,
  type PdktReplyAnnotation,
} from "@trainers/types";
import { sanitizeAiResponse } from "../../lib/ai-sanitize";

type Range = { start: number; end: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = sanitizeAiResponse(value).trim();
  return text && text.length <= max ? text : null;
}

function isDimension(value: unknown): value is PdktDimensionKey {
  return PDKT_DIMENSION_KEYS.includes(value as PdktDimensionKey);
}

/** Cari kutipan di balasan: persis dulu, lalu dengan spasi/baris baru yang fleksibel. */
function locateQuote(body: string, quote: string): Range | null {
  const exact = body.indexOf(quote);
  if (exact >= 0) return { start: exact, end: exact + quote.length };

  const pattern = quote
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern, "u").exec(body);
  return match
    ? { start: match.index, end: match.index + match[0].length }
    : null;
}

function overlaps(range: Range, taken: Range[]): boolean {
  return taken.some(
    (other) => range.start < other.end && other.start < range.end,
  );
}

/**
 * Normalisasi `annotations` dari AI. Item tidak valid dibuang tanpa
 * menggagalkan penilaian; kutipan yang tidak ketemu atau bertumpuk tetap
 * disimpan tanpa posisi agar catatannya tetap tampil.
 */
export function readPdktReplyAnnotations(
  value: unknown,
  agentReplyBody: string,
): PdktReplyAnnotation[] {
  if (!Array.isArray(value)) return [];

  const taken: Range[] = [];
  const annotations: PdktReplyAnnotation[] = [];
  for (const item of value) {
    if (annotations.length >= PDKT_REPLY_ANNOTATION_LIMITS.count) break;
    if (!isPlainObject(item)) continue;
    const dimension = item.kind === "transition" ? "clarity" : item.dimension;
    if (!isDimension(dimension)) continue;
    const quote = readText(item.quote, PDKT_REPLY_ANNOTATION_LIMITS.quote);
    const note = readText(item.note, PDKT_PROMPT_INPUT_LIMITS.issueText);
    if (!quote || !note) continue;

    const range = locateQuote(agentReplyBody, quote);
    const placed = range && !overlaps(range, taken) ? range : null;
    if (placed) taken.push(placed);
    const example = readText(item.example, PDKT_PROMPT_INPUT_LIMITS.issueText);
    annotations.push({
      quote,
      dimension,
      ...(item.kind === "transition" ? { kind: "transition" as const } : {}),
      ...(example ? { example } : {}),
      note,
      start: placed?.start ?? null,
      end: placed?.end ?? null,
    });
  }
  return annotations;
}

/** Poin konsumen dan tautan balasannya dinormalisasi terhadap body asli. */
export function readPdktConsumerPoints(
  value: unknown,
  inboundEmailBody: string,
  agentReplyBody: string,
): PdktConsumerPoint[] {
  if (!Array.isArray(value)) return [];
  const taken: Range[] = [];
  const points: PdktConsumerPoint[] = [];
  for (const item of value) {
    if (points.length >= PDKT_CONSUMER_POINT_LIMITS.count) break;
    if (!isPlainObject(item)) continue;
    const status = PDKT_CONSUMER_POINT_STATUSES.find(
      (status) => status === item.status,
    );
    const quote = readText(item.quote, PDKT_CONSUMER_POINT_LIMITS.quote);
    const summary = readText(item.summary, PDKT_PROMPT_INPUT_LIMITS.issueText);
    const reason = readText(item.reason, PDKT_PROMPT_INPUT_LIMITS.issueText);
    if (!status || !quote || !summary || (status !== "answered" && !reason))
      continue;
    const range = locateQuote(inboundEmailBody, quote);
    const placed = range && !overlaps(range, taken) ? range : null;
    if (placed) taken.push(placed);
    const replyQuote =
      status === "unanswered"
        ? null
        : readText(item.replyQuote, PDKT_CONSUMER_POINT_LIMITS.quote);
    const replyRange = replyQuote
      ? locateQuote(agentReplyBody, replyQuote)
      : null;
    points.push({
      quote,
      summary,
      status,
      reason: status === "answered" ? null : reason,
      start: placed?.start ?? null,
      end: placed?.end ?? null,
      replyQuote,
      replyEnd: replyRange?.end ?? null,
    });
  }
  return points;
}
