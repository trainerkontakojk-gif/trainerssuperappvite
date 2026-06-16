import { describe, it, expect } from "vitest";
import { ApiError } from "../lib/api";
import { shouldLogKetikGenerationError } from "../routes/ketik/lib/ketik-error";

describe("shouldLogKetikGenerationError", () => {
  it("does not log expected AI errors", () => {
    const error = new ApiError("AI_ERROR", "API Key OpenRouter tidak valid.");
    expect(shouldLogKetikGenerationError(error)).toBe(false);
  });

  it("logs unexpected API errors", () => {
    const error = new ApiError("NOT_FOUND", "Data tidak ditemukan");
    expect(shouldLogKetikGenerationError(error)).toBe(true);
  });

  it("logs non-ApiError exceptions", () => {
    expect(shouldLogKetikGenerationError(new Error("Network error"))).toBe(true);
  });
});
