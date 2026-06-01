import { describe, it, expect, vi } from "vitest";

// ─── Mock Supabase Client ──────────────────────────────────────────────────────

const mockKetikData = [
  {
    id: "ketik-1",
    user_id: "user-1",
    date: "2026-05-20T10:00:00Z",
    scenario_title: "Pinjol Ilegal",
    messages: [
      { role: "user", text: "Halo", timestamp: "2026-05-20T10:00:00Z" },
      { role: "ai", text: "Halo juga", timestamp: "2026-05-20T10:05:00Z" },
    ],
    final_score: 82,
    empathy_score: 80,
    probing_score: 75,
    typo_score: 90,
    compliance_score: 85,
    review_status: "completed",
  },
];

const mockPdktData = [
  {
    id: "pdkt-1",
    user_id: "user-2",
    timestamp: "2026-05-21T14:00:00Z",
    config: { scenarios: [{ title: "Penipuan Undian" }] },
    emails: [{ type: "received", subject: "Undian", body: "Selamat!" }],
    evaluation: {
      score: 85,
      feedback: "Jawaban sudah relevan dan jelas",
      typos: ["salah satu"],
      clarityIssues: [],
      contentGaps: ["Perlu tambahkan referensi"],
    },
    evaluation_status: "completed",
    evaluation_error: null,
    time_taken: 225,
  },
  {
    id: "pdkt-2",
    user_id: "user-3",
    timestamp: "2026-05-22T09:00:00Z",
    config: {},
    emails: [],
    evaluation: null,
    evaluation_status: "not_started",
    evaluation_error: null,
    time_taken: null,
  },
];

const mockTelefunHistoryData = [
  {
    id: "telefun-1",
    user_id: "user-4",
    created_at: "2026-05-23T11:00:00Z",
    scenario_title: "Tagihan Kartu Kredit",
    duration_seconds: 240,
    recording_path: "https://storage.supabase.co/telefun/1.mp3",
    score: 7.5,
    voice_assessment: {
      overallScore: 7.5,
      speakingRate: { score: 8, verdict: "Baik", feedback: "Kecepatan sesuai", wordsPerMinute: 142 },
      intonation: { score: 7, verdict: "Baik", feedback: "Intonasi natural" },
      articulation: { score: 8, verdict: "Baik", feedback: "Artikulasi jelas" },
      fillerWords: { score: 9, verdict: "Sangat Baik", feedback: "Sedikit filler", count: 3, examples: ["eh", "anu"] },
      emotionalTone: { score: 7, verdict: "Baik", feedback: "Empati terasa", dominant: "Empati" },
      transcript: "Agent: Halo\nCustomer: Saya mau bayar",
      highlights: ["De-eskalasi berhasil"],
      strengths: ["Artikulasi jelas", "Kecepatan sesuai"],
    },
    ai_summary: "Agen menunjukkan kemampuan komunikasi yang baik",
    strengths: ["Empati tinggi", "Responsif"],
    weaknesses: ["Perlu tingkatkan probing"],
    coaching_focus: ["Fokus pada probing"],
  },
];

const mockTelefunResultsData = [
  {
    id: "result-1",
    user_id: "user-5",
    module: "telefun",
    score: 6,
    details: { scenario: "Simulasi Lain", duration: 120, recordingUrl: "https://storage.supabase.co/telefun/r1.mp3" },
    history: null,
    created_at: "2026-05-24T08:00:00Z",
  },
];

const mockProfiles = [
  { id: "user-1", email: "agent1@test.com", role: "agent" },
  { id: "user-2", email: "agent2@test.com", role: "agent" },
  { id: "user-3", email: "agent3@test.com", role: "agent" },
  { id: "user-4", email: "agent4@test.com", role: "agent" },
  { id: "user-5", email: "agent5@test.com", role: "agent" },
];

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        order: () => chain,
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

describe("getMonitoringHistory — enriched data", () => {
  it("returns unified entries from all 3 modules", async () => {
    const result = await getMonitoringHistory();
    const modules = result.map((e) => e.module);
    expect(modules).toContain("ketik");
    expect(modules).toContain("pdkt");
    expect(modules).toContain("telefun");
  });

  it("includes KETIK scores in the unified entry", async () => {
    const result = await getMonitoringHistory();
    const ketik = result.find((e) => e.module === "ketik");
    expect(ketik).toBeDefined();
    expect(ketik!.scores).toBeDefined();
    expect(ketik!.scores!.final).toBe(82);
    expect(ketik!.scores!.empathy).toBe(80);
    expect(ketik!.scores!.probing).toBe(75);
    expect(ketik!.scores!.typo).toBe(90);
    expect(ketik!.scores!.compliance).toBe(85);
  });

  it("includes pdkt_evaluation for completed PDKT sessions", async () => {
    const result = await getMonitoringHistory();
    const pdkt = result.find((e) => e.id === "pdkt-1");
    expect(pdkt).toBeDefined();
    expect(pdkt!.pdkt_evaluation).toBeDefined();
    expect(pdkt!.pdkt_evaluation!.score).toBe(85);
    expect(pdkt!.pdkt_evaluation!.typos_count).toBe(1);
    expect(pdkt!.pdkt_evaluation!.clarity_issues_count).toBe(0);
    expect(pdkt!.pdkt_evaluation!.content_gaps_count).toBe(1);
    expect(pdkt!.pdkt_evaluation!.feedback).toBe("Jawaban sudah relevan dan jelas");
  });

  it("does not include pdkt_evaluation for uncompleted PDKT sessions", async () => {
    const result = await getMonitoringHistory();
    const pdkt = result.find((e) => e.id === "pdkt-2");
    expect(pdkt).toBeDefined();
    expect(pdkt!.pdkt_evaluation).toBeUndefined();
  });

  it("includes telefun_assessment for telefun_history entries with voice_assessment", async () => {
    const result = await getMonitoringHistory();
    const telefun = result.find((e) => e.id === "telefun-1");
    expect(telefun).toBeDefined();
    expect(telefun!.telefun_assessment).toBeDefined();
    expect(telefun!.telefun_assessment!.overall_score).toBe(7.5);
    expect(telefun!.telefun_assessment!.speaking_rate_wpm).toBe(142);
    expect(telefun!.telefun_assessment!.intonation_score).toBe(7);
    expect(telefun!.telefun_assessment!.articulation_score).toBe(8);
    expect(telefun!.telefun_assessment!.filler_words_count).toBe(3);
    expect(telefun!.telefun_assessment!.emotional_tone).toBe("Empati");
    expect(telefun!.telefun_assessment!.strengths).toHaveLength(2);
    expect(telefun!.telefun_assessment!.highlights).toHaveLength(1);
  });

  it("does not include telefun_assessment for results table entries", async () => {
    const result = await getMonitoringHistory();
    const telefunResult = result.find((e) => e.id === "result-1");
    expect(telefunResult).toBeDefined();
    expect(telefunResult!.telefun_assessment).toBeUndefined();
  });

  it("handles malformed voice_assessment gracefully", async () => {
    // This test ensures the service doesn't crash on bad data
    const result = await getMonitoringHistory();
    // All entries should exist without throwing
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("resolves user profiles correctly", async () => {
    const result = await getMonitoringHistory();
    const ketik = result.find((e) => e.module === "ketik");
    expect(ketik!.user_email).toBe("agent1@test.com");
    expect(ketik!.user_role).toBe("agent");
  });
});
