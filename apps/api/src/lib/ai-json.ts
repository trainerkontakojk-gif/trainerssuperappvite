/**
 * Utilities for extracting and parsing JSON from AI model responses.
 */

/**
 * Tries to extract a valid JSON object string from a raw AI response.
 * Handles markdown code blocks and robustly searches for balanced braces if needed.
 */
export function extractJsonObjectText(raw: string): string {
  const trimmed = raw.trim();

  // 1. Try markdown fenced blocks
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const content = fenced[1].trim();
    try {
      JSON.parse(content);
      return content;
    } catch {
      /* fallthrough to robust matching within the fence */
      return extractRobust(content);
    }
  }

  return extractRobust(trimmed);
}

/**
 * Robustly searches for the largest possible valid JSON object within a string.
 */
function extractRobust(text: string): string {
  try {
    JSON.parse(text);
    return text;
  } catch {
    /* continue */
  }

  const startIndices: number[] = [];
  const endIndices: number[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") startIndices.push(i);
    if (text[i] === "}") endIndices.push(i);
  }

  // Try from the first '{' and every '}' from last to first
  for (const start of startIndices) {
    for (let i = endIndices.length - 1; i >= 0; i--) {
      const end = endIndices[i];
      if (end > start) {
        const candidate = text.slice(start, end + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          continue;
        }
      }
    }
  }

  return text; // Return as-is if no valid JSON found, caller will handle fail
}

/**
 * Parses JSON from model text with robust extraction.
 * @throws Error if no valid JSON found.
 */
export function parseJsonFromModelText(raw: string): any {
  const extracted = extractJsonObjectText(raw);
  try {
    return JSON.parse(extracted);
  } catch (err) {
    throw new Error("Tidak ada data JSON valid dari model.", { cause: err });
  }
}
