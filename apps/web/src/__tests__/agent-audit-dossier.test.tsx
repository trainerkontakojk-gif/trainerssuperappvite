import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgentAuditDossier from "../components/sidak/AgentAuditDossier";
import type { RootCauseResult } from "@trainers/types";

const causes: RootCauseResult[] = [
  {
    clusterId: "salah_jawaban",
    label: "Jawaban salah/tidak akurat",
    priority: 8,
    findingsCount: 3,
    affectedTickets: 2,
    criticalFindingsCount: 1,
    averageNilai: 1,
    matchedKeywords: ["salah jawaban"],
    recommendation:
      "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
    evidence: [
      {
        id: "e1",
        no_tiket: "T-001",
        periodId: "period-call",
        indicatorName: "Akurasi Jawaban",
        nilai: 0,
        text: "Jawaban salah terkait ketentuan produk.",
      },
    ],
    periods: [],
    ticketReferences: [
      {
        no_tiket: "T-ADV-1",
        periodId: "p-jun",
        periodLabel: "06/2026",
        findingsCount: 1,
        criticalFindingsCount: 0,
      },
    ],
  },
  {
    clusterId: "kurang_menggali",
    label: "Kurang menggali kebutuhan",
    priority: 5,
    findingsCount: 1,
    affectedTickets: 1,
    criticalFindingsCount: 0,
    averageNilai: 2,
    matchedKeywords: ["kurang menggali"],
    recommendation:
      "Latih pertanyaan klarifikasi agar kebutuhan, kronologi, dan konteks pelanggan tergali tuntas.",
    evidence: [],
    periods: [],
    ticketReferences: [
      {
        no_tiket: "T-ADV-2",
        periodId: "p-jul",
        periodLabel: "07/2026",
        findingsCount: 1,
        criticalFindingsCount: 0,
      },
    ],
  },
];

const tickets = [
  {
    no_tiket: "T-001",
    scoreDeduction: 12.5,
    findingCount: 3,
    heaviestParam: "Akurasi Jawaban",
    isSamplingQa: false,
  },
  {
    no_tiket: "AUDIT-INT-1",
    scoreDeduction: 8.2,
    findingCount: 1,
    heaviestParam: "Penyampaian",
    isSamplingQa: true,
  },
];

describe("AgentAuditDossier", () => {
  it("renders the compact score strip with month label and stats", () => {
    render(
      <AgentAuditDossier
        finalScore={92.0}
        sessionCount={3}
        findingsCount={7}
        previousScore={90.0}
        monthLabel="Mei 2026"
        tickets={tickets}
        causes={causes}
        rootCauseMonthLabel="Jan-Mei 2026"
      />,
    );

    expect(screen.getByText("Mei 2026")).toBeInTheDocument();
    expect(screen.getByText("92.0")).toBeInTheDocument();
    expect(screen.getByText("Sesi")).toBeInTheDocument();
    expect(screen.getByText("Temuan")).toBeInTheDocument();
    expect(screen.getByText("Selisih")).toBeInTheDocument();
    // delta positive
    expect(screen.getByText("+2.0%")).toBeInTheDocument();
  });

  it("renders a zero/negative delta when previous score is higher or missing", () => {
    const { rerender } = render(
      <AgentAuditDossier
        finalScore={88.0}
        sessionCount={2}
        findingsCount={5}
        previousScore={92.0}
        tickets={tickets}
        causes={causes}
      />,
    );
    expect(screen.getByText("-4.0%")).toBeInTheDocument();

    rerender(
      <AgentAuditDossier
        finalScore={88.0}
        sessionCount={2}
        findingsCount={5}
        previousScore={null}
        tickets={tickets}
        causes={causes}
      />,
    );
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders the ticket impact table with rank, id, parameter, point loss, and finding count", () => {
    render(
      <AgentAuditDossier
        finalScore={92.0}
        sessionCount={3}
        findingsCount={7}
        previousScore={90.0}
        tickets={tickets}
        causes={causes}
      />,
    );

    expect(
      screen.getByText("Tiket Pengurang Skor Terbesar"),
    ).toBeInTheDocument();
    expect(screen.getByText("T-001")).toBeInTheDocument();
    expect(screen.getByText(/Akurasi Jawaban/i)).toBeInTheDocument();
    expect(screen.getByText("12.5")).toBeInTheDocument();
    expect(screen.getAllByText("3 temuan").length).toBeGreaterThan(0);
  });

  it("renders the populated root-cause diagnosis panel", () => {
    render(
      <AgentAuditDossier
        finalScore={92.0}
        sessionCount={3}
        findingsCount={7}
        previousScore={90.0}
        tickets={tickets}
        causes={causes}
        rootCauseMonthLabel="Jan-Mei 2026"
      />,
    );

    expect(screen.getByText("Akar Masalah")).toBeInTheDocument();
    expect(
      screen.getByText(/Berdasarkan temuan Jan-Mei 2026/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Pola Temuan Lainnya")).toBeInTheDocument();
    expect(screen.getByText("Jawaban salah/tidak akurat")).toBeInTheDocument();
    expect(screen.getByText("Kurang menggali kebutuhan")).toBeInTheDocument();
    expect(screen.getAllByText("1 temuan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 tiket")).toHaveLength(1);
    expect(screen.queryByText("T-ADV-2 (Juli)")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Tampilkan tiket" })[1]);
    expect(screen.getByText("T-ADV-2 (Juli)")).toBeInTheDocument();
    expect(screen.queryByText("07/2026")).not.toBeInTheDocument();
  });

  it("renders the root-cause empty state when no causes", () => {
    render(
      <AgentAuditDossier
        finalScore={92.0}
        sessionCount={3}
        findingsCount={7}
        previousScore={90.0}
        tickets={tickets}
        causes={[]}
      />,
    );

    expect(
      screen.getByText("Belum ditemukan pola akar masalah yang dominan"),
    ).toBeInTheDocument();
  });
});
