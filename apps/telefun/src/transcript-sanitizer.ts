/**
 * Removes text that is not speech from a committed Gemini Live transcript
 * turn: runtime control markers the model echoed, stage directions, and ASR
 * non-speech tags. Runs on whole turns because a direction can be split across
 * streaming chunks ("(teri" + "sak)").
 */

export interface TranscriptSanitizeCounts {
  controlMarker: number;
  stageDirection: number;
  noiseTag: number;
}

export interface TranscriptSanitizeResult {
  text: string;
  removed: TranscriptSanitizeCounts;
}

// A control marker (written "[TELEFUN_CONTROL:TONE]" or spoken "Telefun
// control tone") introduces a director note, so the note is dropped through
// the end of its sentence.
const CONTROL_MARKER =
  /\[?\s*telefun[\s_-]*control\b\s*:?\s*(?:tone|time[\s_-]*cue|hold[\s_-]*end|agent[\s_-]*silent)?\s*\]?[^.!?]*[.!?]?/giu;
const STAGE_DIRECTION =
  /\*[^*\n]{1,80}\*|\([^()\n]{1,80}\)|\[[^[\]\n]{1,80}\]/gu;
const NOISE_TAG = /<\s*[\p{L}_]{1,30}\s*>/gu;

function strip(text: string, pattern: RegExp): { text: string; count: number } {
  let count = 0;
  const next = text.replace(pattern, () => {
    count += 1;
    return " ";
  });
  return { text: next, count };
}

export function sanitizeTranscriptText(text: string): TranscriptSanitizeResult {
  const marker = strip(text, CONTROL_MARKER);
  const direction = strip(marker.text, STAGE_DIRECTION);
  const noise = strip(direction.text, NOISE_TAG);
  return {
    text: noise.text
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/^[\s,.;:]+/, "")
      .trim(),
    removed: {
      controlMarker: marker.count,
      stageDirection: direction.count,
      noiseTag: noise.count,
    },
  };
}

export function hasSanitizedContent(counts: TranscriptSanitizeCounts): boolean {
  return counts.controlMarker + counts.stageDirection + counts.noiseTag > 0;
}
