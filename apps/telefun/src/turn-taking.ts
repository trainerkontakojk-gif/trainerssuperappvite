export enum TurnState {
  LISTENING = "listening",
  PROCESSING = "processing",
  SPEAKING = "speaking",
}

export class TurnManager {
  private _state: TurnState = TurnState.LISTENING;
  private callbacks: Array<(state: TurnState) => void> = [];

  get state() {
    return this._state;
  }

  setState(state: TurnState) {
    if (this._state === state) return;
    this._state = state;
    for (const cb of this.callbacks) cb(state);
  }

  onStateChange(cb: (state: TurnState) => void) {
    this.callbacks.push(cb);
  }

  canSendToGemini(): boolean {
    return (
      this._state === TurnState.LISTENING ||
      this._state === TurnState.PROCESSING
    );
  }

  startUserUtterance() {
    this.setState(TurnState.LISTENING);
  }

  sendToGemini() {
    this.setState(TurnState.PROCESSING);
  }

  startAiSpeaking() {
    this.setState(TurnState.SPEAKING);
  }

  endAiSpeaking() {
    this.setState(TurnState.LISTENING);
  }
}
