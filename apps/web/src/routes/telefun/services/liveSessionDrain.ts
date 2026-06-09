export class LiveSessionDrain {
  private promise: Promise<void> | null = null;
  private resolve: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _done = false;

  constructor(private readonly timeoutMs: number = 5000) {}

  start(): Promise<void> {
    if (this._done) return Promise.resolve();
    if (this.promise) return this.promise;
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => {
        this._done = true;
        resolve();
      }, this.timeoutMs);
    });
    return this.promise;
  }

  complete(): void {
    if (this._done) return;
    this._done = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.resolve) this.resolve();
  }

  get done(): boolean { return this._done; }
}
