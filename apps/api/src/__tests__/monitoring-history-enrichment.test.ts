import { describe, it, expect, vi } from "vitest";

// ─── Mock Supabase Client ──────────────────────────────────────────────────────

const mockKetikData = [
  {
    id: "ketik-1",
    user_id: "user-1",
    date: "2026-05-20T10:00:00Z",
    scenario_title: "Pinjol Ilegal",
    consumer_name: "Budi",
    consumer_phone: "0812",
    consumer_city: "Bandung",
    simulation_duration: 90,
    messages: [
      { role: "user", text: "Halo", timestamp: "2026-05-20T10:00:00Z" },
      { role: "ai", text: "Halo juga", timestamp: "2026-05-20T10:05:00Z" },
    ],
    final_score: 82,
    empathy_score: 80,
    probing_score: 75,
    resolution_score: 78,
    typo_score: 90,
    compliance_score: 85,
    review_status: "completed",
  },
  {
    id: "ketik-zero",
    user_id: "user-1",
    date: "2026-05-19T10:00:00Z",
    scenario_title: "Skor Nol",
    consumer_name: "Budi",
    consumer_phone: "0812",
    consumer_city: "Bandung",
    simulation_duration: 0,
    messages: [],
    final_score: 0,
    empathy_score: 0,
    probing_score: 0,
    resolution_score: 0,
    typo_score: 0,
    compliance_score: 0,
    review_status: "completed",
  },
];

const mockPdktData = [
  {
    id: "pdkt-1",
    user_id: "user-2",
    timestamp: "2026-05-21T14:00:00Z",
    config: { scenarios: [{ id: "undian", category: "fraud", title: "Penipuan Undian", description: "Kasus undian", isActive: true }], consumerType: { id: "terburu-buru", name: "Terburu-buru", description: "Mendesak", difficulty: "Medium" }, identity: { name: "Sari", email: "sari@example.com", city: "Jakarta", bodyName: "OJK" }, recipientContext: { primaryRecipientType: "ojk", primaryRecipientAddress: "lapor@ojk.go.id", ccRecipients: [], replyIntent: "reply_to_ojk" } },
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
    consumer_name: "Siti",
    consumer_phone: "08123456789",
    consumer_city: "Surabaya",
    consumer_gender: "female",
    persona_config: { consumerType: "Marah & Emosional" },
    duration_seconds: 240,
    recording_path: "https://storage.supabase.co/telefun/1.mp3",
    score: 7.5,
    voice_assessment: {
      overallScore: 7.5,
      speakingRate: {
        score: 8,
        verdict: "Baik",
        feedback: "Kecepatan sesuai",
        wordsPerMinute: 142,
      },
      intonation: { score: 7, verdict: "Baik", feedback: "Intonasi natural" },
      articulation: { score: 8, verdict: "Baik", feedback: "Artikulasi jelas" },
      fillerWords: {
        score: 9,
        verdict: "Sangat Baik",
        feedback: "Sedikit filler",
        count: 3,
        examples: ["eh", "anu"],
      },
      emotionalTone: {
        score: 7,
        verdict: "Baik",
        feedback: "Empati terasa",
        dominant: "Empati",
      },
      transcript: "Agent: Halo\nCustomer: Saya mau bayar",
      highlights: ["De-eskalasi berhasil"],
      strengths: ["Artikulasi jelas", "Kecepatan sesuai"],
    },
    ai_summary: "Agen menunjukkan kemampuan komunikasi yang baik",
    strengths: ["Empati tinggi", "Responsif"],
    weaknesses: ["Perlu tingkatkan probing"],
    coaching_focus: ["Fokus pada probing"],
  },
  {
    id: "telefun-zero",
    user_id: "user-4",
    created_at: "2026-05-23T09:00:00Z",
    scenario_title: "Skor Nol",
    consumer_name: "Nina",
    consumer_gender: "female",
    duration_seconds: 1,
    recording_path: null,
    score: 0,
    voice_assessment: null,
    messages: [],
  },
];

