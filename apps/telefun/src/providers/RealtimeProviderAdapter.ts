export interface RealtimeProviderAdapter {
  connect(): Promise<void> | void;
  handleClientMessage(message: unknown): void;
  close(code?: number, reason?: string): void;
  isReady(): boolean;
}

export interface RealtimeProviderLifecycleCallbacks {
  forwardToClient(raw: string): void;
  appendTranscript(entry: {
    speaker: "agent" | "consumer";
    text: string;
    observedAtMs: number;
  }): void;
  startAiSpeaking(): void;
  completeTurn(): void;
  interruptTurn(): void;
  notifyActivity(): void;
  notifyTurnComplete(): void;
  notifyInterrupted(): void;
  onFinalClose(code: number, reason: string): void;
}
