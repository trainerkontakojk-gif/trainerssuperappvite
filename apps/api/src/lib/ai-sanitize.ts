const SYSTEM_PROMPT_PATTERNS = [
  /\bdeveloper\s*instruction/i,
  /\bsystem\s*prompt/i,
  /\bmodel\s*card/i,
  /(google|openai|openrouter|anthropic)\s*guideline/i,
  /\bmodel\s*behavior/i,
  /\byou\s+are\s+an?\s+ai\s+(assistant|model|language\s*model)/i,
  /\byou\s+(are|act\s+as)\s+a\s+(helpful|customer\s*service|financial|banking)\s*(assistant|representative|agent)/i,
  /\bi\s+am\s+an?\s+ai\s+(assistant|model|language\s*model|chatbot)/i,
  /\bsafety\s*guidelines?\b/i,
  /\bcontent\s*policy\b/i,
  /\btraining\s*data\b/i,
  /\byour\s+(task|role|job|purpose)\s+is\b/i,
  /\banswer\s+the\s+following\s+(question|query|prompt)\s+based\s+on\b/i,
];

export function sanitizeAiResponse(text: string): string {
  if (!text) return text;

  let result = text;

  for (const pattern of SYSTEM_PROMPT_PATTERNS) {
    const match = result.match(pattern);
    if (match) {
      const startIdx = Math.max(0, match.index! - 40);
      const endIdx = Math.min(
        result.length,
        match.index! + match[0].length + 80,
      );
      const snippet = result.slice(startIdx, endIdx);
      console.warn(
        `[AI Sanitize] Detected potential system prompt leak: "${snippet}"`,
      );
      const replacement = "*".repeat(match[0].length);
      result =
        result.slice(0, match.index!) +
        replacement +
        result.slice(match.index! + match[0].length);
    }
  }

  return result;
}
