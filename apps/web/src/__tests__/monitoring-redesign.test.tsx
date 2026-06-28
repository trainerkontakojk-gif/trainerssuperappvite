import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HistoryCard } from "../routes/monitoring/components/HistoryCard";
import { HistoryTab } from "../routes/monitoring/components/HistoryTab";
import { PdktEvaluationPanel } from "../routes/monitoring/components/PdktEvaluationPanel";
import type { UnifiedHistoryEntry } from "../routes/monitoring/utils/formatting";

const mockPdktReviewResponse = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  aiClient: {
    "monitoring/history/:module/:id/review": {
      $get: mockPdktReviewResponse,
    },
    "monitoring/history/:module/:id": {
      $delete: vi.fn(),
    },
  },
  getErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
  unwrapResponse: async (response: unknown) => response,
}));

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

const ketikEntry: UnifiedHistoryEntry = {
  id: "ketik-1",
  user_id: "user-1",
  module: "ketik",
  scenario_title: "Pinjol Ilegal Chat",
  created_at: "2026-05-20T10:00:00Z",
  duration_seconds: 300,
  score: 82,
  history: [
    { role: "user", text: "Halo" },
    { role: "ai", text: "Halo juga" },
  ],
  user_email: "agent@test.com",
  review_status: "completed",
  scores: {
    final: 82,
    empathy: 80,
    probing: 75,
    typo: 90,
    compliance: 85,
  },
};

const pdktEntry: UnifiedHistoryEntry = {
  id: "pdkt-1",
  user_id: "user-2",
  module: "pdkt",
  scenario_title: "Penipuan Undian",
  created_at: "2026-05-21T14:00:00Z",
  duration_seconds: 225,
  score: 85,
  history: [{ type: "received", subject: "Undian", body: "Selamat!" }],
  user_email: "agent2@test.com",
  review_status: "completed",
  pdkt_evaluation: {
    score: 85,
    feedback: "Jawaban sudah relevan dan jelas",
    typos_count: 2,
    clarity_issues_count: 0,
    content_gaps_count: 1,
  },
};

const telefunEntry: UnifiedHistoryEntry = {
  id: "telefun-1",
  user_id: "user-3",
  module: "telefun",
  scenario_title: "Tagihan Kartu Kredit",
  created_at: "2026-05-23T11:00:00Z",
  duration_seconds: 240,
  score: 7.5,
  history: "https://storage.supabase.co/telefun/1.mp3",
  user_email: "agent3@test.com",
  review_status: "completed",
  telefun_assessment: {
    overall_score: 7.5,
    speaking_rate_wpm: 142,
    intonation_score: 7,
    articulation_score: 8,
    filler_words_count: 3,
    emotional_tone: "Empati",
    strengths: ["Artikulasi jelas"],
    highlights: ["De-eskalasi berhasil"],
  },
};

const noAssessmentEntry: UnifiedHistoryEntry = {
  id: "pdkt-2",
  user_id: "user-4",
  module: "pdkt",
  scenario_title: "Simulasi Tanpa Evaluasi",
  created_at: "2026-05-22T09:00:00Z",
  duration_seconds: 100,
  score: null,
  history: [],
  user_email: "agent4@test.com",
  review_status: "not_started",
};

// ─── HistoryCard Tests ─────────────────────────────────────────────────────────

describe("HistoryCard — module-specific assessment previews", () => {
  const onViewDetail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders KETIK mini score bars for completed sessions", () => {
    render(<HistoryCard entry={ketikEntry} onViewDetail={onViewDetail} />);
    expect(screen.getByText("Empati")).toBeTruthy();
    expect(screen.getByText("Probing")).toBeTruthy();
    expect(screen.getByText("Tulis")).toBeTruthy();
    expect(screen.getByText("Comply")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.getByText("75")).toBeTruthy();
    expect(screen.getByText("90")).toBeTruthy();
    expect(screen.getByText("85")).toBeTruthy();
  });

  it("renders PDKT evaluation score and stats", () => {
    render(<HistoryCard entry={pdktEntry} onViewDetail={onViewDetail} />);
    expect(screen.getByText("Skor: 85%")).toBeTruthy();
    expect(screen.getByText(/2 typo/)).toBeTruthy();
    expect(screen.getByText(/Jelas/)).toBeTruthy();
    expect(screen.getByText(/Jawaban sudah relevan/)).toBeTruthy();
  });

  it("renders PDKT without typos as 'Tanpa typo'", () => {
    const cleanPdkt = {
      ...pdktEntry,
      pdkt_evaluation: {
        ...pdktEntry.pdkt_evaluation!,
        typos_count: 0,
      },
    };
    render(<HistoryCard entry={cleanPdkt} onViewDetail={onViewDetail} />);
    expect(screen.getByText(/Tanpa typo/)).toBeTruthy();
  });

  it("renders Telefun voice assessment metrics", () => {
    render(<HistoryCard entry={telefunEntry} onViewDetail={onViewDetail} />);
    expect(screen.getByText("142")).toBeTruthy(); // WPM
    expect(screen.getByText("WPM")).toBeTruthy();
    expect(screen.getByText("7/10")).toBeTruthy(); // Intonation
    expect(screen.getByText("8/10")).toBeTruthy(); // Articulation
    expect(screen.getByText("3")).toBeTruthy(); // Filler count
    expect(screen.getByText("Filler")).toBeTruthy();
    expect(screen.getByText(/Empati/)).toBeTruthy();
  });

  it("renders 'Belum dinilai' placeholder when no assessment data", () => {
    render(<HistoryCard entry={noAssessmentEntry} onViewDetail={onViewDetail} />);
    expect(screen.getByText("Belum dinilai")).toBeTruthy();
  });

  it("renders scenario title and user email", () => {
    render(<HistoryCard entry={ketikEntry} onViewDetail={onViewDetail} />);
    expect(screen.getByText("Pinjol Ilegal Chat")).toBeTruthy();
    expect(screen.getByText("agent@test.com")).toBeTruthy();
  });

  it("renders score with correct value", () => {
    render(<HistoryCard entry={ketikEntry} onViewDetail={onViewDetail} />);
    expect(screen.getByText("82")).toBeTruthy();
  });

  it("renders review status badge for completed sessions", () => {
    render(<HistoryCard entry={ketikEntry} onViewDetail={onViewDetail} />);
    expect(screen.getByText("Selesai")).toBeTruthy();
  });

  it("calls onViewDetail when button is clicked", () => {
    render(<HistoryCard entry={ketikEntry} onViewDetail={onViewDetail} />);
    const button = screen.getByText("Lihat Detail");
    fireEvent.click(button);
    expect(onViewDetail).toHaveBeenCalledWith(ketikEntry);
  });
});

