import type { TelefunTranscriptEntry } from "@trainers/types";

interface ActiveUtterance {
  speaker: "agent" | "consumer";
  text: string;
  startMs: number;
}

export class TranscriptCollector {
  private entries: TelefunTranscriptEntry[] = [];
  private active: ActiveUtterance | null = null;

  constructor(private readonly startedAtMs: number) {}

  append(params: {
    speaker: "agent" | "consumer";
    text: string;
    observedAtMs: number;
  }): void {
    const text = params.text;
    const normalizedText = text.trim();
    if (!normalizedText) return;

    const offset = Math.max(0, params.observedAtMs - this.startedAtMs);

    if (this.active && this.active.speaker === params.speaker) {
      const activeText = this.active.text.trim();

      if (
        activeText === normalizedText ||
        activeText.startsWith(normalizedText)
      ) {
        return;
      }

      if (normalizedText.startsWith(activeText)) {
        this.active.text = normalizedText;
        return;
      }

      this.active.text += text;
      return;
    }

    if (this.active) {
      this.flushEntry();
    }

    this.active = {
      speaker: params.speaker,
      text,
      startMs: offset,
    };
  }

  completeTurn(speaker?: "agent" | "consumer"): void {
    if (this.active && (!speaker || this.active.speaker === speaker)) {
      this.flushEntry();
    }
  }

  flush(_observedAtMs: number): void {
    if (this.active) {
      this.flushEntry();
    }
  }

  snapshot(): TelefunTranscriptEntry[] {
    return [...this.entries];
  }

  private flushEntry(): void {
    if (!this.active) return;
    this.entries.push({
      speaker: this.active.speaker,
      text: this.active.text.replace(/\s+/g, " ").trim(),
      startMs: this.active.startMs,
    });
    this.active = null;
  }
}

