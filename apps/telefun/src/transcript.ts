import type { TelefunTranscriptEntry } from "@trainers/types";
import {
  hasSanitizedContent,
  sanitizeTranscriptText,
  type TranscriptSanitizeCounts,
} from "./transcript-sanitizer.js";

type Speaker = "agent" | "consumer";

interface TranscriptLane {
  text: string;
  firstObservedAtMs: number;
}

interface PendingTranscriptTurn {
  sequence: number;
  agent: TranscriptLane | null;
  consumer: TranscriptLane | null;
}

export class TranscriptCollector {
  private entries: TelefunTranscriptEntry[] = [];
  private pending: PendingTranscriptTurn | null = null;
  private nextSequence = 0;

  constructor(
    private readonly startedAtMs: number,
    private readonly onSanitized?: (
      speaker: Speaker,
      removed: TranscriptSanitizeCounts,
    ) => void,
  ) {}

  /**
   * Gemini Live streams each lane as incremental chunks: every chunk is new
   * text, including a repeated word or a fragment that equals the start of
   * the turn so far. Concatenate verbatim.
   */
  appendDelta(params: {
    speaker: Speaker;
    text: string;
    observedAtMs: number;
  }): void {
    if (!params.text.trim()) return;
    const lane = this.pendingTurn()[params.speaker];
    if (lane) {
      lane.text += params.text;
    } else {
      this.openLane(params.speaker, params.text, params.observedAtMs);
    }
  }

  /**
   * Cumulative-or-delta merge for the historical OpenAI Realtime observer,
   * which streams deltas and then repeats the full transcript on completion.
   */
  append(params: {
    speaker: Speaker;
    text: string;
    observedAtMs: number;
  }): void {
    const normalizedText = params.text.trim();
    if (!normalizedText) return;

    const lane = this.pendingTurn()[params.speaker];
    if (!lane) {
      this.openLane(params.speaker, params.text, params.observedAtMs);
      return;
    }

    const existingText = lane.text.trim();
    if (
      existingText === normalizedText ||
      existingText.startsWith(normalizedText)
    ) {
      return;
    }
    if (normalizedText.startsWith(existingText)) {
      lane.text = normalizedText;
      return;
    }
    lane.text += params.text;
  }

  private pendingTurn(): PendingTranscriptTurn {
    this.pending ??= {
      sequence: this.nextSequence++,
      agent: null,
      consumer: null,
    };
    return this.pending;
  }

  private openLane(speaker: Speaker, text: string, observedAtMs: number): void {
    this.pendingTurn()[speaker] = {
      text,
      firstObservedAtMs: Math.max(0, observedAtMs - this.startedAtMs),
    };
  }

  completeTurn(_speaker?: "agent" | "consumer"): void {
    if (!this.pending) return;
    this.commitTurn();
  }

  interruptTurn(): void {
    if (!this.pending) return;
    this.commitTurn();
  }

  flush(_observedAtMs: number): void {
    if (!this.pending) return;
    this.commitTurn();
  }

  snapshot(): TelefunTranscriptEntry[] {
    let previousStartMs = 0;
    return this.entries.map((entry) => {
      const startMs = Math.max(previousStartMs, entry.startMs);
      previousStartMs = startMs;
      return { ...entry, startMs };
    });
  }

  private commitTurn(): void {
    const turn = this.pending;
    if (!turn) return;
    this.pending = null;

    this.commitLane("agent", turn.agent);
    this.commitLane("consumer", turn.consumer);
  }

  private commitLane(speaker: Speaker, lane: TranscriptLane | null): void {
    if (!lane) return;
    const { text, removed } = sanitizeTranscriptText(lane.text);
    if (hasSanitizedContent(removed)) this.onSanitized?.(speaker, removed);
    if (!text) return;
    this.entries.push({ speaker, text, startMs: lane.firstObservedAtMs });
  }
}
