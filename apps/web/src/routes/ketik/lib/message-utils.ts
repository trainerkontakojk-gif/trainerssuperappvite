import type { ChatMessage } from "@trainers/types";

export const IMAGE_TAG_PATTERN = /\[SEND_IMAGE\s*:\s*\d+\]/i;
export const IMAGE_TAG_PATTERN_GLOBAL = /\[SEND_IMAGE\s*:\s*\d+\]/gi;
export const SYSTEM_TAG_PATTERN = /\[(sistem|system)\]/i;
export const SYSTEM_TAG_PATTERN_GLOBAL = /\[(sistem|system)\]/gi;
export const NO_RESPONSE_PATTERN_GLOBAL = /\[NO_RESPONSE\]/gi;

export const STRICT_INSTRUCTIONAL_CUES = [
  "silakan",
  "mohon",
  "harap",
  "bisa dilakukan",
  "yang perlu",
  "pastikan",
  "hubungi",
  "datang ke",
  "bawa",
  "siapkan",
  "verifikasi",
] as const;

export const ACTION_VERB_CUES = [
  "coba",
  "klik",
  "tekan",
  "pilih",
  "masukkan",
  "isi",
  "konfirmasi",
] as const;

export function hasStructuralSteps(text: string): boolean {
  const lines = text.split(/\n/);
  let stepCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[\d]+[.)]\s/.test(trimmed)) stepCount += 1;
    else if (/^[a-z][.)]\s/i.test(trimmed)) stepCount += 1;
    else if (/^[-*•]\s/.test(trimmed)) stepCount += 1;
  }
  return stepCount >= 2;
}

export function countCuesWithBoundary(lower: string): number {
  let count = 0;
  for (const cue of STRICT_INSTRUCTIONAL_CUES) {
    const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = cue.includes(" ")
      ? new RegExp(escaped, "i")
      : new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(lower)) count += 1;
  }
  for (const cue of ACTION_VERB_CUES) {
    const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(lower)) count += 1;
  }
  return count;
}

export function allowSolutionAcknowledgement(
  lastAgentText: string | null,
): boolean {
  if (!lastAgentText) return false;
  const lower = lastAgentText.toLowerCase();
  const cueCount = countCuesWithBoundary(lower);
  const hasSteps = hasStructuralSteps(lastAgentText);
  const hasNextWord = /\b(selanjutnya|berikutnya|kemudian|lalu)\b/i.test(lower);
  if (cueCount >= 3) return true;
  if (cueCount >= 2 && hasSteps) return true;
  if (cueCount >= 2 && hasNextWord) return true;
  if (cueCount >= 1 && hasSteps) return true;
  return false;
}

export function stripSystemTags(text: string): string {
  return text.replace(SYSTEM_TAG_PATTERN_GLOBAL, "").trim();
}

export function hasImageTag(text: string): boolean {
  return IMAGE_TAG_PATTERN.test(text);
}

export function isImageOnlyText(text: string): boolean {
  const cleaned = stripSystemTags(text);
  return (
    cleaned.length > 0 &&
    hasImageTag(cleaned) &&
    cleaned.replace(IMAGE_TAG_PATTERN_GLOBAL, "").trim() === ""
  );
}

export function stripNarrationFromImagePart(text: string): string {
  const match = text.match(IMAGE_TAG_PATTERN);
  if (match) {
    const stripped = text.replace(IMAGE_TAG_PATTERN_GLOBAL, "").trim();
    if (stripped) {
      console.warn(
        "[ketik][stripNarration] Stripped narration from image part:",
        { stripped, kept: match[0] },
      );
    }
    return match[0];
  }
  return text;
}

export function normalizeGeneratedParts(
  parts: string[],
): Array<Pick<ChatMessage, "sender" | "text">> {
  const normalized: Array<Pick<ChatMessage, "sender" | "text">> = [];

  for (let index = 0; index < parts.length; index += 1) {
    const currentRaw = parts[index];
    const currentText = stripSystemTags(currentRaw);
    const nextRaw = parts[index + 1];

    if (!currentText) continue;

    if (SYSTEM_TAG_PATTERN.test(currentRaw) && hasImageTag(currentRaw)) {
      normalized.push({
        sender: "consumer",
        text: stripNarrationFromImagePart(currentRaw),
      });
      continue;
    }

    if (
      SYSTEM_TAG_PATTERN.test(currentRaw) &&
      nextRaw &&
      isImageOnlyText(nextRaw)
    ) {
      normalized.push({
        sender: "consumer",
        text: `${currentText} ${stripSystemTags(nextRaw)}`.trim(),
      });
      index += 1;
      continue;
    }

    normalized.push({
      sender: hasImageTag(currentText)
        ? "consumer"
        : SYSTEM_TAG_PATTERN.test(currentRaw)
          ? "system"
          : "consumer",
      text: currentText,
    });
  }

  return normalized;
}

export function normalizeMessagesForDisplay(messages: ChatMessage[]): ChatMessage[] {
  const normalized: ChatMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    const currentText = typeof current.text === "string" ? current.text : "";
    const cleanedText = stripSystemTags(currentText);
    const next = messages[index + 1];

    if (current.sender === "system" && hasImageTag(currentText)) {
      normalized.push({
        ...current,
        sender: "consumer",
        text: stripNarrationFromImagePart(currentText),
      });
      continue;
    }

    if (current.sender === "system" && next && isImageOnlyText(next.text)) {
      normalized.push({
        ...next,
        sender: "consumer",
        text: `${cleanedText} ${stripSystemTags(next.text)}`.trim(),
      });
      index += 1;
      continue;
    }

    if (hasImageTag(currentText)) {
      normalized.push({ ...current, sender: "consumer", text: cleanedText });
      continue;
    }

    normalized.push(
      cleanedText !== currentText ? { ...current, text: cleanedText } : current,
    );
  }

  return normalized;
}
