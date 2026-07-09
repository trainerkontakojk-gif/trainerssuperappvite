import { render, screen, fireEvent, within } from "@testing-library/react";
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
      { no_tiket: "T-001", periodId: "p-jul", periodLabel: "07/2026", findingsCount: 2, criticalFindingsCount: 1 },
      { no_tiket: "T-002", periodId: "p-jun", periodLabel: "06/2026", findingsCount: 1, criticalFindingsCount: 0 },
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
      { no_tiket: "T-050", periodId: "p-jul", periodLabel: "07/2026", findingsCount: 1, criticalFindingsCount: 0 },
    ],
  },
];

describe("RootCauseCard", () => {
  it("renders header with title and subtitle", () => {
    render(<RootCauseCard causes={causes} monthLabel="Mei 2026" />);

    expect(screen.getByText("Diagnosis Akar Masalah")).toBeInTheDocument();
    expect(
      screen.getByText(/Berdasarkan temuan Mei 2026/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 pola/i)).toBeInTheDocument();
  });

  it("renders primary root cause with priority badge and recommendation", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.getByText("Jawaban salah/tidak akurat")).toBeInTheDocument();
    expect(screen.getByText(/Prioritas 8/i)).toBeInTheDocument();
    expect(screen.getByText(/3 temuan/i)).toBeInTheDocument();
    expect(screen.getByText(/2 tiket/i)).toBeInTheDocument();
    expect(screen.getByText(/validasi aturan/i)).toBeInTheDocument();
  });

  it("renders critical count badge when present", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.getByText(/1 critical/i)).toBeInTheDocument();
  });

  it("renders evidence text for primary cause", () => {
    render(<RootCauseCard causes={causes} />);

    expect(
      screen.getByText(/Jawaban salah terkait ketentuan produk/i),
    ).toBeInTheDocument();
  });

  it("renders secondary causes in compact rows", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.getByText("Kurang menggali kebutuhan")).toBeInTheDocument();
    expect(screen.getByText(/pertanyaan klarifikasi/i)).toBeInTheDocument();
  });

  it("renders a compact empty state when no causes", () => {
    render(<RootCauseCard causes={[]} />);

    expect(
      screen.getByText("Belum ada pola akar masalah yang dominan"),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 pola/i)).toBeInTheDocument();
  });

  it("hides ticket references by default", () => {
    render(<RootCauseCard causes={causes} />);

    expect(screen.queryByText("T-001")).not.toBeInTheDocument();
    expect(screen.queryByText("T-002")).not.toBeInTheDocument();
    expect(screen.queryByText("T-050")).not.toBeInTheDocument();
  });

  it("reveals ticket numbers and month labels when Tampilkan tiket is clicked", () => {
    render(<RootCauseCard causes={causes} />);

    const toggle = screen.getByRole("button", { name: /Tampilkan tiket/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    // Ticket numbers + grouped month labels visible
    expect(screen.getByText("T-001")).toBeInTheDocument();
    expect(screen.getByText("T-002")).toBeInTheDocument();
    expect(screen.getByText("07/2026")).toBeInTheDocument();
    expect(screen.getByText("06/2026")).toBeInTheDocument();
    // Secondary cause ticket also revealed under global expanded mode
    expect(screen.getByText("T-050")).toBeInTheDocument();

    const updated = screen.getByRole("button", { name: /Sembunyikan tiket/i });
    expect(updated).toHaveAttribute("aria-expanded", "true");
  });

  it("hides ticket references again when toggled off and updates button copy", () => {
    render(<RootCauseCard causes={causes} />);

    const toggle = screen.getByRole("button", { name: /Tampilkan tiket/i });
    fireEvent.click(toggle);
    expect(screen.getByText("T-001")).toBeInTheDocument();

    const hide = screen.getByRole("button", { name: /Sembunyikan tiket/i });
    fireEvent.click(hide);

    expect(screen.queryByText("T-001")).not.toBeInTheDocument();
    expect(screen.queryByText("T-050")).not.toBeInTheDocument();
    const collapsed = screen.getByRole("button", { name: /Tampilkan tiket/i });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
  });

  it("groups ticket chips under the correct month label", () => {
    render(<RootCauseCard causes={causes} />);
    fireEvent.click(screen.getByRole("button", { name: /Tampilkan tiket/i }));

    const julGroup = screen.getByText("07/2026").closest("div") as HTMLElement;
    const junGroup = screen.getByText("06/2026").closest("div") as HTMLElement;
    expect(within(julGroup).getByText("T-001")).toBeInTheDocument();
    expect(within(junGroup).getByText("T-002")).toBeInTheDocument();
  });
});
