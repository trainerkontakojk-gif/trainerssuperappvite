import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSession } from "../routes/telefun/services/geminiService";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const config = {
  telefunTransport: "gemini-live",
  consumerTypes: [],
} as unknown as TelefunAppSettings;

describe("LiveSession recording finalizer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disconnect tetap pending sampai callback recording async selesai", async () => {
    const callback = createDeferred();
    const session = new LiveSession(config);
    session.onRecordingComplete = vi.fn(() => callback.promise);
    Object.assign(session, {
      ws: null,
      cleanupAudio: vi.fn(),
    });

    let disconnected = false;
    const disconnect = session.disconnect("user").then(() => {
      disconnected = true;
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(session.onRecordingComplete).toHaveBeenCalledTimes(1);
    expect(disconnected).toBe(false);

    callback.resolve();
    await disconnect;

    expect(disconnected).toBe(true);
  });
});
