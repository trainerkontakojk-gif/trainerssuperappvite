import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSession } from "../routes/telefun/services/geminiService";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

interface FakeMessageEvent {
  data: string;
}

class FakeSocket {
  readyState: number = 1; // WebSocket.OPEN
  sent: string[] = [];
  onmessage: ((event: FakeMessageEvent) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 3; // WebSocket.CLOSED
  });

  send(data: string) {
    this.sent.push(data);
  }

  addEventListener(_type: string, handler: (event: FakeMessageEvent) => void) {
    this.onmessage = handler;
  }

  emitMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

function createSession(socket: FakeSocket) {
  const config = {
    telefunTransport: "gemini-live",
    consumerTypes: [],
  } as unknown as TelefunAppSettings;
  const session = new LiveSession(config);
  Object.assign(session, {
    ws: socket,
    cleanupAudio: vi.fn(),
    stopRecordingOnce: vi.fn(),
  });
  return session;
}

describe("LiveSession graceful drain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends audio end before end request and closes only after acknowledgment", async () => {
    const socket = new FakeSocket();
    const session = createSession(socket);

    const disconnect = session.disconnect("user");
    const parseJson = (s: string) => JSON.parse(s);
    expect(socket.sent.map(parseJson)).toEqual([
      { realtimeInput: { audioStreamEnd: true } },
      { type: "session_end_request", reason: "user" },
    ]);
    expect(socket.close).not.toHaveBeenCalled();

    // Simulate server sending session_end_complete
    socket.emitMessage({
      type: "session_end_complete",
      outcome: "turn_complete",
    });
    await disconnect;

    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("closes after the bounded client timeout", async () => {
    const socket = new FakeSocket();
    const session = createSession(socket);

    const disconnect = session.disconnect("timeout");
    await vi.advanceTimersByTimeAsync(5_000);
    await disconnect;

    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("handles duplicate disconnect calls gracefully", async () => {
    const socket = new FakeSocket();
    const session = createSession(socket);

    const first = session.disconnect("cleanup");
    const second = session.disconnect("cleanup");
    // Second call still returns a Promise but doesn't send duplicate messages
    expect(second).toBeInstanceOf(Promise);

    socket.emitMessage({
      type: "session_end_complete",
      outcome: "quiet_timeout",
    });
    await first;

    expect(socket.sent).toHaveLength(2);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
