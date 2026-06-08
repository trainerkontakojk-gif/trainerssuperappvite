import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ParetoImprovementInsight from "../components/sidak/ParetoImprovementInsight";
import type { ParetoImprovementInsightModel } from "../components/sidak/pareto-view-model";

const multiInsight: ParetoImprovementInsightModel = {
  primary: { name: "Kemampuan Pencatatan", count: 220, share: 38 },
  focusItems: [
    { name: "Kemampuan Pencatatan", count: 220, share: 38 },
    { name: "Etika Bertelepon", count: 140, share: 24 },
    { name: "Kemampuan Solusi", count: 116, share: 20 },
    { name: "Verifikasi Data", count: 20, share: 3 },
  ],
  focusCount: 496,
  focusShare: 85,
  totalCount: 580,
  threshold: 80,
};

describe("ParetoImprovementInsight", () => {
  it("explains the primary parameter and 80 percent focus group", () => {
    render(<ParetoImprovementInsight serviceLabel="Call" insight={multiInsight} />);

    expect(screen.getByText("Insight Fokus Perbaikan")).toBeInTheDocument();
    expect(screen.getAllByText(/Kemampuan Pencatatan/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("220 dari 580 temuan")).toBeInTheDocument();
    expect(screen.getAllByText(/85%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/pada layanan Call/)).toBeInTheDocument();
    expect(screen.getByText("+1 parameter lainnya")).toBeInTheDocument();
  });

  it("renders up to three chips and the remaining count", () => {
    render(<ParetoImprovementInsight serviceLabel="Call" insight={multiInsight} />);

    expect(screen.getByText("Kemampuan Pencatatan")).toBeInTheDocument();
    expect(screen.getByText("Etika Bertelepon")).toBeInTheDocument();
    expect(screen.getByText("Kemampuan Solusi")).toBeInTheDocument();
    expect(screen.queryByText("Verifikasi Data")).not.toBeInTheDocument();
    expect(screen.getByText("+1 parameter lainnya")).toBeInTheDocument();
  });

  it("uses single-dominant copy when only one focus item", () => {
    const singleInsight: ParetoImprovementInsightModel = {
      primary: { name: "Verifikasi Data", count: 84, share: 84 },
      focusItems: [{ name: "Verifikasi Data", count: 84, share: 84 }],
      focusCount: 84,
      focusShare: 84,
      totalCount: 100,
      threshold: 80,
    };

    render(<ParetoImprovementInsight serviceLabel="BKO" insight={singleInsight} />);

    expect(screen.getAllByText(/Verifikasi Data/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/parameter ini sendiri menyumbang/i)).toBeInTheDocument();
    expect(screen.getAllByText(/84%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/pada layanan BKO/)).toBeInTheDocument();
  });

  it("returns null when insight is null", () => {
    const { container } = render(
      <ParetoImprovementInsight serviceLabel="Call" insight={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders full parameter name without truncation", () => {
    const longNameInsight: ParetoImprovementInsightModel = {
      primary: {
        name: "Kemampuan Pencatatan dan Dokumentasi Kertas Kerja",
        count: 100,
        share: 50,
      },
      focusItems: [
        {
          name: "Kemampuan Pencatatan dan Dokumentasi Kertas Kerja",
          count: 100,
          share: 50,
        },
      ],
      focusCount: 100,
      focusShare: 50,
      totalCount: 200,
      threshold: 80,
    };

    render(
      <ParetoImprovementInsight serviceLabel="Call" insight={longNameInsight} />,
    );

    expect(
      screen.getByText("Kemampuan Pencatatan dan Dokumentasi Kertas Kerja"),
    ).toBeInTheDocument();
  });

  it("renders without service label when not provided", () => {
    render(<ParetoImprovementInsight insight={multiInsight} />);

    expect(screen.getByText(/85% temuan/)).toBeInTheDocument();
    expect(screen.queryByText(/layanan/)).not.toBeInTheDocument();
  });

  it("has correct accessibility attributes", () => {
    render(<ParetoImprovementInsight serviceLabel="Call" insight={multiInsight} />);

    const section = screen.getByRole("region", { name: "Insight Fokus Perbaikan" });
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute("aria-labelledby", "pareto-insight-title");
  });
});
