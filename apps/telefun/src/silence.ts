export class UtteranceBuffer {
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxDelayMs: number;
  private readonly minDelayMs: number;
  private startedAt = 0;
  private callbacks: Array<(data: string) => void> = [];

  constructor(minDelayMs = 500, maxDelayMs = 1000) {
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  onFlush(cb: (data: string) => void) {
    this.callbacks.push(cb);
  }

  push(data: string) {
    this.buffer.push(data);
    if (this.buffer.length === 1) {
      this.startedAt = Date.now();
      this.flushTimer = setTimeout(() => this.flush(), this.minDelayMs);
    } else if (Date.now() - this.startedAt >= this.maxDelayMs) {
      this.flush();
    }
  }

  private flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;
    const batched = this.buffer.join("");
    this.buffer = [];
    for (const cb of this.callbacks) cb(batched);
  }

  flushNow() {
    this.flush();
  }

  clear() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = [];
  }
}
