const AGENT_SILENCE_DELAY_MS = 5_000;

export interface AgentSilenceCueTimerOptions {
  isReady: () => boolean;
  onCue: () => void;
}

/** One cue per quiet interval, with lifecycle guards owned by the session. */
export class AgentSilenceCueTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private quietSinceMs: number | null = null;
  private cueSent = false;
  private generation = 0;

  constructor(private readonly options: AgentSilenceCueTimerOptions) {}

  markQuietSince(timestampMs: number): void {
    this.clearTimer();
    this.quietSinceMs = timestampMs;
    this.cueSent = false;
    this.schedule();
  }

  reset(): void {
    this.clearTimer();
    this.quietSinceMs = null;
    this.cueSent = false;
  }

  pause(): void {
    this.clearTimer();
  }

  schedule(): void {
    this.clearTimer();
    const quietSinceMs = this.quietSinceMs;
    if (
      quietSinceMs === null ||
      this.cueSent ||
      !this.options.isReady()
    ) {
      return;
    }

    const delayMs = Math.max(
      0,
      quietSinceMs + AGENT_SILENCE_DELAY_MS - Date.now(),
    );
    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (
        generation !== this.generation ||
        quietSinceMs !== this.quietSinceMs ||
        this.cueSent ||
        Date.now() - quietSinceMs < AGENT_SILENCE_DELAY_MS ||
        !this.options.isReady()
      ) {
        return;
      }
      this.cueSent = true;
      this.options.onCue();
    }, delayMs);
  }

  dispose(): void {
    this.reset();
  }

  private clearTimer(): void {
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
