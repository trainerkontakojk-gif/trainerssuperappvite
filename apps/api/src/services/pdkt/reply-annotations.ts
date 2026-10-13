import {
  PDKT_DIMENSION_KEYS,
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
    if (!isPlainObject(item) || !isDimension(item.dimension)) continue;
    const quote = readText(item.quote, PDKT_REPLY_ANNOTATION_LIMITS.quote);
    const note = readText(item.note, PDKT_PROMPT_INPUT_LIMITS.issueText);
    if (!quote || !note) continue;

    const range = locateQuote(agentReplyBody, quote);
    const placed = range && !overlaps(range, taken) ? range : null;
    if (placed) taken.push(placed);
    annotations.push({
      quote,
      dimension: item.dimension,
      note,
      start: placed?.start ?? null,
      end: placed?.end ?? null,
    });
  }
  return annotations;
}
