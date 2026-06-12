import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function mockLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
    },
    writable: true,
    configurable: true,
  });
}

describe("rpcFetch", () => {
  let rpcFetch: typeof import("../lib/api/rpc-client").rpcFetch;
  let rpcClient: typeof import("../lib/api/rpc-client").rpcClient;

  beforeEach(async () => {
    mockLocalStorage();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: "ok" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const mod = await import("../lib/api/rpc-client");
    rpcFetch = mod.rpcFetch;
    rpcClient = mod.rpcClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends Authorization Bearer header when token exists", async () => {
    localStorage.setItem("auth_token", "token-123");
    await rpcFetch("/api/v1/me");
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("does not send Authorization header when no token", async () => {
    await rpcFetch("/api/public");
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers.has("Authorization")).toBe(false);
  });

  it("adds X-Requested-With header", async () => {
    await rpcFetch("/api/v1/test");
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  });

  it("adds Content-Type when not present", async () => {
    await rpcFetch("/api/v1/test");
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers.get("Content-Type")).toBe("application/json");
  });

  it("builds the typed route from the API base path", async () => {
    await rpcClient.v1.me["access-status"].$get();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/me/access-status",
      expect.any(Object),
    );
  });

  it("preserves existing Content-Type header", async () => {
    await rpcFetch("/api/v1/test", {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers.get("Content-Type")).toBe("multipart/form-data");
  });

  it("throws Sesi telah berakhir on 401 and clears localStorage and redirects", async () => {
    localStorage.setItem("auth_token", "expired-token");
    localStorage.setItem("auth_profile", '{"name":"test"}');
    localStorage.setItem("trainers_login_time", "123");
    localStorage.setItem("trainers_last_activity", "456");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { message: "Unauthorized" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Replace window.location with a mock that tracks href set
    const origLocation = window.location;
    const hrefSetter = vi.fn();
    delete (window as any).location;
    (window as any).location = { ...origLocation, get href() { return origLocation.href; }, set href(v: string) { hrefSetter(v); } };

    await expect(rpcFetch("/api/v1/protected")).rejects.toThrow("Sesi telah berakhir");

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("auth_profile")).toBeNull();
    expect(localStorage.getItem("trainers_login_time")).toBeNull();
    expect(localStorage.getItem("trainers_last_activity")).toBeNull();
    expect(hrefSetter).toHaveBeenCalledWith("/");

    // Restore
    (window as any).location = origLocation;
  });

  it("throws descriptive error on HTML response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!DOCTYPE html><html>...", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );

    await expect(rpcFetch("/api/v1/unknown")).rejects.toThrow("API tidak tersedia");
  });

  it("passes through successful JSON responses", async () => {
    const res = await rpcFetch("/api/v1/me");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: "ok" });
  });

  it("passes through non-401 error responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { message: "Not found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await rpcFetch("/api/v1/not-found");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
