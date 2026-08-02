import type { SidebandDiagnostic } from "./sideband-event-observer.js";

// 1 MiB accommodates normal Realtime control, transcript, usage, and audio
// framing while bounding materialization before JSON parsing. Sideband audio
// is discarded because browser media remains the WebRTC authority.
export const SIDEBAND_MAX_FRAME_BYTES = 1 * 1024 * 1024;

type SidebandSocketData =
  | { toString(): string; byteLength?: number }
  | ArrayBuffer
  | readonly Buffer[];

export interface SidebandSocket {
  readyState: number;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: SidebandSocketData) => void): this;
  on(event: "error", listener: (error: unknown) => void): this;
  on(event: "close", listener: (code: number, reason: { toString(): string }) => void): this;
  close(code?: number, reason?: string): void;
}

export type SidebandDrainResult = {
  admittedFrameCount: number;
};

export class SidebandDrainOrderError extends Error {
  readonly retryable = true;

  constructor() {
    super("sideband admission must be sealed before drain");
    this.name = "SidebandDrainOrderError";
  }
}

export class SidebandDrainTimeoutError extends Error {
  readonly retryable = true;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super("sideband drain timed out");
    this.name = "SidebandDrainTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface SidebandClient {
  connect(signal?: AbortSignal): Promise<void>;
  /** Idempotently prevents all future provider frames from entering the queue. */
  sealAdmission(): void;
  /** May be called only after sealAdmission; bounded and queue-complete. */
  drain(timeoutMs: number): Promise<SidebandDrainResult>;
  /** Idempotently closes the socket and rejects an unfinished connect. */
  close(): void;
}

export interface SidebandClientOptions {
  callId: string;
  apiKey: string;
  createSocket: (
    url: string,
    options: { headers: Record<string, string>; maxPayload: number },
  ) => SidebandSocket;
  onEvent: (event: unknown) => void | Promise<void>;
  onDiagnostic?: (diagnostic: SidebandDiagnostic) => void;
  onClose: (unexpected: boolean) => void;
  timeoutMs?: number;
}

function getFrameByteLength(data: SidebandSocketData): number | null {
  if (Buffer.isBuffer(data)) return data.byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (Array.isArray(data)) {
    if (!data.every((part) => Buffer.isBuffer(part))) return null;
    return data.reduce(
      (total, part) => total + (part as Buffer).byteLength,
      0,
    );
  }
  const dataWithLength = data as { byteLength?: number };
  return typeof dataWithLength.byteLength === "number" &&
    Number.isFinite(dataWithLength.byteLength)
    ? dataWithLength.byteLength
    : null;
}

function frameToString(data: SidebandSocketData): string {
  if (Array.isArray(data)) return Buffer.concat(data as readonly Buffer[]).toString();
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString();
  return data.toString();
}

function isNonAuthoritativeAudioEvent(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { type?: unknown }).type === "response.output_audio.delta",
  );
}

function normalizedDrainTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) return 0;
  return Math.max(0, Math.floor(timeoutMs));
}

