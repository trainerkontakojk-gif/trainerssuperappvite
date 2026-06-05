import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HoldAssessmentCard } from "../routes/telefun/components/HoldAssessmentCard";
import type { TelefunHoldAssessment } from "@trainers/types";

function makeAssessment(
  overrides?: Partial<TelefunHoldAssessment>,
): TelefunHoldAssessment {
  return {
    status: "not_used",
    score: null,
    verdict: "N/A",
    feedback: "User tidak menggunakan hold pada sesi ini.",
    holdCount: 0,
    totalDurationMs: 0,
    longestDurationMs: 0,
    exceededCount: 0,
    ...overrides,
  };
}

describe("HoldAssessmentCard", () => {
  it("renders nothing when assessment is null", () => {
    const { container } = render(<HoldAssessmentCard assessment={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders N/A state", () => {
    render(<HoldAssessmentCard assessment={makeAssessment()} />);
    expect(screen.getByText("N/A")).toBeDefined();
    expect(
      screen.getByText("User tidak menggunakan hold pada sesi ini."),
    ).toBeDefined();
  });

  it("renders Baik state with metrics", () => {
    render(
      <HoldAssessmentCard
        assessment={makeAssessment({
          status: "within_limit",
          score: 10,
          verdict: "Baik",
          feedback: "Semua hold selesai dalam batas waktu.",
          holdCount: 2,
          totalDurationMs: 60_000,
          longestDurationMs: 30_000,
        })}
      />,
    );
    expect(screen.getByText("Baik")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("1m 0s")).toBeDefined();
    expect(screen.getByText("30s")).toBeDefined();
  });

  it("renders Kurang state with exceeded count", () => {
    render(
      <HoldAssessmentCard
        assessment={makeAssessment({
          status: "exceeded",
          score: 4,
          verdict: "Kurang",
          feedback: "Manajemen hold kurang.",
          holdCount: 1,
          totalDurationMs: 61_000,
          longestDurationMs: 61_000,
          exceededCount: 1,
        })}
      />,
    );
    expect(screen.getByText("Kurang")).toBeDefined();
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1m 1s").length).toBeGreaterThanOrEqual(1);
  });
});
