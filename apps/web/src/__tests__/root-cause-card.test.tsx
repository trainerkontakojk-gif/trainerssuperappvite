import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootCauseCard from "../components/sidak/RootCauseCard";
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
        no_tiket: "T-001",
        periodId: "p-jul",
        periodLabel: "07/2026",
        findingsCount: 2,
        criticalFindingsCount: 1,
      },
      {
        no_tiket: "T-002",
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
        no_tiket: "T-050",
        periodId: "p-jul",
        periodLabel: "07/2026",
        findingsCount: 1,
        criticalFindingsCount: 0,
      },
    ],
  },
];

describe("RootCauseCard", () => {
  it("renders header with title and subtitle", () => {
    render(<RootCauseCard causes={causes} monthLabel="Mei 2026" />);

    expect(screen.getByText("Akar Masalah")).toBeInTheDocument();
    expect(
      screen.getByText(/Berdasarkan temuan Mei 2026/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 pola/i)).toBeInTheDocument();
  });

  it("renders primary root cause without a confusing priority badge", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.getByText("Jawaban salah/tidak akurat")).toBeInTheDocument();
    expect(screen.queryByText(/Prioritas 8/i)).not.toBeInTheDocument();
    expect(screen.getByText(/3 temuan/i)).toBeInTheDocument();
    expect(screen.getByText(/2 tiket/i)).toBeInTheDocument();
    expect(screen.getByText(/validasi aturan/i)).toBeInTheDocument();
  });

  it("renders critical count badge when present", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.getByText(/1 kritis/i)).toBeInTheDocument();
  });

  it("renders secondary causes in compact rows", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.getByText("Kurang menggali kebutuhan")).toBeInTheDocument();
    expect(screen.getByText(/pertanyaan klarifikasi/i)).toBeInTheDocument();
  });

  it("renders a compact empty state when no causes", () => {
    render(<RootCauseCard causes={[]} />);

    expect(
      screen.getByText("Belum ditemukan pola akar masalah yang dominan"),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 pola/i)).toBeInTheDocument();
  });

  it("hides tickets by default and gives each cause its own toggle", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.queryByText("T-001 (Juli)")).not.toBeInTheDocument();
    expect(screen.queryByText("T-050 (Juli)")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Tampilkan tiket" })).toHaveLength(2);
  });

  it("shows a flat ticket list with month labels when a cause is expanded", () => {
    render(<RootCauseCard causes={causes} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Tampilkan tiket" })[0]);
    expect(screen.getByText("T-001 (Juli)")).toBeInTheDocument();
    expect(screen.getByText("T-002 (Juni)")).toBeInTheDocument();
    expect(screen.queryByText("07/2026")).not.toBeInTheDocument();
    expect(screen.queryByText("06/2026")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sembunyikan tiket" })).toBeInTheDocument();
  });

});
