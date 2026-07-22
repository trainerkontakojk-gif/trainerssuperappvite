import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSession } from "../routes/telefun/services/liveSession";
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

  it("tetap menyelesaikan disconnect ketika callback recording gagal", async () => {
    const session = new LiveSession(config);
    session.onRecordingComplete = vi.fn(async () => {
      throw new Error("recording callback failed");
    });
    Object.assign(session, {
      ws: null,
      cleanupAudio: vi.fn(),
    });

    const disconnect = session.disconnect("user");
    await vi.advanceTimersByTimeAsync(500);

    await expect(disconnect).resolves.toBeUndefined();
    expect(session.onRecordingComplete).toHaveBeenCalledTimes(1);
  });

  it("menyelesaikan disconnect setelah batas waktu jika callback recording hang", async () => {
    const session = new LiveSession(config);
    session.onRecordingComplete = vi.fn(() => new Promise<void>(() => {}));
    Object.assign(session, {
      ws: null,
      cleanupAudio: vi.fn(),
    });

    const settled = Promise.race([
      session.disconnect("user").then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 10_001);
      }),
    ]);

    await vi.advanceTimersByTimeAsync(10_001);

    await expect(settled).resolves.toBe(true);
  });

  it("memakai satu budget 10 detik untuk drain dan callback recording yang hang", async () => {
    const socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
    };
    const session = new LiveSession(config);
    session.onRecordingComplete = vi.fn(() => new Promise<void>(() => {}));
    Object.assign(session, {
      ws: socket,
      hasConfigured: true,
      cleanupAudio: vi.fn(),
    });

    let disconnected = false;
    const disconnect = session.disconnect("user").then(() => {
      disconnected = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(disconnected).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(disconnected).toBe(true);
    await disconnect;
  });
});
