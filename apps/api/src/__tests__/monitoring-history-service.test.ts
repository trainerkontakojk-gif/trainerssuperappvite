import { describe, it, expect, vi } from "vitest";

const mockTelefunHistoryData = [
  {
    id: "tf-1",
    user_id: "user-a",
    created_at: "2026-05-23T11:00:00Z",
    scenario_title: "Tagihan Kartu Kredit",
    duration_seconds: 180,
    recording_path: "https://storage.example.com/rec.mp3",
    score: 8.5,
    voice_assessment: {
      overallScore: 8.5,
      speakingRate: { wordsPerMinute: 140 },
    },
    ai_summary: "Ringkasan AI",
    strengths: ["Kuat"],
    weaknesses: ["Lemah"],
  },
];

const mockKetikData: any[] = [];
const mockPdktData: any[] = [];
const mockTelefunResultsData: any[] = [];
const mockProfiles = [{ id: "user-a", email: "a@test.com", role: "agent" }];

// Spy: capture what columns the service selects from history tables
let capturedKetikSelect: string | null = null;
let capturedKetikOrder: string | null = null;
let capturedTelefunSelect: string | null = null;
let capturedTelefunOrder: string | null = null;
const sourceErrors = new Map<string, number>();

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: (cols: string) => {
          if (table === "ketik_history") capturedKetikSelect = cols;
          if (table === "telefun_history") capturedTelefunSelect = cols;
          return chain;
        },
        order: (col: string, _opts?: any) => {
          if (table === "ketik_history" && !capturedKetikOrder) capturedKetikOrder = col;
          if (table === "telefun_history" && !capturedTelefunOrder) capturedTelefunOrder = col;
          return chain;
        },
        limit: () => chain,
        range: (from: number, to: number) => {
          chain.rangeFrom = from;
          chain.rangeTo = to;
          return chain;
        },
        eq: () => chain,
        in: () => chain,
        rangeFrom: 0,
        rangeTo: 199,
        then: (resolve: any) => {
          const rows = table === "ketik_history" ? mockKetikData
            : table === "pdkt_history" ? mockPdktData
            : table === "telefun_history" ? mockTelefunHistoryData
            : table === "results" ? mockTelefunResultsData
            : table === "profiles" ? mockProfiles
            : [];
          const errorAt = sourceErrors.get(table);
          resolve(errorAt === chain.rangeFrom
            ? { data: null, error: { message: `page ${chain.rangeFrom} failed` } }
            : { data: rows.slice(chain.rangeFrom, chain.rangeTo + 1), error: null });
        },
      };
      return chain;
    },
  }),
}));

import {
  getMonitoringHistory,
  normalizePdktConfig,
  normalizePdktEvaluation,
  normalizePdktEmails,
  normalizeTelefunAssessmentWithHold,
} from "../services/monitoring-history-service";

