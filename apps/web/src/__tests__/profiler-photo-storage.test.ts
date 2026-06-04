import { describe, expect, it, vi } from "vitest";
import { buildProfilerPhotoPath, uploadProfilerPhoto } from "../lib/profilerPhotoStorage";

const { mockUpload, mockGetPublicUrl, mockFrom } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
  mockFrom: vi.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { storage: { from: mockFrom } },
}));

describe("profilerPhotoStorage", () => {
  it("uploads trainer photo to profiler-foto with a unique peserta folder path", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1770000000000);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-0000-0000-000000000000");
    mockUpload.mockResolvedValue({ data: { path: "peserta-1/1770000000000-00000000-0000-0000-0000-000000000000.jpg" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/profiler-foto/peserta-1/1770000000000-00000000-0000-0000-0000-000000000000.jpg" },
    });

    const file = new File(["x"], "Agent Photo.JPG", { type: "image/jpeg" });
    const url = await uploadProfilerPhoto(file, "peserta-1");

    expect(mockFrom).toHaveBeenCalledWith("profiler-foto");
    expect(mockUpload).toHaveBeenCalledWith("peserta-1/1770000000000-00000000-0000-0000-0000-000000000000.jpg", file, {
      upsert: false,
      contentType: "image/jpeg",
    });
    expect(url).toContain("/profiler-foto/peserta-1/");
  });

  it("normalizes unknown extensions to jpg", () => {
    expect(buildProfilerPhotoPath("peserta-1", "avatar.!!!")).toMatch(/^peserta-1\/\d+-[a-zA-Z0-9-]+\.jpg$/);
  });
});
