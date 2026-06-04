import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { checkProfilerPhotoUrl, extractProfilerPhotoPath } from "../services/profiler-photo-storage";

describe("profiler-photo-storage", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("extracts path from canonical profiler-foto public URL", () => {
    expect(
      extractProfilerPhotoPath("https://project.supabase.co/storage/v1/object/public/profiler-foto/peserta-1/avatar.jpg"),
    ).toBe("peserta-1/avatar.jpg");
  });

  it("checks canonical profiler-foto URL via HEAD", async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 200 } as Response);

    await expect(
      checkProfilerPhotoUrl("https://project.supabase.co/storage/v1/object/public/profiler-foto/peserta-1/avatar.jpg"),
    ).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/storage/v1/object/public/profiler-foto/peserta-1/avatar.jpg",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("keeps legacy foto-avatar URLs checkable during migration", async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 200 } as Response);

    await expect(
      checkProfilerPhotoUrl("https://project.supabase.co/storage/v1/object/public/foto-avatar/peserta-1/avatar.jpg"),
    ).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/storage/v1/object/public/foto-avatar/peserta-1/avatar.jpg",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("returns false for missing canonical photo", async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 404 } as Response);

    await expect(checkProfilerPhotoUrl("peserta-1/missing.jpg")).resolves.toBe(false);
  });
});
