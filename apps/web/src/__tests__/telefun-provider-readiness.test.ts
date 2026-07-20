import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveTelefunHealthUrl,
  fetchTelefunOpenAIReadiness,
  parseTelefunOpenAIReadiness,
} from "../routes/telefun/services/telefunProviderReadiness";

function readyPayload() {
  return {
    status: "ok",
    readiness: {
      providers: {
        openai: { enabled: true, configured: true, ready: true },
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Telefun provider readiness service", () => {
  it("derives a secret-free HTTP health URL from the WebSocket origin", () => {
    expect(
      deriveTelefunHealthUrl(
        "wss://user:password@telefun.example/ws/session-123?token=secret#fragment",
      ),
    ).toBe("https://telefun.example/health");
    expect(deriveTelefunHealthUrl("ws://localhost:3002/ws")).toBe(
      "http://localhost:3002/health",
    );
  });

  it("rejects missing, malformed, and non-WebSocket configuration", () => {
    for (const value of [undefined, "", "https://telefun.example/ws", "nope"]) {
      expect(() => deriveTelefunHealthUrl(value)).toThrow();
    }
  });

  it("strictly extracts only boolean OpenAI readiness fields", () => {
    expect(parseTelefunOpenAIReadiness(readyPayload())).toEqual({
      enabled: true,
      configured: true,
      ready: true,
    });

    for (const value of [
      null,
      {},
      { readiness: {} },
      { readiness: { providers: { openai: { ready: true } } } },
      {
        readiness: {
          providers: {
            openai: { enabled: "true", configured: true, ready: true },
          },
        },
      },
    ]) {
      expect(() => parseTelefunOpenAIReadiness(value)).toThrow();
    }
  });

  it("fetches readiness without auth headers or browser credentials", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify(readyPayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      fetchTelefunOpenAIReadiness({
        websocketUrl: "wss://telefun.example/ws?access_token=secret",
        fetchImpl,
      }),
    ).resolves.toEqual({ enabled: true, configured: true, ready: true });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://telefun.example/health",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls[0])).not.toContain("secret");
    expect(JSON.stringify(fetchImpl.mock.calls[0])).not.toContain(
      "Authorization",
    );
  });

  it("rejects non-2xx and malformed health responses", async () => {
    const non2xx = vi.fn(async () => new Response("no", { status: 503 }));
    const malformed = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ readiness: { providers: {} } }), {
          status: 200,
        }),
      ),
    );

    await expect(
      fetchTelefunOpenAIReadiness({
        websocketUrl: "wss://telefun.example/ws",
        fetchImpl: non2xx,
      }),
    ).rejects.toThrow("Telefun health request failed");
    await expect(
      fetchTelefunOpenAIReadiness({
        websocketUrl: "wss://telefun.example/ws",
        fetchImpl: malformed,
      }),
    ).rejects.toThrow("Telefun health response is invalid");
  });

  it("aborts a request at the bounded timeout", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const request = fetchTelefunOpenAIReadiness({
      websocketUrl: "wss://telefun.example/ws",
      fetchImpl,
      timeoutMs: 500,
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(observedSignal?.aborted).toBe(true);
    await rejection;
  });

  it("propagates an external abort to the health request", async () => {
    const external = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const request = fetchTelefunOpenAIReadiness({
      websocketUrl: "wss://telefun.example/ws",
      fetchImpl,
      signal: external.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    external.abort();

    expect(observedSignal?.aborted).toBe(true);
    await rejection;
  });
});