export function createSidebandClient(
  options: SidebandClientOptions,
): SidebandClient {
  let socket: SidebandSocket | null = null;
  let closed = false;
  let connected = false;
  let admission: "open" | "sealed" = "open";
  let admittedFrameCount = 0;
  let connection: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rejectConnection: ((error: Error) => void) | null = null;
  let unexpectedNotified = false;
  let messageQueue: Promise<void> = Promise.resolve();

  const waitForQueue = async (): Promise<void> => {
    let observedQueue = messageQueue;
    while (true) {
      await observedQueue;
      // A handler may synchronously admit another frame before its promise
      // settles. Admission is sealed by the time drain starts, but those
      // handlers still have to join the same queue before drain resolves.
      await Promise.resolve();
      if (observedQueue === messageQueue) return;
      observedQueue = messageQueue;
    }
  };

  const drainQueue = (timeoutMs: number): Promise<SidebandDrainResult> => {
    const boundedTimeoutMs = normalizedDrainTimeout(timeoutMs);
    return new Promise<SidebandDrainResult>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(drainTimer);
        callback();
      };
      const drainTimer = setTimeout(() => {
        finish(() => reject(new SidebandDrainTimeoutError(boundedTimeoutMs)));
      }, boundedTimeoutMs);

      void waitForQueue().then(
        () =>
          finish(() =>
            resolve({ admittedFrameCount }),
          ),
        (error: unknown) => finish(() => reject(error)),
      );
    });
  };

  return {
    connect(signal) {
      if (connection) return connection;
      if (closed) return Promise.reject(new Error("sideband connection closed"));

      connection = new Promise<void>((resolve, reject) => {
        let settled = false;
        const finishResolve = () => {
          if (settled) return;
          settled = true;
          rejectConnection = null;
          if (timer) clearTimeout(timer);
          timer = null;
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const finishReject = (error: Error) => {
          if (settled) return;
          settled = true;
          rejectConnection = null;
          if (timer) clearTimeout(timer);
          timer = null;
          signal?.removeEventListener("abort", abort);
          reject(error);
        };
        rejectConnection = finishReject;
        const abort = () => {
          closed = true;
          admission = "sealed";
          const current = socket;
          socket = null;
          if (current && current.readyState !== 3) {
            current.close(1000, "Sideband aborted");
          }
          finishReject(new Error("sideband connection failed"));
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });

        const url = `wss://api.openai.com/v1/realtime?call_id=${options.callId}`;
        try {
          socket = options.createSocket(url, {
            headers: { Authorization: `Bearer ${options.apiKey}` },
            maxPayload: SIDEBAND_MAX_FRAME_BYTES,
          });
        } catch {
          finishReject(new Error("sideband connection failed"));
          return;
        }
        const current = socket;
        timer = setTimeout(() => {
          if (socket !== current || connected) return;
          socket = null;
          admission = "sealed";
          if (current.readyState !== 3) current.close(1000, "Sideband timeout");
          finishReject(new Error("sideband connection failed"));
        }, options.timeoutMs ?? 10_000);
        current.on("open", () => {
          if (closed || socket !== current) return;
          connected = true;
          // A socket that reaches open without a prior finalization starts with
          // open admission. sealAdmission() is synchronous and idempotent.
          finishResolve();
        });
        current.on("message", (data) => {
          if (closed || socket !== current || admission === "sealed") return;
          const frameBytes = getFrameByteLength(data);
          if (frameBytes !== null && frameBytes > SIDEBAND_MAX_FRAME_BYTES) {
            options.onDiagnostic?.({ type: "frame_too_large" });
            return;
          }
          try {
            const event = JSON.parse(frameToString(data)) as unknown;
            if (isNonAuthoritativeAudioEvent(event)) return;
            admittedFrameCount += 1;
            let handler: void | Promise<void>;
            try {
              // Keep provider observation synchronous for the ws event loop;
              // the returned promise is what drain waits to settle.
              handler = options.onEvent(event);
            } catch {
              handler = undefined;
            }
            messageQueue = messageQueue
              .then(() => handler)
              .catch(() => undefined);
          } catch {
            options.onDiagnostic?.({ type: "malformed_json" });
          }
        });
        current.on("error", () => {
          if (!connected) {
            if (socket === current) socket = null;
            if (current.readyState !== 3) current.close(1000, "Sideband connection failed");
            finishReject(new Error("sideband connection failed"));
            return;
          }
          if (socket === current) socket = null;
          if (current.readyState !== 3) current.close(1011, "Sideband error");
          notifyUnexpectedClose();
        });
        current.on("close", () => {
          if (socket !== current) return;
          socket = null;
          if (!connected) {
            finishReject(new Error("sideband connection closed"));
            return;
          }
          notifyUnexpectedClose();
        });
      });
      return connection;
    },
    sealAdmission() {
      if (admission === "open") admission = "sealed";
    },
    drain(timeoutMs) {
      if (admission === "open") {
        return Promise.reject(new SidebandDrainOrderError());
      }
      return drainQueue(timeoutMs);
    },
    close() {
      if (closed) return;
      // The admission barrier is established before the socket can be closed.
      admission = "sealed";
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const current = socket;
      socket = null;
      if (current && current.readyState !== 3) {
        current.close(1000, "WebRTC call ended");
      }
      rejectConnection?.(new Error("sideband connection closed"));
    },
  };

  function notifyUnexpectedClose() {
    if (closed || unexpectedNotified) return;
    unexpectedNotified = true;
    options.onClose(true);
  }
}
