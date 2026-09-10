import { describe, expect, it, vi } from "vitest";

describe("simulation subject RPC route", () => {
  it("requests participant options through the profiler route", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { profilerSubjectClient } = await import("@/lib/api/rpc-client");
    await profilerSubjectClient.peserta.options.$get({
      query: { search: "Ferry" },
    });

    const [input] = fetchMock.mock.calls[0] ?? [];
    const requestUrl =
      input instanceof Request ? input.url : String(input ?? "");
    const url = new URL(requestUrl, window.location.origin);

    expect(url.pathname).toBe("/api/v1/profiler/peserta/options");
    expect(url.searchParams.get("search")).toBe("Ferry");
  });
});