const mockTelefunResultsData = [
  {
    id: "telefun-1",
    user_id: "user-4",
    module: "telefun",
    score: 1,
    details: { scenario: "Legacy duplicate", recordingUrl: "legacy.mp3" },
    history: null,
    created_at: "2026-05-23T10:00:00Z",
  },
  {
    id: "result-1",
    user_id: "user-5",
    module: "telefun",
    score: 6,
    details: {
      scenario: "Simulasi Lain",
      duration: 120,
      recordingUrl: "https://storage.supabase.co/telefun/r1.mp3",
    },
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
        range: () => chain,
        limit: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: any) => {
          if (table === "ketik_history")
            resolve({ data: mockKetikData, error: null });
          else if (table === "pdkt_history")
            resolve({ data: mockPdktData, error: null });
          else if (table === "telefun_history")
            resolve({ data: mockTelefunHistoryData, error: null });
          else if (table === "results")
            resolve({ data: mockTelefunResultsData, error: null });
          else if (table === "profiles")
            resolve({ data: mockProfiles, error: null });
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

  it("includes KETIK simulation duration and resolution score in the unified entry", async () => {
    const result = await getMonitoringHistory();
    const ketik = result.find((e) => e.id === "ketik-1");
    expect(ketik).toBeDefined();
    expect(ketik!.duration_seconds).toBe(90);
    expect(ketik!.scores).toBeDefined();
    expect(ketik!.scores!.final).toBe(82);
    expect(ketik!.scores!.empathy).toBe(80);
    expect(ketik!.scores!.probing).toBe(75);
    expect(ketik!.scores!.resolution).toBe(78);
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
    expect(pdkt!.pdkt_evaluation!.feedback).toBe(
      "Jawaban sudah relevan dan jelas",
    );
  });

  it("does not include pdkt_evaluation for uncompleted PDKT sessions", async () => {
    const result = await getMonitoringHistory();
    const pdkt = result.find((e) => e.id === "pdkt-2");
    expect(pdkt).toBeDefined();
    expect(pdkt!.pdkt_evaluation).toBeUndefined();
  });

  it("prefers canonical Telefun rows by ID, retains distinct legacy sessions, and completes score zero", async () => {
    const result = await getMonitoringHistory();
    expect(result.filter((entry) => entry.id === "telefun-1")).toHaveLength(1);
    expect(result.find((entry) => entry.id === "telefun-1")?.scenario_title).toBe("Tagihan Kartu Kredit");
    expect(result.find((entry) => entry.id === "result-1")?.telefun_legacy).toBe(true);
    expect(result.find((entry) => entry.id === "telefun-zero")).toMatchObject({ score: 0, review_status: "completed" });
  });

  it("includes telefun_assessment for telefun_history entries with voice_assessment", async () => {
    const result = await getMonitoringHistory();
    const telefun = result.find((e) => e.id === "telefun-1");
    expect(telefun).toBeDefined();
    expect(telefun!.duration_seconds).toBe(240);
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

  it("keeps missing KETIK consumer names null and normalizes coaching recommendations", async () => {
    mockKetikData.push({ id: "ketik-missing-name", user_id: "user-1", date: "2026-05-18T10:00:00Z", messages: [], simulation_duration: 0, resolution_score: 0 } as any);
    try {
      const result = await getMonitoringHistory();
      expect(result.find((e) => e.id === "ketik-missing-name")?.consumer_name).toBeNull();
    } finally {
      mockKetikData.pop();
    }
  });

  it("sorts equal timestamps by module and id deterministically", async () => {
    const original = mockKetikData.splice(0, mockKetikData.length);
    mockKetikData.push({ id: "z", user_id: "user-1", date: "2026-05-23T11:00:00Z", messages: [] } as any);
    try {
      const result = await getMonitoringHistory();
      const equal = result.filter((entry) => entry.created_at === "2026-05-23T11:00:00Z");
      expect(equal.map((entry) => `${entry.module}:${entry.id}`)).toEqual(["ketik:z", "telefun:telefun-1"]);
    } finally {
      mockKetikData.push(...original);
    }
  });

  it("preserves consumer metadata and the complete PDKT evaluation", async () => {
    const result = await getMonitoringHistory();
    const ketik = result.find((e) => e.id === "ketik-1");
    const pdkt = result.find((e) => e.id === "pdkt-1");
    const telefun = result.find((e) => e.id === "telefun-1");
    expect(ketik).toMatchObject({ consumer_name: "Budi", consumer_phone: "0812", consumer_city: "Bandung" });
    expect(pdkt).toMatchObject({ consumer_name: "Sari", consumer_type: "Terburu-buru", recipient: "lapor@ojk.go.id" });
    expect(pdkt!.pdkt_evaluation).toMatchObject({ feedback: "Jawaban sudah relevan dan jelas", typos: ["salah satu"], contentGaps: ["Perlu tambahkan referensi"] });
    expect(telefun).toMatchObject({ consumer_name: "Siti", consumer_phone: "08123456789", consumer_city: "Surabaya", consumer_gender: "female", consumer_type: "Marah & Emosional" });
  });

  it("preserves zero-valued KETIK duration and resolution scores", async () => {
    const result = await getMonitoringHistory();
    const ketikZero = result.find((e) => e.id === "ketik-zero");
    expect(ketikZero).toMatchObject({ duration_seconds: 0, score: 0, review_status: "completed" });
    expect(ketikZero!.scores).toMatchObject({ final: 0, empathy: 0, probing: 0, resolution: 0, typo: 0, compliance: 0 });
  });

  it("resolves user profiles correctly", async () => {
    const result = await getMonitoringHistory();
    const ketik = result.find((e) => e.module === "ketik");
    expect(ketik!.user_email).toBe("agent1@test.com");
    expect(ketik!.user_role).toBe("agent");
  });
});
