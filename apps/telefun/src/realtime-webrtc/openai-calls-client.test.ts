import { describe, expect, it, vi } from "vitest";
import { buildCanonicalPocSession } from "./contracts.js";
import {
  createOpenAiCallsClient,
  OpenAiCallCreationError,
} from "./openai-calls-client.js";

const OFFER = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n";
const ANSWER = "v=0\r\no=- 2 2 IN IP4 0.0.0.0\r\ns=-\r\n";

function response(body: string, location: string, ok = true) {
  return {
    ok,
    status: ok ? 201 : 400,
    headers: new Headers({ Location: location }),
    text: vi.fn(async () => body),
  };
}

function streamedResponse(body: ReadableStream<Uint8Array>, location: string) {
  return {
    ok: true,
    status: 201,
    headers: new Headers({ Location: location }),
    body,
  };
}

describe("OpenAI unified calls client", () => {
  it("uses the documented POST hangup endpoint without a request body", async () => {
    const fetch = vi.fn(
      async (_url: string, _init: { method: "POST"; headers: Record<string, string>; signal?: AbortSignal }) =>
        response("", ""),
    );
    const client = createOpenAiCallsClient({ apiKey: "server-secret", fetch });

    await expect(client.closeCall?.("rtc_fake_123")).resolves.toBe(true);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls/rtc_fake_123/hangup");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Authorization: "Bearer server-secret" });
    expect(init).not.toHaveProperty("body");
  });

  it("returns false when the provider does not acknowledge hangup", async () => {
    const fetch = vi.fn(async () => response("", "", false));
    const client = createOpenAiCallsClient({ apiKey: "server-secret", fetch });

    await expect(client.closeCall?.("rtc_fake_123")).resolves.toBe(false);
  });

  it("does not fetch for an unsafe hangup call ID", async () => {
    const fetch = vi.fn(async () => response("", ""));
    const client = createOpenAiCallsClient({ apiKey: "server-secret", fetch });

    await client.closeCall?.("rtc_bad/../../exfiltrate");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends raw SDP plus server-owned JSON session and returns only validated data", async () => {
    const fetch = vi.fn(
      async (
        _url: string,
        _init: { method: "POST"; headers: Record<string, string>; body?: FormData; signal?: AbortSignal },
      ) => response(ANSWER, "/v1/realtime/calls/rtc_fake_123"),
    );
    const client = createOpenAiCallsClient({
      apiKey: "server-secret",
      fetch,
    });

    await expect(
      client.createCall({ offerSdp: OFFER, session: buildCanonicalPocSession() }),
    ).resolves.toEqual({ answerSdp: ANSWER, callId: "rtc_fake_123" });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Authorization: "Bearer server-secret" });
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get("sdp")).toBe(OFFER);
    expect(JSON.parse(String(form.get("session")))).toEqual(
      buildCanonicalPocSession(),
    );
    expect(JSON.stringify(init)).not.toContain("rtc_fake_123");
  });

  it("rejects an oversized serialized session before creating FormData or fetching", async () => {
    const fetch = vi.fn(async () => response(ANSWER, "/v1/realtime/calls/rtc_never"));
    const client = createOpenAiCallsClient({
      apiKey: "server-secret",
      fetch,
    });
    const session = {
      ...buildCanonicalPocSession(),
      instructions: "x".repeat(70_000),
    };

    await expect(client.createCall({ offerSdp: OFFER, session })).rejects.toThrow(
      "provider call failed",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts a provider fetch that never resolves", async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      const fetch = vi.fn(
        async (_url: string, init: { signal?: AbortSignal }) => {
          observedSignal = init.signal;
          return await new Promise<never>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        },
      );
      const client = createOpenAiCallsClient({ apiKey: "server-secret", fetch, timeoutMs: 25 });
      const pending = client.createCall({ offerSdp: OFFER, session: buildCanonicalPocSession() });
      const assertion = expect(pending).rejects.toThrow("provider call failed");
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(observedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts and cancels a provider response whose SDP stream never resolves", async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => undefined);
        },
        cancel() {
          cancelled = true;
        },
      });
      const client = createOpenAiCallsClient({
        apiKey: "server-secret",
        timeoutMs: 25,
        fetch: vi.fn(async () => streamedResponse(body, "/v1/realtime/calls/rtc_hanging")),
      });

      const pending = client.createCall({ offerSdp: OFFER, session: buildCanonicalPocSession() });
      const assertion = expect(pending).rejects.toThrow("provider call failed");
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains the validated call ID when the SDP body hangs", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(ANSWER) })
      .mockImplementation(() => new Promise<never>(() => undefined));
    const cancel = vi.fn(async () => undefined);
    const body = {
      getReader: () => ({ read, cancel, releaseLock: vi.fn() }),
    } as unknown as ReadableStream<Uint8Array>;
    const client = createOpenAiCallsClient({
      apiKey: "server-secret",
      timeoutMs: 25,
      fetch: vi.fn(async () => streamedResponse(body, "/v1/realtime/calls/rtc_body_timeout")),
    });

    const error = await client
      .createCall({ offerSdp: OFFER, session: buildCanonicalPocSession() })
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(OpenAiCallCreationError);
    expect(error).toMatchObject({ callId: "rtc_body_timeout" });
    expect(cancel).toHaveBeenCalled();
  });

  it("stops reading an oversized streaming answer", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n"));
        controller.enqueue(new Uint8Array(512 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const client = createOpenAiCallsClient({
      apiKey: "server-secret",
      fetch: vi.fn(async () => streamedResponse(body, "/v1/realtime/calls/rtc_large")),
    });

    await expect(
      client.createCall({ offerSdp: OFFER, session: buildCanonicalPocSession() }),
    ).rejects.toThrow("provider call failed");
    expect(cancelled).toBe(true);
  });

  it("rejects an answer or Location outside the fixed provider contract", async () => {
    const badAnswer = createOpenAiCallsClient({
      apiKey: "server-secret",
      fetch: vi.fn(
        async (
          _url: string,
          _init: { method: "POST"; headers: Record<string, string>; body?: FormData; signal?: AbortSignal },
        ) => response("not sdp", "/v1/realtime/calls/rtc_fake_123"),
      ),
    });
    await expect(
      badAnswer.createCall({ offerSdp: OFFER, session: buildCanonicalPocSession() }),
    ).rejects.toThrow("provider call failed");

    const badLocation = createOpenAiCallsClient({
      apiKey: "server-secret",
      fetch: vi.fn(
        async (
          _url: string,
          _init: { method: "POST"; headers: Record<string, string>; body?: FormData; signal?: AbortSignal },
        ) => response(ANSWER, "https://evil.example/v1/realtime/calls/rtc_fake_123"),
      ),
    });
    await expect(
      badLocation.createCall({ offerSdp: OFFER, session: buildCanonicalPocSession() }),
    ).rejects.toThrow("provider call failed");
  });
});
