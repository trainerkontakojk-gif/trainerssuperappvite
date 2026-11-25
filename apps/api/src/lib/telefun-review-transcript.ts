import type { TelefunTranscriptEntry } from "@trainers/types";

/**
 * Telaah transcript: the Live two-way transcript with each agent turn's text
 * replaced by the matching span of the post-call agent-recording
 * transcription. Live keeps the turn order and `startMs` (the consumer lane
 * and audio seeking depend on them); the recording supplies the words, which
 * Live often mishears (OJK, IASC, names) or drops (fillers).
 *
 * The two transcripts have no shared clock, so turns are mapped by aligning
 * words (longest common subsequence), not by time.
 */

/** Below this share of Live agent words found in the recording, the two do
 * not describe the same speech and no merged transcript is produced. */
export const TELEFUN_REVIEW_TRANSCRIPT_MIN_MATCH_RATIO = 0.6;

/** Bounds the alignment table (live words × recording words). */
const MAX_ALIGNMENT_CELLS = 16_000_000;

const WORD_PATTERN = /\[tidak jelas\]|[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/giu;

interface Word {
  key: string;
  start: number;
}

function words(text: string): Word[] {
  return [...text.matchAll(WORD_PATTERN)].map((match) => ({
    key: match[0].toLowerCase(),
    start: match.index,
  }));
}

/** `match[i]` = recording word index aligned to live word `i`, or -1. */
function align(live: readonly Word[], recording: readonly Word[]): Int32Array {
  const n = live.length;
  const m = recording.length;
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        live[i]!.key === recording[j]!.key
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const match = new Int32Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (live[i]!.key === recording[j]!.key) {
      match[i] = j;
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return match;
}

export type TelefunReviewTranscriptResult =
  | { status: "merged"; transcript: TelefunTranscriptEntry[] }
  | { status: "unmatched"; matchRatio: number }
  | { status: "too_long" };

/**
 * `segments` are the recording transcription segments in time order; a
 * segment start or a sentence end is the preferred place to cut between two
 * agent turns, because consumer speech leaves a pause in the agent audio.
 */
export function buildTelefunReviewTranscript(
  liveTranscript: readonly TelefunTranscriptEntry[],
  segments: readonly { text: string }[],
): TelefunReviewTranscriptResult {
  const recordingText = segments.map((segment) => segment.text).join(" ");
  const recording = words(recordingText);
  const cutCandidates = new Set<number>([0]);
  let offset = 0;
  for (const segment of segments) {
    const index = recording.findIndex((word) => word.start >= offset);
    if (index >= 0) cutCandidates.add(index);
    offset += segment.text.length + 1;
  }
  for (let index = 1; index < recording.length; index += 1) {
    const between = recordingText.slice(
      recording[index - 1]!.start,
      recording[index]!.start,
    );
    if (/[.?!]/u.test(between)) cutCandidates.add(index);
  }

  const live: Word[] = [];
  const turnOf: number[] = [];
  liveTranscript.forEach((entry, entryIndex) => {
    if (entry.speaker !== "agent") return;
    for (const word of words(entry.text)) {
      live.push(word);
      turnOf.push(entryIndex);
    }
  });
  if (live.length === 0 || recording.length === 0)
    return { status: "unmatched", matchRatio: 0 };
  if (live.length * recording.length > MAX_ALIGNMENT_CELLS)
    return { status: "too_long" };

  const match = align(live, recording);
  const matched = match.filter((j) => j >= 0).length;
  const matchRatio = matched / live.length;
  if (matchRatio < TELEFUN_REVIEW_TRANSCRIPT_MIN_MATCH_RATIO)
    return { status: "unmatched", matchRatio };

  // A lone common word ("baik", "ya") can align inside a neighbour's speech,
  // so a turn's edges come from runs of two or more consecutive matches when
  // it has any; a one-word turn ("Iya.") falls back to its single match.
  const inRun = (i: number) =>
    match[i]! >= 0 &&
    ((i > 0 && turnOf[i - 1] === turnOf[i] && match[i - 1] === match[i]! - 1) ||
      (i + 1 < live.length &&
        turnOf[i + 1] === turnOf[i] &&
        match[i + 1] === match[i]! + 1));
  const edges = new Map<
    number,
    { first: number; last: number; run: boolean }
  >();
  match.forEach((j, i) => {
    if (j < 0) return;
    const turn = turnOf[i]!;
    const run = inRun(i);
    const edge = edges.get(turn);
    if (!edge || (run && !edge.run))
      edges.set(turn, { first: j, last: j, run });
    else if (run === edge.run) edge.last = j;
  });
  const firstMatch = new Map([...edges].map(([turn, e]) => [turn, e.first]));
  const lastMatch = new Map([...edges].map(([turn, e]) => [turn, e.last]));

  // Agent turns with no aligned word (wrong-language or off-mic Live text)
  // are dropped; their recording words land in the previous anchored turn.
  const anchored = [...firstMatch.keys()];
  const cuts = anchored.map((turn, index) => {
    if (index === 0) return 0;
    const low = lastMatch.get(anchored[index - 1]!)! + 1;
    const high = firstMatch.get(turn)!;
    for (let cut = high; cut >= low; cut -= 1)
      if (cutCandidates.has(cut)) return cut;
    return high;
  });
  const agentText = new Map<number, string>();
  anchored.forEach((turn, index) => {
    const from = recording[cuts[index]!]!.start;
    const to =
      index + 1 < cuts.length
        ? recording[cuts[index + 1]!]!.start
        : recordingText.length;
    agentText.set(turn, recordingText.slice(from, to).trim());
  });

  const transcript = liveTranscript.flatMap((entry, entryIndex) => {
    if (entry.speaker !== "agent") return [entry];
    const text = agentText.get(entryIndex);
    return text ? [{ ...entry, text }] : [];
  });
  return { status: "merged", transcript };
}
