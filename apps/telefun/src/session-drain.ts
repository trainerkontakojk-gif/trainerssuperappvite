export type DrainState = "open" | "draining" | "finalized";
export type DrainOutcome = "turn_complete" | "quiet_timeout" | "hard_timeout";

export interface DrainCoordinatorCallbacks {
  onFinalize: (outcome: DrainOutcome) => void;
}

export const QUIET_WINDOW_MS = 2_000;
export const HARD_TIMEOUT_MS = 10_000;

export class DrainCoordinator {
  private _state: DrainState = "open";
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private hardTimer: ReturnType<typeof setTimeout> | null = null;
  private boundaryOutcome: DrainOutcome | null = null;
  private readonly callbacks: DrainCoordinatorCallbacks;

  constructor(callbacks: DrainCoordinatorCallbacks) {
    this.callbacks = callbacks;
  }

  getState(): DrainState {
    return this._state;
  }

  isDraining(): boolean {
    return this._state === "draining";
  }

  isFinalized(): boolean {
    return this._state === "finalized";
  }

  startDrain(): void {
    if (this._state !== "open") return;
    this._state = "draining";

    this.hardTimer = setTimeout(() => {
      this.finalize("hard_timeout");
    }, HARD_TIMEOUT_MS);

  }

  notifyActivity(): void {
    if (this._state !== "draining") return;
    if (this.boundaryOutcome) this.resetQuietTimer();
  }

  notifyTurnComplete(): void {
    if (this._state !== "draining") return;
    this.boundaryOutcome = "turn_complete";
    this.resetQuietTimer();
  }

  notifyInterrupted(): void {
    if (this._state !== "draining") return;
    this.boundaryOutcome = "quiet_timeout";
    this.resetQuietTimer();
  }

  notifyUpstreamClosed(): void {
    if (this._state !== "draining") return;
    this.finalize("hard_timeout");
  }

  private finalize(outcome: DrainOutcome): void {
    if (this._state === "finalized") return;
    this._state = "finalized";
    this.clearAllTimers();
    this.callbacks.onFinalize(outcome);
  }

  private resetQuietTimer(): void {
    this.clearQuietTimer();
    this.quietTimer = setTimeout(() => {
      this.finalize(this.boundaryOutcome ?? "quiet_timeout");
    }, QUIET_WINDOW_MS);
  }

  private clearQuietTimer(): void {
    if (this.quietTimer !== null) {
      clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.clearQuietTimer();
    if (this.hardTimer !== null) {
      clearTimeout(this.hardTimer);
      this.hardTimer = null;
    }
  }
}
