import { describe, expect, it } from "vitest";
import {
  humanizeRiskStatus,
  humanizeTrend,
  titleize,
} from "../lib/humanize";

describe("titleize (Humanizer-style)", () => {
  it("title-cases an ALL-CAPS name", () => {
    expect(titleize("ADHITYA WISNUWADHANA")).toBe("Adhitya Wisnuwadhana");
  });

  it("leaves an already-proper name untouched", () => {
    expect(titleize("Adhitya Wisnuwadhana")).toBe("Adhitya Wisnuwadhana");
  });

  it("title-cases a team/division label", () => {
    expect(titleize("TELEPON")).toBe("Telepon");
    expect(titleize("TIM CALL")).toBe("Tim Call");
  });

  it("handles empty and single-word input", () => {
    expect(titleize("")).toBe("");
    expect(titleize("AGENT")).toBe("Agent");
  });
});

describe("humanizeRiskStatus", () => {
  it("maps at-risk agents to a human label", () => {
    expect(humanizeRiskStatus("atRisk")).toBe("Perlu Perhatian");
  });

  it("maps compliant agents", () => {
    expect(humanizeRiskStatus("compliant")).toBe("Sesuai");
  });

  it("maps not-audited agents", () => {
    expect(humanizeRiskStatus("none")).toBe("Belum Diaudit");
  });
});

describe("humanizeTrend", () => {
  it("maps trend codes to Indonesian labels", () => {
    expect(humanizeTrend("up")).toBe("Naik");
    expect(humanizeTrend("down")).toBe("Turun");
    expect(humanizeTrend("same")).toBe("Stabil");
    expect(humanizeTrend("none")).toBe("Belum Ada Tren");
  });
});
