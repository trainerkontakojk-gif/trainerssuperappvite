import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTelefunProviderReadiness } from "../routes/telefun/hooks/useTelefunProviderReadiness";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function healthResponse(ready: boolean) {
  return new Response(
    JSON.stringify({
      readiness: {
        providers: {
          openai: {
            enabled: ready,
            configured: ready,
            ready,
          },
        },
      },
    }),
    { status: 200 },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTelefunProviderReadiness", () => {
  it("moves from loading to ready only after a valid health response", async () => {
    const fetchImpl = vi.fn(async () => healthResponse(true));
    const { result } = renderHook(() =>
      useTelefunProviderReadiness(true, {
        websocketUrl: "wss://telefun.example/ws",
        fetchImpl,
      }),
    );

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.openai).toEqual({
      enabled: true,
      configured: true,
      ready: true,
    });
  });

  it("fails closed when health is malformed or OpenAI is not fully ready", async () => {
    const malformed = vi.fn(async () => new Response("{}", { status: 200 }));
    const { result, rerender } = renderHook(
      ({ fetchImpl }) =>
        useTelefunProviderReadiness(true, {
          websocketUrl: "wss://telefun.example/ws",
          fetchImpl,
        }),
      { initialProps: { fetchImpl: malformed as typeof fetch } },
    );

    await waitFor(() => expect(result.current.status).toBe("unavailable"));

    const disabled = vi.fn(async () => healthResponse(false));
    rerender({ fetchImpl: disabled as typeof fetch });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.openai).toEqual({
      enabled: false,
      configured: false,
      ready: false,
    });
  });

  it("aborts on close and ignores a stale response after reopen", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetchImpl = vi
      .fn((_input: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        return oldRequest.promise;
      })
      .mockImplementationOnce((_input, init) => {
        signals.push(init?.signal as AbortSignal);
        return oldRequest.promise;
      })
      .mockImplementationOnce((_input, init) => {
        signals.push(init?.signal as AbortSignal);
        return newRequest.promise;
      });

    const { result, rerender } = renderHook(
      ({ active }) =>
        useTelefunProviderReadiness(active, {
          websocketUrl: "wss://telefun.example/ws",
          fetchImpl: fetchImpl as typeof fetch,
        }),
      { initialProps: { active: true } },
    );

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    expect(signals[0].aborted).toBe(true);

    rerender({ active: true });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    await act(async () => {
      newRequest.resolve(healthResponse(true));
      await newRequest.promise;
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      oldRequest.resolve(healthResponse(false));
      await oldRequest.promise;
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.openai?.ready).toBe(true);
  });
});
