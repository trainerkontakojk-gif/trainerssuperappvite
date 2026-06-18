import { vi, describe, expect, it } from "vitest";

// Mock env module before importing usage
vi.mock("../env", () => ({
  env: {
    PORT: 3002,
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    GEMINI_API_KEY: "test-gemini-key",
    ALLOWED_ORIGINS: "*",
    NODE_ENV: "development",
  },
}));

import {
  parseUsageMetadata,
  mergeSnapshot,
  type LiveUsageSnapshot,
} from "../usage";

// ── parseUsageMetadata — modality breakdown ──────────────

describe("parseUsageMetadata — modality breakdown", () => {
  it("returns text/audio breakdown from promptTokensDetails and responseTokensDetails", () => {
    const raw = {
      promptTokenCount: 1500,
      promptTokensDetails: [
        { modality: "TEXT", tokenCount: 500 },
        { modality: "AUDIO", tokenCount: 1000 },
      ],
      responseTokenCount: 800,
      responseTokensDetails: [
        { modality: "TEXT", tokenCount: 200 },
        { modality: "AUDIO", tokenCount: 600 },
      ],
      totalTokenCount: 2300,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.promptTokenCount).toBe(1500);
    expect(snapshot!.responseTokenCount).toBe(800);
    expect(snapshot!.totalTokenCount).toBe(2300);
    expect(snapshot!.promptModality).toEqual({ text: 500, audio: 1000 });
    expect(snapshot!.responseModality).toEqual({ text: 200, audio: 600 });
  });

  it("returns undefined modality when sum does not match total", () => {
    const raw = {
      promptTokenCount: 2000,
      promptTokensDetails: [
        { modality: "TEXT", tokenCount: 500 },
        { modality: "AUDIO", tokenCount: 1000 },
      ],
      totalTokenCount: 2000,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    // 500 + 1000 = 1500 ≠ 2000, so promptModality should be undefined
    expect(snapshot!.promptModality).toBeUndefined();
  });

  it("returns undefined modality when no details array", () => {
    const raw = {
      promptTokenCount: 100,
      responseTokenCount: 50,
      totalTokenCount: 150,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.promptModality).toBeUndefined();
    expect(snapshot!.responseModality).toBeUndefined();
  });

  it("handles case-insensitive modality strings", () => {
    const raw = {
      promptTokenCount: 300,
      promptTokensDetails: [
        { modality: "text", tokenCount: 100 },
        { modality: "Audio", tokenCount: 200 },
      ],
      totalTokenCount: 300,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.promptModality).toEqual({ text: 100, audio: 200 });
  });

  it("returns null for empty/invalid input", () => {
    expect(parseUsageMetadata(null)).toBeNull();
    expect(parseUsageMetadata(undefined)).toBeNull();
    expect(parseUsageMetadata("string")).toBeNull();
    expect(parseUsageMetadata({})).toBeNull();
  });
});

// ── mergeSnapshot — modality merge ───────────────────────

describe("mergeSnapshot — modality merge", () => {
  it("merges modality breakdowns using Math.max", () => {
    const prev: LiveUsageSnapshot = {
      promptTokenCount: 1000,
      responseTokenCount: 500,
      totalTokenCount: 1500,
      promptModality: { text: 300, audio: 700 },
      responseModality: { text: 100, audio: 400 },
    };

    const next: LiveUsageSnapshot = {
      promptTokenCount: 1500,
      responseTokenCount: 800,
      totalTokenCount: 2300,
      promptModality: { text: 500, audio: 1000 },
      responseModality: { text: 200, audio: 600 },
    };

    const merged = mergeSnapshot(prev, next);
    expect(merged.promptTokenCount).toBe(1500);
    expect(merged.responseTokenCount).toBe(800);
    expect(merged.promptModality).toEqual({ text: 500, audio: 1000 });
    expect(merged.responseModality).toEqual({ text: 200, audio: 600 });
  });

  it("keeps prev modality when next has no modality", () => {
    const prev: LiveUsageSnapshot = {
      promptTokenCount: 1000,
      responseTokenCount: 500,
      totalTokenCount: 1500,
      promptModality: { text: 300, audio: 700 },
      responseModality: { text: 100, audio: 400 },
    };

    const next: LiveUsageSnapshot = {
      promptTokenCount: 1500,
      responseTokenCount: 800,
      totalTokenCount: 2300,
    };

    const merged = mergeSnapshot(prev, next);
    expect(merged.promptModality).toEqual({ text: 300, audio: 700 });
    expect(merged.responseModality).toEqual({ text: 100, audio: 400 });
  });

  it("uses next modality when prev has no modality", () => {
    const prev: LiveUsageSnapshot = {
      promptTokenCount: 1000,
      responseTokenCount: 500,
      totalTokenCount: 1500,
    };

    const next: LiveUsageSnapshot = {
      promptTokenCount: 1500,
      responseTokenCount: 800,
      totalTokenCount: 2300,
      promptModality: { text: 500, audio: 1000 },
      responseModality: { text: 200, audio: 600 },
    };

    const merged = mergeSnapshot(prev, next);
    expect(merged.promptModality).toEqual({ text: 500, audio: 1000 });
    expect(merged.responseModality).toEqual({ text: 200, audio: 600 });
  });

  it("returns next when prev is null", () => {
    const next: LiveUsageSnapshot = {
      promptTokenCount: 1500,
      responseTokenCount: 800,
      totalTokenCount: 2300,
      promptModality: { text: 500, audio: 1000 },
    };

    const merged = mergeSnapshot(null, next);
    expect(merged).toBe(next);
  });
});
