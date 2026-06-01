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

// Spy: capture what columns the service selects from telefun_history
let capturedTelefunSelect: string | null = null;
let capturedTelefunOrder: string | null = null;

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: (cols: string) => {
          if (table === "telefun_history") capturedTelefunSelect = cols;
          return chain;
        },
        order: (col: string, _opts?: any) => {
          if (table === "telefun_history") capturedTelefunOrder = col;
          return chain;
        },
        limit: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: any) => {
          if (table === "ketik_history") resolve({ data: mockKetikData, error: null });
          else if (table === "pdkt_history") resolve({ data: mockPdktData, error: null });
          else if (table === "telefun_history") resolve({ data: mockTelefunHistoryData, error: null });
          else if (table === "results") resolve({ data: mockTelefunResultsData, error: null });
          else if (table === "profiles") resolve({ data: mockProfiles, error: null });
          else resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  }),
}));

import { getMonitoringHistory } from "../services/monitoring-history-service";

describe("getMonitoringHistory — Telefun schema alignment", () => {
  it("selects Vite schema columns from telefun_history (not legacy aliases)", async () => {
    await getMonitoringHistory();

    expect(capturedTelefunSelect).not.toBeNull();
    expect(capturedTelefunSelect).toContain("created_at");
    expect(capturedTelefunSelect).toContain("duration_seconds");
    expect(capturedTelefunSelect).toContain("recording_path");

    expect(capturedTelefunSelect).not.toMatch(/\bdate\b/);
    expect(capturedTelefunSelect).not.toMatch(/\bduration\b/);
    expect(capturedTelefunSelect).not.toMatch(/\brecording_url\b/);
  });

  it("orders telefun_history by created_at (not date)", async () => {
    await getMonitoringHistory();

    expect(capturedTelefunOrder).toBe("created_at");
    expect(capturedTelefunOrder).not.toBe("date");
  });

  it("maps telefun_history row fields to unified entry correctly", async () => {
    const result = await getMonitoringHistory();
    const tf = result.find((e) => e.id === "tf-1");

    expect(tf).toBeDefined();
    expect(tf!.created_at).toBe("2026-05-23T11:00:00Z");
    expect(tf!.duration_seconds).toBe(180);
    expect(tf!.history).toBe("https://storage.example.com/rec.mp3");
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
});
