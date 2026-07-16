import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useApi, fetchApi } from "../hooks/useApi";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function apiResponse<T>(data: T) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" },
  });
}

function mockLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
    },
    writable: true,
    configurable: true,
  });
}

describe("useApi", () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: [{ id: "1", name: "Test" }] }),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns data after fetch", async () => {
    const { result } = renderHook(() => useApi<any[]>("/test"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: "1", name: "Test" }]);
    expect(result.current.error).toBeNull();
  });

  it("returns null data when path is null", () => {
    const { result } = renderHook(() => useApi<any[]>(null));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("clears retained state when the path becomes null", async () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useApi<any[]>(path),
      { initialProps: { path: "/test" as string | null } },
    );
    await waitFor(() => expect(result.current.data).toBeTruthy());

    rerender({ path: null });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets error on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: "Not found" } }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const { result } = renderHook(() => useApi<any[]>("/not-found"));
    await waitFor(() => expect(result.current.error).toBe("Not found"));
    expect(result.current.data).toBeNull();
  });

  it("refetch works", async () => {
    const { result } = renderHook(() => useApi<any[]>("/test"));
    await waitFor(() => expect(result.current.data).toBeTruthy());

    vi.mocked(globalThis.fetch).mockReset();
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [{ id: "2" }] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toEqual([{ id: "2" }]));
  });

  it("ignores a stale success after a newer path request starts", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    vi.mocked(globalThis.fetch)
      .mockReset()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);

    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useApi<Array<{ id: string }>>(path),
      { initialProps: { path: "/old" } },
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    rerender({ path: "/new" });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      oldRequest.resolve(apiResponse([{ id: "old" }]));
      await oldRequest.promise;
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      newRequest.resolve(apiResponse([{ id: "new" }]));
      await newRequest.promise;
    });

    expect(result.current.data).toEqual([{ id: "new" }]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("ignores a stale failure after the current path succeeds", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    vi.mocked(globalThis.fetch)
      .mockReset()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);

    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useApi<Array<{ id: string }>>(path),
      { initialProps: { path: "/old" } },
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    rerender({ path: "/new" });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      newRequest.resolve(apiResponse([{ id: "new" }]));
      await newRequest.promise;
    });
    expect(result.current.data).toEqual([{ id: "new" }]);

    await act(async () => {
      oldRequest.reject(new Error("Old request failed"));
      await oldRequest.promise.catch(() => undefined);
    });

    expect(result.current.data).toEqual([{ id: "new" }]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("manual refetch invalidates an earlier request for the same path", async () => {
    const oldRequest = deferred<Response>();
    const refetchRequest = deferred<Response>();
    vi.mocked(globalThis.fetch)
      .mockReset()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => refetchRequest.promise);

    const { result } = renderHook(() =>
      useApi<Array<{ id: string }>>("/test"),
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    let refetchPromise!: Promise<void>;
    act(() => {
      refetchPromise = result.current.refetch();
    });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      refetchRequest.resolve(apiResponse([{ id: "refetch" }]));
      await refetchPromise;
    });

    await act(async () => {
      oldRequest.resolve(apiResponse([{ id: "old" }]));
      await oldRequest.promise;
    });

    expect(result.current.data).toEqual([{ id: "refetch" }]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("fetchApi auth header", () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: "ok" }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends Authorization Bearer header when token exists", async () => {
    localStorage.setItem("auth_token", "test-token-123");
    await fetchApi("/protected");
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const calledOptions = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(calledOptions.headers.Authorization).toBe("Bearer test-token-123");
    expect(calledUrl).toContain("/protected");
  });

  it("does not send Authorization header when no token exists", async () => {
    localStorage.removeItem("auth_token");
    await fetchApi("/public");
    const calledOptions = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(calledOptions.headers.Authorization).toBeUndefined();
  });
});

describe("fetchApi SPA fallback detection", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws descriptive error when API returns HTML (SPA fallback)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!DOCTYPE html><html>...</html>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    await expect(fetchApi("/missing-endpoint")).rejects.toThrow(
      "API tidak tersedia",
    );
  });

  it("throws descriptive error when API returns HTML with SPA index fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '<html lang="id"><head><title>Trainers SuperApp</title></head><body><div id="root"></div></body></html>',
        { headers: { "content-type": "text/html" } },
      ),
    );
    await expect(fetchApi("/v1/sidak/dashboard")).rejects.toThrow(
      "VITE_API_URL",
    );
  });

  it("still handles normal JSON error responses correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: "Not found" } }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    await expect(fetchApi("/not-found")).rejects.toThrow("Not found");
  });
});
