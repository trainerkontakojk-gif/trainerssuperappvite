/**
 * Short Response Classifier
 *
 * Categorizes brief agent utterances (< 3s duration) into semantic classes
 * for appropriate AI consumer response behavior. Uses keyword matching with
 * Indonesian language patterns.
 *
 * Key behaviors:
 * - Classifies into: acknowledgement, instruction, question, closing
 * - Enforces 3000ms max duration for short response classification
 * - Requires minimum 0.7 confidence for classification
 * - Falls back to acknowledgement when confidence < 0.7
 * - Case-insensitive matching with normalized input
 */

import type {
  ShortResponseCategory,
  ClassificationResult,
  ClassificationInput,
} from "./types";

// ---------------------------------------------------------------------------
// Keyword Pools (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Acknowledgement keywords — brief confirmations or understanding signals.
 */
export const ACKNOWLEDGEMENT_KEYWORDS: string[] = [
  "baik",
  "iya",
  "saya mengerti",
  "oh begitu",
  "siap",
  "oke",
  "ya",
];

/**
 * Instruction keywords — hold/wait phrases indicating the agent needs time.
 */
export const INSTRUCTION_KEYWORDS: string[] = [
  "mohon ditunggu",
  "sebentar",
  "saya cek",
  "tunggu ya",
  "saya cek dulu",
  "ditunggu ya",
];

/**
 * Question keywords — phrases indicating the agent is asking something.
 * Note: Transcriptions ending with "?" are also classified as questions.
 */
export const QUESTION_KEYWORDS: string[] = [
  "bisa diulang",
  "maksudnya",
  "bagaimana",
  "apa",
];

/**
 * Closing keywords — farewell or session-ending phrases.
 */
export const CLOSING_KEYWORDS: string[] = [
  "terima kasih",
  "ada lagi",
  "cukup",
  "sampai jumpa",
  "sudah cukup",
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DURATION_MS = 3000;
const MIN_CONFIDENCE_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes transcription text for matching: trims whitespace and converts
 * to lowercase.
 */
function normalizeTranscription(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Calculates confidence based on how well the input matches a keyword.
 * - Exact match (input equals keyword): 1.0
 * - Input starts with keyword: 0.9
 * - Input contains keyword: 0.8
 */
function calculateMatchConfidence(normalized: string, keyword: string): number {
  if (normalized === keyword) {
    return 1.0;
  }
  if (normalized.startsWith(keyword)) {
    return 0.9;
  }
  if (normalized.includes(keyword)) {
    return 0.8;
  }
  return 0;
}

/**
 * Finds the best matching keyword in a pool and returns the highest confidence.
 */
function getBestMatchConfidence(
  normalized: string,
  keywords: string[],
): number {
  let best = 0;
  for (const keyword of keywords) {
    const confidence = calculateMatchConfidence(normalized, keyword);
    if (confidence > best) {
      best = confidence;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Main Classifier
// ---------------------------------------------------------------------------

/**
 * Classifies a short agent response into one of four categories based on
 * keyword matching with Indonesian language patterns.
 *
 * Logic:
 * 1. If durationMs > maxDurationMs (default 3000) -> not a short response,
 *    return acknowledgement with fallback=true
 * 2. Normalize transcription (lowercase, trim)
 * 3. Check against keyword pools in priority order
 * 4. Calculate confidence based on keyword match quality
 * 5. If best confidence < 0.7 -> return acknowledgement with fallback=true
 * 6. Return the matched category with its confidence
 */
export function classifyShortResponse(
  input: ClassificationInput,
): ClassificationResult {
  const maxDuration = input.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  // Duration exceeds max -> not a short response, fallback to acknowledgement
  if (input.durationMs > maxDuration) {
    return {
      category: "acknowledgement",
      confidence: 0,
      fallbackToAcknowledgement: true,
    };
  }

  const normalized = normalizeTranscription(input.transcription);

  // Empty transcription -> fallback
  if (normalized.length === 0) {
    return {
      category: "acknowledgement",
      confidence: 0,
      fallbackToAcknowledgement: true,
    };
  }

  // Check each category and track the best match
  const candidates: { category: ShortResponseCategory; confidence: number }[] =
    [];

  // Question: check for "?" ending first (high confidence), then keywords
  const questionEndsWithMark = normalized.endsWith("?");
  const questionKeywordConfidence = getBestMatchConfidence(
    normalized,
    QUESTION_KEYWORDS,
  );
  const questionConfidence = questionEndsWithMark
    ? Math.max(0.95, questionKeywordConfidence)
    : questionKeywordConfidence;
  if (questionConfidence > 0) {
    candidates.push({ category: "question", confidence: questionConfidence });
  }

  // Closing
  const closingConfidence = getBestMatchConfidence(
    normalized,
    CLOSING_KEYWORDS,
  );
  if (closingConfidence > 0) {
    candidates.push({ category: "closing", confidence: closingConfidence });
  }

  // Instruction
  const instructionConfidence = getBestMatchConfidence(
    normalized,
    INSTRUCTION_KEYWORDS,
  );
  if (instructionConfidence > 0) {
    candidates.push({
      category: "instruction",
      confidence: instructionConfidence,
    });
  }

  // Acknowledgement
  const acknowledgementConfidence = getBestMatchConfidence(
    normalized,
    ACKNOWLEDGEMENT_KEYWORDS,
  );
  if (acknowledgementConfidence > 0) {
    candidates.push({
      category: "acknowledgement",
      confidence: acknowledgementConfidence,
    });
  }

  // No matches at all -> fallback
  if (candidates.length === 0) {
    return {
      category: "acknowledgement",
      confidence: 0,
      fallbackToAcknowledgement: true,
    };
  }

  // Sort by confidence descending, pick the best
  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];

  // If best confidence is below threshold -> fallback to acknowledgement
  if (best.confidence < MIN_CONFIDENCE_THRESHOLD) {
    return {
      category: "acknowledgement",
      confidence: best.confidence,
      fallbackToAcknowledgement: true,
    };
  }

  return {
    category: best.category,
    confidence: best.confidence,
    fallbackToAcknowledgement: false,
  };
}
