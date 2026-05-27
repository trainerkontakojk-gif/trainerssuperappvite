import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }),
  },
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }),
  }),
  createUserClient: vi.fn(),
}));

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn(),
}));

vi.mock("../lib/openrouter", () => ({
  generateOpenRouterContent: vi.fn(),
}));

import { extractJsonObjectText } from "../services/ketik-service";

describe("extractJsonObjectText", () => {
  it("returns plain JSON as-is", () => {
    const input = '{"scores":{"final":85}}';
    expect(extractJsonObjectText(input)).toBe(input);
  });

  it("strips ```json fenced block", () => {
    const input = '```json\n{"scores":{"final":85}}\n```';
    expect(extractJsonObjectText(input)).toBe('{"scores":{"final":85}}');
  });

  it("strips ``` fenced block without language tag", () => {
    const input = '```\n{"scores":{"final":85}}\n```';
    expect(extractJsonObjectText(input)).toBe('{"scores":{"final":85}}');
  });

  it("extracts JSON from text with leading content", () => {
    const input = 'Here is the JSON output: {"scores":{"final":85}}';
    expect(extractJsonObjectText(input)).toBe('{"scores":{"final":85}}');
  });

  it("extracts JSON from text with trailing content", () => {
    const input = '{"scores":{"final":85}} and that is the result.';
    expect(extractJsonObjectText(input)).toBe('{"scores":{"final":85}}');
  });

  it("extracts JSON from text with content on both sides", () => {
    const input = 'Here is the JSON: {"scores":{"final":85}} end of output.';
    expect(extractJsonObjectText(input)).toBe('{"scores":{"final":85}}');
  });

  it("handles embedded newlines inside JSON", () => {
    const input = '```json\n{\n  "scores": {\n    "final": 85\n  }\n}\n```';
    const result = extractJsonObjectText(input);
    expect(JSON.parse(result)).toEqual({ scores: { final: 85 } });
  });

  it("returns original string when no braces found", () => {
    const input = "no json here";
    expect(extractJsonObjectText(input)).toBe("no json here");
  });

  it("handles whitespace-only input", () => {
    expect(extractJsonObjectText("   ")).toBe("");
  });

  it("handles fenced block with whitespace variation", () => {
    const input = '```JSON\n  {"scores":{"final":85}}  \n```';
    expect(extractJsonObjectText(input)).toBe('{"scores":{"final":85}}');
  });

  it("extracts nested JSON object correctly", () => {
    const input = `\`\`\`json
{
  "summary": "Ringkasan percakapan",
  "strengths": ["Good probing"],
  "weaknesses": ["Need better empathy"],
  "coachingFocus": ["Focus on clarity"],
  "scores": {
    "final": 85,
    "empathy": 90,
    "probing": 80,
    "typo": 85,
    "compliance": 85
  },
  "typos": [
    {"messageId": "m1", "originalWord": "teh", "correctedWord": "the", "severity": "minor"}
  ]
}
\`\`\``;
    const extracted = extractJsonObjectText(input);
    const parsed = JSON.parse(extracted);
    expect(parsed.summary).toBe("Ringkasan percakapan");
    expect(parsed.scores.final).toBe(85);
    expect(parsed.typos).toHaveLength(1);
  });
});
