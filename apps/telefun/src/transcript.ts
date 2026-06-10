import type { TelefunTranscriptEntry } from "@trainers/types";

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

  constructor(private readonly startedAtMs: number) {}

  append(params: {
    speaker: "agent" | "consumer";
    text: string;
    observedAtMs: number;
  }): void {
    const normalizedText = params.text.trim();
    if (!normalizedText) return;

    const offset = Math.max(0, params.observedAtMs - this.startedAtMs);

    if (!this.pending) {
      this.pending = {
        sequence: this.nextSequence++,
        agent: null,
        consumer: null,
      };
    }

    const laneKey = params.speaker;
    const lane = this.pending[laneKey];

    if (lane) {
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
    } else {
      this.pending[laneKey] = {
        text: params.text,
        firstObservedAtMs: offset,
      };
    }
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

    if (turn.agent) {
      this.entries.push({
        speaker: "agent",
        text: turn.agent.text.replace(/\s+/g, " ").trim(),
        startMs: turn.agent.firstObservedAtMs,
      });
    }
    if (turn.consumer) {
      this.entries.push({
        speaker: "consumer",
        text: turn.consumer.text.replace(/\s+/g, " ").trim(),
        startMs: turn.consumer.firstObservedAtMs,
      });
    }
  }
}