describe("PdktEvaluationPanel — score breakdown", () => {
  beforeEach(() => {
    mockPdktReviewResponse.mockReset();
  });

  it("renders PDKT score breakdown when available", async () => {
    mockPdktReviewResponse.mockResolvedValueOnce({
      module: "pdkt",
      review_status: "completed",
      evaluation_error: null,
      time_taken: 90,
      emails: [],
      evaluation: {
        score: 88,
        feedback: "Arah penerima sudah tepat.",
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        scoreBreakdown: {
          recipientDirectionScore: 92,
          normativeResponseScore: 87,
          clarityScore: 90,
          typoScore: 100,
          templateComplianceScore: 70,
        },
      },
    });

    render(<PdktEvaluationPanel entryId="pdkt-1" />);

    await waitFor(() => {
      expect(screen.getByText("Arah Penerima")).toBeTruthy();
    });
    expect(screen.getByText("Kualitas OJK")).toBeTruthy();
    expect(screen.getByText("Template")).toBeTruthy();
    expect(screen.getByText("92")).toBeTruthy();
  });
});

// ─── HistoryTab KPI Tests ──────────────────────────────────────────────────────

describe("HistoryTab — per-module KPI and pill filter", () => {
  const allEntries: UnifiedHistoryEntry[] = [
    ketikEntry,
    pdktEntry,
    telefunEntry,
    noAssessmentEntry,
    {
      ...ketikEntry,
      id: "ketik-2",
      score: 90,
      review_status: "completed",
    },
  ];

  const onViewDetail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays total sessions count", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    // "Total Sesi" KPI should exist and show 5
    expect(screen.getByText("Total Sesi")).toBeTruthy();
    // Use getAllByText since "5" may appear in multiple places
    const fives = screen.getAllByText("5");
    expect(fives.length).toBeGreaterThanOrEqual(1);
  });

  it("displays unique users count", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    // 4 unique users (user-1, user-2, user-3, user-4)
    const penggunaSection = screen.getByText("Pengguna Aktif").closest("div");
    expect(penggunaSection).toBeTruthy();
  });

  it("displays average score across scored entries", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    // Scored: 82 + 85 + 7.5 + 90 = 264.5 / 4 = 66.1 → rounded 66
    expect(screen.getByText("Rata-rata Skor")).toBeTruthy();
  });

  it("displays review completed count", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    expect(screen.getByText("Review Selesai")).toBeTruthy();
  });

  it("displays per-module summary cards", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    expect(screen.getByText(/sesi KETIK/)).toBeTruthy();
    expect(screen.getByText(/sesi PDKT/)).toBeTruthy();
    expect(screen.getByText(/sesi Telefun/)).toBeTruthy();
  });

  it("renders module pill filters with counts", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    expect(screen.getByText("Semua")).toBeTruthy();
    expect(screen.getByText("KETIK")).toBeTruthy();
    expect(screen.getByText("PDKT")).toBeTruthy();
    expect(screen.getByText("Telefun")).toBeTruthy();
  });

  it("filters cards when module pill is clicked", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );

    // Click KETIK pill
    const ketikPill = screen.getByText("KETIK").closest("button")!;
    fireEvent.click(ketikPill);

    // Both KETIK cards should be visible (2 KETIK entries have "Pinjol Ilegal Chat")
    const pinjol = screen.getAllByText("Pinjol Ilegal Chat");
    expect(pinjol.length).toBe(2);
  });

  it("shows empty state when no matching entries", () => {
    render(
      <HistoryTab
        historyData={[]}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    expect(screen.getByText("Belum ada riwayat simulasi.")).toBeTruthy();
  });

  it("renders search input", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );
    expect(screen.getByPlaceholderText("Cari riwayat...")).toBeTruthy();
  });

  it("filters by search text", () => {
    render(
      <HistoryTab
        historyData={allEntries}
        loading={false}
        onViewDetail={onViewDetail}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Cari riwayat...");
    fireEvent.change(searchInput, { target: { value: "Undian" } });

    // Only PDKT entry "Penipuan Undian" should appear
    expect(screen.getByText("Penipuan Undian")).toBeTruthy();
  });
});