describe("getMonitoringHistory — Telefun schema alignment", () => {
  it("selects Vite schema columns from telefun_history (not legacy aliases)", async () => {
    await getMonitoringHistory();

    expect(capturedKetikSelect).not.toBeNull();
    expect(capturedKetikSelect).toContain("simulation_duration");
    expect(capturedKetikSelect).toContain("resolution_score");
    expect(capturedKetikSelect).toContain("consumer_phone");
    expect(capturedKetikSelect).toContain("consumer_city");

    expect(capturedTelefunSelect).not.toBeNull();
    expect(capturedTelefunSelect).toContain("created_at");
    expect(capturedTelefunSelect).toContain("duration_seconds");
    expect(capturedTelefunSelect).toContain("recording_path");
    expect(capturedTelefunSelect).toContain("consumer_phone");
    expect(capturedTelefunSelect).toContain("consumer_city");

    expect(capturedTelefunSelect).not.toMatch(/\bdate\b/);
    expect(capturedTelefunSelect).not.toMatch(/\bduration\b/);
    expect(capturedTelefunSelect).not.toMatch(/\brecording_url\b/);
  });

  it("orders telefun_history by created_at (not date)", async () => {
    await getMonitoringHistory();

    expect(capturedKetikOrder).toBe("date");
    expect(capturedTelefunOrder).toBe("created_at");
    expect(capturedTelefunOrder).not.toBe("date");
  });

  it("maps telefun_history row fields to unified entry correctly", async () => {
    const result = await getMonitoringHistory();
    const tf = result.find((e) => e.id === "tf-1");

    expect(tf).toBeDefined();
    expect(tf!.created_at).toBe("2026-05-23T11:00:00Z");
    expect(tf!.duration_seconds).toBe(180);
    expect(tf!.history).toBeNull();
    expect(tf!.score).toBe(8.5);
  });

  it("returns 200-like shape when KETIK, PDKT, and results are empty", async () => {
    const result = await getMonitoringHistory();

    expect(result).toBeInstanceOf(Array);
    // Only the telefun_history entry should be present
    expect(result.filter((e) => e.module === "telefun")).toHaveLength(1);
    expect(result.filter((e) => e.module === "ketik")).toHaveLength(0);
    expect(result.filter((e) => e.module === "pdkt")).toHaveLength(0);
  });

  it("does not use date, duration, or recording_url in any code path for telefun_history", async () => {
    await getMonitoringHistory();

    // Re-fetch to ensure no regressions: select should not contain legacy fields
    expect(capturedTelefunSelect).not.toMatch(/\bdate\b/);
    expect(capturedTelefunSelect).not.toMatch(/\bduration\b/);
    expect(capturedTelefunSelect).not.toMatch(/\brecording_url\b/);
  });

  it("pages past the first 200 source rows", async () => {
    const original = mockKetikData.splice(0, mockKetikData.length);
    mockKetikData.push(...Array.from({ length: 201 }, (_, index) => ({
      id: `ketik-${index}`,
      user_id: "user-a",
      date: `2026-05-${String((index % 28) + 1).padStart(2, "0")}T10:00:00Z`,
      scenario_title: "Paged",
      messages: [],
      final_score: null,
    })));
    try {
      const result = await getMonitoringHistory();
      expect(result.filter((entry) => entry.module === "ketik")).toHaveLength(201);
    } finally {
      mockKetikData.splice(0, mockKetikData.length, ...original);
    }
  });

  it("rebuilds hold from system metrics and does not adjust the cached overall score twice", () => {
    const assessment = {
      overallScore: 8,
      speakingRate: { score: 8, verdict: "Baik", feedback: "ok", wordsPerMinute: 120 },
      intonation: { score: 8, verdict: "Baik", feedback: "ok" },
      articulation: { score: 8, verdict: "Baik", feedback: "ok" },
      fillerWords: { score: 8, verdict: "Baik", feedback: "ok", count: 1, examples: [] },
      emotionalTone: { score: 8, verdict: "Baik", feedback: "ok", dominant: "netral" },
      transcript: "", highlights: [], strengths: [],
      holdManagement: { status: "within_limit", score: 10, verdict: "Baik", feedback: "cached", holdCount: 1, totalDurationMs: 1, longestDurationMs: 1, exceededCount: 0 },
    };
    const result = normalizeTelefunAssessmentWithHold(assessment, { hold: { intervals: [{ sequence: 1, startedAtMs: 0, endedAtMs: 61000 }] } });
    expect(result?.holdManagement?.status).toBe("exceeded");
    expect(result?.overallScore).toBe(8);
    expect(normalizeTelefunAssessmentWithHold(assessment, null)?.holdManagement?.status).toBe("not_used");
  });

  it("drops malformed PDKT nested values and keeps valid historical evaluation without breakdown", () => {
    expect(normalizePdktConfig({ identity: { name: "partial" } })).toBeNull();
    expect(normalizePdktEmails([{ id: "bad", body: "ok" }])).toEqual([]);
    expect(normalizePdktEvaluation({ score: 80, feedback: "ok", typos: [], clarityIssues: [], contentGaps: [], scoreBreakdown: { bad: true } })).toEqual({ score: 80, feedback: "ok", typos: [], clarityIssues: [], contentGaps: [] });
  });

  it("fails closed when a later source page errors", async () => {
    const original = mockPdktData.splice(0, mockPdktData.length);
    mockPdktData.push(...Array.from({ length: 201 }, (_, index) => ({
      id: `pdkt-${index}`,
      user_id: "user-a",
      timestamp: "2026-05-21T14:00:00Z",
      config: {}, emails: [], evaluation: null,
      evaluation_status: "pending", evaluation_error: null, time_taken: null,
    })));
    sourceErrors.set("pdkt_history", 200);
    try {
      await expect(getMonitoringHistory()).rejects.toThrow("pdkt_history");
    } finally {
      sourceErrors.delete("pdkt_history");
      mockPdktData.splice(0, mockPdktData.length, ...original);
    }
  });
});
