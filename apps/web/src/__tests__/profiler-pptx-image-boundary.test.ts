import { describe, expect, it } from "vitest";
import {
  isSupportedProfilerPptxPhoto,
  sanitizeProfilerPptxImageData,
} from "../routes/profiler/utils/profilerPptxImageBoundary";

describe("Profiler PPTX image boundary", () => {
  it("accepts only bounded PNG/JPEG/GIF/SVG data URLs", () => {
    expect(isSupportedProfilerPptxPhoto("data:image/png;base64,AAAA")).toBe(
      true,
    );
    expect(isSupportedProfilerPptxPhoto("data:image/jpeg;base64,AAAA")).toBe(
      true,
    );
    expect(isSupportedProfilerPptxPhoto("data:image/gif;base64,AAAA")).toBe(
      true,
    );
    expect(
      isSupportedProfilerPptxPhoto(
        "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLz4=",
      ),
    ).toBe(true);
  });

  it("rejects advisory-affected and unknown image formats before pptxgenjs", () => {
    for (const value of [
      "data:image/icns;base64,AAAA",
      "data:image/jxl;base64,AAAA",
      "data:image/heif;base64,AAAA",
      "data:image/heic;base64,AAAA",
      "data:application/octet-stream;base64,AAAA",
    ]) {
      expect(isSupportedProfilerPptxPhoto(value)).toBe(false);
      expect(sanitizeProfilerPptxImageData(value)).toBeNull();
    }
  });

  it("rejects remote paths and oversized data URLs", () => {
    expect(isSupportedProfilerPptxPhoto("https://example.com/photo.png")).toBe(
      false,
    );
    expect(
      isSupportedProfilerPptxPhoto(
        `data:image/png;base64,${"A".repeat(8 * 1024 * 1024)}`,
      ),
    ).toBe(false);
  });
});
