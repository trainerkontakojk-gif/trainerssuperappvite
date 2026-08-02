import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createSidebandClient,
  SIDEBAND_MAX_FRAME_BYTES,
  type SidebandSocket,
} from "./sideband-client.js";

class FakeSocket extends EventEmitter implements SidebandSocket {
  readyState = 0;
  close = vi.fn(() => {
    this.readyState = 3;
  });
  send = vi.fn();
  open() {
    this.readyState = 1;
    this.emit("open");
  }
}

describe("OpenAI WebRTC sideband client", () => {
  it("times out and closes a socket that never opens", async () => {
    vi.useFakeTimers();
    try {
      const socket = new FakeSocket();
      const client = createSidebandClient({
        callId: "rtc_server_call",
        apiKey: "server-secret",
        createSocket: () => socket,
        onEvent: vi.fn(),
        onClose: vi.fn(),
        timeoutMs: 25,
      });
      const pending = client.connect();
      const assertion = expect(pending).rejects.toThrow("sideband connection failed");
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(socket.close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies an unexpected post-connect error and close only once", async () => {
    const socket = new FakeSocket();
    const onClose = vi.fn();
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket: () => socket,
      onEvent: vi.fn(),
      onClose,
    });
    const pending = client.connect();
    socket.open();
    await expect(pending).resolves.toBeUndefined();
    socket.emit("error", new Error("provider closed"));
    socket.emit("close", 1006, { toString: () => "provider closed" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("reports malformed JSON as a bounded diagnostic without the raw frame", async () => {
    const socket = new FakeSocket();
    const onDiagnostic = vi.fn();
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket: () => socket,
      onEvent: vi.fn(),
      onDiagnostic,
      onClose: vi.fn(),
    });

    const connected = client.connect();
    socket.open();
    await connected;
    socket.emit("message", Buffer.from('{"secret":"not-for-logs"'));

    expect(onDiagnostic).toHaveBeenCalledWith({ type: "malformed_json" });
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain("not-for-logs");
  });

  it("sets the bounded production maxPayload and rejects oversized frames before parsing", async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket);
    const onEvent = vi.fn();
    const onDiagnostic = vi.fn();
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket,
      onEvent,
      onDiagnostic,
      onClose: vi.fn(),
    });

    const connected = client.connect();
    expect(createSocket).toHaveBeenCalledWith(
      "wss://api.openai.com/v1/realtime?call_id=rtc_server_call",
      {
        headers: { Authorization: "Bearer server-secret" },
        maxPayload: SIDEBAND_MAX_FRAME_BYTES,
      },
    );
    socket.open();
    await connected;

    const toString = vi.fn(() => JSON.stringify({ type: "response.done" }));
    socket.emit("message", { byteLength: SIDEBAND_MAX_FRAME_BYTES + 1, toString });

    expect(toString).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onDiagnostic).toHaveBeenCalledWith({ type: "frame_too_large" });
  });

  it("forwards a provider error event without logging its provider message", async () => {
    const socket = new FakeSocket();
    const onEvent = vi.fn();
    const onDiagnostic = vi.fn();
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket: () => socket,
      onEvent,
      onDiagnostic,
      onClose: vi.fn(),
    });

    const connected = client.connect();
    socket.open();
    await connected;
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "error",
          error: {
            type: "server_error",
            code: "internal_error",
            message: "provider secret details",
          },
        }),
      ),
    );

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain("provider secret");
  });

  it("drops non-authoritative sideband output audio before onEvent", async () => {
    const socket = new FakeSocket();
    const onEvent = vi.fn();
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket: () => socket,
      onEvent,
      onClose: vi.fn(),
    });

    const connected = client.connect();
    socket.open();
    await connected;
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.output_audio.delta",
          response_id: "response-audio",
          delta: "AA==",
        }),
      ),
    );
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-control", status: "completed" },
        }),
      ),
    );

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      type: "response.done",
      response: { id: "response-control", status: "completed" },
    });
  });

  it("waits for queued final frames before completing a drain", async () => {
    const socket = new FakeSocket();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onEvent = vi.fn(async () => pending);
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket: () => socket,
      onEvent,
      onClose: vi.fn(),
    });

    const connected = client.connect();
    socket.open();
    await connected;
    socket.emit("message", Buffer.from('{"type":"response.done"}'));

    let drained = false;
    client.sealAdmission();
    const draining = client.drain(1_000).then((result) => {
      drained = true;
      expect(result.admittedFrameCount).toBe(1);
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await draining;
    expect(drained).toBe(true);
    expect(onEvent).toHaveBeenCalledWith({ type: "response.done" });
  });

  it("rejects a drain until admission is sealed", async () => {
    const socket = new FakeSocket();
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket: () => socket,
      onEvent: vi.fn(),
      onClose: vi.fn(),
    });
    const connected = client.connect();
    socket.open();
    await connected;

    await expect(client.drain(100)).rejects.toThrow(/seal/i);
  });

  it("bounds a sealed drain while retaining its admitted frame count", async () => {
    vi.useFakeTimers();
    try {
      const socket = new FakeSocket();
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const client = createSidebandClient({
        callId: "rtc_server_call",
        apiKey: "server-secret",
        createSocket: () => socket,
        onEvent: vi.fn(async () => pending),
        onClose: vi.fn(),
      });
      const connected = client.connect();
      socket.open();
      await connected;
      socket.emit("message", Buffer.from('{"type":"response.done"}'));
      client.sealAdmission();

      const draining = client.drain(25);
      const assertion = expect(draining).rejects.toThrow(/drain/i);
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      release();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses only the server-bound call ID and Bearer credential", async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket);
    const onEvent = vi.fn();
    const onClose = vi.fn();
    const client = createSidebandClient({
      callId: "rtc_server_call",
      apiKey: "server-secret",
      createSocket,
      onEvent,
      onClose,
    });

    const connected = client.connect();
    expect(createSocket).toHaveBeenCalledWith(
      "wss://api.openai.com/v1/realtime?call_id=rtc_server_call",
      {
        headers: { Authorization: "Bearer server-secret" },
        maxPayload: SIDEBAND_MAX_FRAME_BYTES,
      },
    );
    socket.open();
    await connected;
    socket.emit("message", Buffer.from('{"type":"response.done"}'));
    expect(onEvent).toHaveBeenCalledWith({ type: "response.done" });
    client.close();
    client.close();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
