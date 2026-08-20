import {
  POC_MAX_SESSION_JSON_BYTES,
  POC_MAX_SDP_RESPONSE_BYTES,
  type CanonicalPocSession,
  isBoundedSdpAnswer,
} from "./contracts.js";

const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const OPENAI_CALLS_ORIGIN = "https://api.openai.com";
const CALL_LOCATION_PATTERN =
  /^\/v1\/realtime\/calls\/(rtc_[A-Za-z0-9_-]{1,128})$/;

export class OpenAiCallCreationError extends Error {
  readonly callId?: string;

  constructor(message: string, callId?: string) {
    super(message);
    this.name = "OpenAiCallCreationError";
    this.callId = callId;
  }
}

export interface OpenAiCallsClient {
  createCall(input: {
    offerSdp: string;
    session: CanonicalPocSession;
    signal?: AbortSignal;
  }): Promise<{ answerSdp: string; callId: string }>;
  closeCall?(callId: string): Promise<boolean>;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  text?: () => Promise<string>;
}

interface OpenAiFetchInit {
  method: "POST";
  headers: Record<string, string>;
  body?: FormData;
  signal?: AbortSignal;
}

type OpenAiFetch = (
  input: string,
  init: OpenAiFetchInit,
) => Promise<FetchResponseLike>;

export interface OpenAiCallsClientOptions {
  apiKey: string;
  timeoutMs?: number;
  fetch?: OpenAiFetch;
}

/** Cleanup-only provider boundary used by historical owner-bound DELETE. */
export interface OpenAiCallCleanupClient {
  closeCall(callId: string): Promise<boolean>;
}

export function createOpenAiCallCleanupClient(
  options: OpenAiCallsClientOptions,
): OpenAiCallCleanupClient {
  const fetchImpl: OpenAiFetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 15_000;

  const request = async <T>(operation: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async closeCall(callId) {
      // An absent key is not a reason to send an unauthenticated provider
      // request. The durable manager keeps the historical attempt retryable.
      if (!options.apiKey.trim() || !isSafeCallId(callId)) return false;
      const location = `${OPENAI_CALLS_ORIGIN}/v1/realtime/calls/${callId}/hangup`;
      try {
        return await request(async (signal) => {
          const response = await fetchImpl(location, {
            method: "POST",
            headers: { Authorization: `Bearer ${options.apiKey}` },
            signal,
          });
          return response.status >= 200 && response.status < 300;
        });
      } catch {
        return false;
      }
    },
  };
}

export function createOpenAiCallsClient(
  options: OpenAiCallsClientOptions,
): OpenAiCallsClient {
  const fetchImpl: OpenAiFetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 15_000;

  const request = async <T>(
    callerSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  };

  return {
    async createCall({ offerSdp, session, signal }) {
      const sessionJson = JSON.stringify(session);
      if (Buffer.byteLength(sessionJson, "utf8") > POC_MAX_SESSION_JSON_BYTES) {
        throw new OpenAiCallCreationError("provider call failed");
      }
      const form = new FormData();
      form.set("sdp", offerSdp);
      form.set("session", sessionJson);
      let callId: string | undefined;

      try {
        return await request(signal, async (requestSignal) => {
          const response = await fetchImpl(OPENAI_CALLS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${options.apiKey}` },
            body: form,
            signal: requestSignal,
          });
          // Location is the only safe provider identifier and must be retained
          // before any potentially hanging or malformed body read.
          callId = parseCallId(response.headers.get("Location")) ?? undefined;
          let answerSdp: string;
          try {
            answerSdp = await readBoundedText(
              response,
              requestSignal,
              Boolean(options.fetch),
            );
          } catch {
            throw new OpenAiCallCreationError("provider call failed", callId);
          }
          if (!response.ok || !isBoundedSdpAnswer(answerSdp) || !callId) {
            throw new OpenAiCallCreationError("provider call failed", callId);
          }
          return { answerSdp, callId };
        });
      } catch (error) {
        if (error instanceof OpenAiCallCreationError) throw error;
        throw new OpenAiCallCreationError("provider call failed", callId);
      }
    },
    async closeCall(callId) {
      if (!isSafeCallId(callId)) return false;
      const location = `${OPENAI_CALLS_ORIGIN}/v1/realtime/calls/${callId}/hangup`;
      try {
        return await request(undefined, async (requestSignal) => {
          const response = await fetchImpl(location, {
            method: "POST",
            headers: { Authorization: `Bearer ${options.apiKey}` },
            signal: requestSignal,
          });
          return response.status >= 200 && response.status < 300;
        });
      } catch {
        return false;
      }
    },
  };
}

function isSafeCallId(callId: string): boolean {
  return /^rtc_[A-Za-z0-9_-]{1,128}$/.test(callId);
}

export function parseCallId(location: string | null): string | null {
  if (
    !location ||
    (location.startsWith("/") && location.startsWith("//")) ||
    (!location.startsWith("/") &&
      !location.startsWith("https://api.openai.com/"))
  ) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(location, OPENAI_CALLS_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== OPENAI_CALLS_ORIGIN || parsed.search || parsed.hash) {
    return null;
  }
  const match = CALL_LOCATION_PATTERN.exec(parsed.pathname);
  return match?.[1] ?? null;
}

async function readBoundedText(
  response: FetchResponseLike,
  signal: AbortSignal,
  allowInjectedTextFallback: boolean,
): Promise<string> {
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    const abortRead = () => {
      void reader.cancel("request aborted").catch(() => undefined);
    };
    signal.addEventListener("abort", abortRead, { once: true });
    try {
      while (true) {
        const chunk = await raceWithAbort(reader.read(), signal);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > POC_MAX_SDP_RESPONSE_BYTES) {
          void reader.cancel("response too large").catch(() => undefined);
          throw new Error("response too large");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      signal.removeEventListener("abort", abortRead);
      reader.releaseLock();
    }
  }
  if (!allowInjectedTextFallback || !response.text) {
    throw new Error("provider response body unavailable");
  }
  const text = await raceWithAbort(response.text(), signal);
  if (Buffer.byteLength(text, "utf8") > POC_MAX_SDP_RESPONSE_BYTES) {
    throw new Error("response too large");
  }
  return text;
}

async function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw new Error("request aborted");
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("request aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}
