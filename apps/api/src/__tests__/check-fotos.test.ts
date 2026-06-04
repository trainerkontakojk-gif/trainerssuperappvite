import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkFotoUrl } from "../../../../scripts/data-integrity-checker";

/**
 * Unit tests for check-fotos sub-command
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 *
 * Tests the checkFotoUrl function which verifies foto_url references
 * against Supabase Storage via HEAD requests.
 */

describe("checkFotoUrl", () => {
  const SUPABASE_URL = "https://test-project.supabase.co";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "valid" when HEAD request returns 200', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkFotoUrl(SUPABASE_URL, "avatar-123.jpg");

    expect(result).toEqual({ status: "valid" });
    expect(mockFetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/storage/v1/object/public/profiler-foto/avatar-123.jpg`,
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it('returns "broken" when HEAD request returns 404', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkFotoUrl(SUPABASE_URL, "nonexistent.png");

    expect(result).toEqual({ status: "broken" });
  });

  it('returns "broken" for other 4xx errors (e.g., 403)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkFotoUrl(SUPABASE_URL, "forbidden.png");

    expect(result).toEqual({ status: "broken" });
  });

  it('returns "unverified" with reason when HEAD request returns 5xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkFotoUrl(SUPABASE_URL, "server-error.png");

    expect(result).toEqual({ status: "unverified", reason: "HTTP 502" });
  });

  it('returns "unverified" with reason when HEAD request returns 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkFotoUrl(SUPABASE_URL, "internal-error.png");

    expect(result).toEqual({ status: "unverified", reason: "HTTP 500" });
  });

  it('returns "unverified" with "timeout" reason when request is aborted', async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkFotoUrl(SUPABASE_URL, "slow-response.png");

    expect(result).toEqual({ status: "unverified", reason: "timeout" });
  });

  it('returns "unverified" with network error reason when fetch fails', async () => {
    const networkError = new Error("ECONNREFUSED");
    const mockFetch = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkFotoUrl(SUPABASE_URL, "unreachable.png");

    expect(result).toEqual({ status: "unverified", reason: "ECONNREFUSED" });
  });

  it("constructs the correct storage URL from supabaseUrl and fotoUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", mockFetch);

    await checkFotoUrl(SUPABASE_URL, "path/to/avatar.webp");

    expect(mockFetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/storage/v1/object/public/profiler-foto/path/to/avatar.webp`,
      expect.objectContaining({
        method: "HEAD",
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
