import { describe, it, expect } from "vitest";
import {
  calculateQAScoreFromTemuan,
  calculateSessionScoreFromTemuan,
  resolveServiceTypeFromTeam,
  computeEffectiveService,
  isAgentExcluded,
  scoreColor,
  scoreBg,
  scoreLabel,
  DEFAULT_SERVICE_WEIGHTS,
} from "../lib/scoring";
import type { QAIndicator } from "@trainers/types";

function makeIndicator(overrides: Partial<QAIndicator> = {}): QAIndicator {
  return {
    id: crypto.randomUUID(),
    service_type: "call",
    name: "Test Indicator",
    category: "non_critical",
    bobot: 1,
    has_na: false,
    threshold: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("resolveServiceTypeFromTeam", () => {
  it("returns call for null", () => {
    expect(resolveServiceTypeFromTeam(null)).toBe("call");
  });

  it("returns call for undefined", () => {
    expect(resolveServiceTypeFromTeam(undefined)).toBe("call");
  });

  it("returns call for empty string", () => {
    expect(resolveServiceTypeFromTeam("")).toBe("call");
  });

  it("resolves Telepon to call", () => {
    expect(resolveServiceTypeFromTeam("Telepon")).toBe("call");
  });

  it("resolves Chat to chat", () => {
    expect(resolveServiceTypeFromTeam("Chat")).toBe("chat");
  });

  it("resolves Email to email", () => {
    expect(resolveServiceTypeFromTeam("Email")).toBe("email");
  });

  it("resolves Mix to cso", () => {
    expect(resolveServiceTypeFromTeam("Mix")).toBe("cso");
  });

  it("resolves BKO to bko", () => {
    expect(resolveServiceTypeFromTeam("BKO")).toBe("bko");
  });

  it("resolves SLIK to slik", () => {
    expect(resolveServiceTypeFromTeam("SLIK")).toBe("slik");
  });

  it("resolves unknown team to call", () => {
    expect(resolveServiceTypeFromTeam("IT Support")).toBe("call");
  });

  it("resolves via alias match", () => {
    expect(resolveServiceTypeFromTeam("Tim Telepon")).toBe("call");
  });

  it("resolves via case-insensitive match", () => {
    expect(resolveServiceTypeFromTeam("chat")).toBe("chat");
  });
});

describe("computeEffectiveService", () => {
  it("uses serviceOverride first", () => {
    expect(computeEffectiveService("email", "Telepon", "call")).toBe("email");
  });

  it("falls back to agentTim", () => {
    expect(computeEffectiveService(null, "Telepon", "call")).toBe("call");
    expect(computeEffectiveService(undefined, "Email", "chat")).toBe("email");
  });

  it("falls back to fallbackService", () => {
    expect(computeEffectiveService(null, null, "chat")).toBe("chat");
  });

  it("defaults to call when all null", () => {
    expect(computeEffectiveService(null, null, null)).toBe("call");
  });
});

describe("calculateSessionScoreFromTemuan", () => {
  const indicators: QAIndicator[] = [
    makeIndicator({ id: "ind-1", category: "non_critical", bobot: 2 }),
    makeIndicator({ id: "ind-2", category: "critical", bobot: 3 }),
  ];

  it("returns 100 for perfect score", () => {
    const temuan = [
      { indicator_id: "ind-1", nilai: 3 },
      { indicator_id: "ind-2", nilai: 3 },
    ];
    const score = calculateSessionScoreFromTemuan(indicators, temuan);
    expect(score).toBeCloseTo(100, 1);
  });

  it("returns 0 for all zero scores", () => {
    const temuan = [
      { indicator_id: "ind-1", nilai: 0 },
      { indicator_id: "ind-2", nilai: 0 },
    ];
    const score = calculateSessionScoreFromTemuan(indicators, temuan);
    expect(score).toBeCloseTo(0, 1);
  });

  it("calculates partial score correctly with weighted mode", () => {
    const temuan = [
      { indicator_id: "ind-1", nilai: 3 },
      { indicator_id: "ind-2", nilai: 1 },
    ];
    const score = calculateSessionScoreFromTemuan(indicators, temuan);
    // call weight: non_critical=0.50, critical=0.50
    // non_critical: ind-1 (3/3)*2/2*100 = 100
    // critical: ind-2 (1/3)*3/3*100 = 33.33
    // final = 100*0.50 + 33.33*0.50 = 66.67
    expect(score).toBeCloseTo(66.67, 1);
  });

  it("uses custom weights", () => {
    const temuan = [{ indicator_id: "ind-1", nilai: 3 }];
    const weight = DEFAULT_SERVICE_WEIGHTS["email"];
    const score = calculateSessionScoreFromTemuan(indicators, temuan, weight);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("calculateQAScoreFromTemuan", () => {
  const indicators: QAIndicator[] = [
    makeIndicator({
      id: "ind-1",
      name: "Salam",
      category: "non_critical",
      bobot: 2,
    }),
    makeIndicator({
      id: "ind-2",
      name: "Verifikasi",
      category: "critical",
      bobot: 3,
    }),
    makeIndicator({
      id: "ind-3",
      name: "Empati",
      category: "non_critical",
      bobot: 1,
    }),
  ];

  it("returns full score for empty temuan (all 3s)", () => {
    const score = calculateQAScoreFromTemuan(indicators, []);
    expect(score.finalScore).toBeCloseTo(100, 1);
    expect(score.sessionCount).toBe(0);
    expect(score.sessionScores).toEqual([]);
  });

  it("groups temuan by ticket", () => {
    const temuan = [
      { indicator_id: "ind-1", nilai: 2, no_tiket: "TKT-001" },
      { indicator_id: "ind-2", nilai: 1, no_tiket: "TKT-001" },
    ];
    const score = calculateQAScoreFromTemuan(indicators, temuan);
    expect(score.sessionCount).toBe(1);
    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.finalScore).toBeLessThan(100);
  });

  it("includes detail breakdowns", () => {
    const temuan = [
      { indicator_id: "ind-1", nilai: 2, no_tiket: "TKT-001" },
      { indicator_id: "ind-2", nilai: 3, no_tiket: "TKT-001" },
    ];
    const score = calculateQAScoreFromTemuan(indicators, temuan);
    expect(score.nonCriticalDetail.length).toBeGreaterThanOrEqual(2);
    expect(score.criticalDetail.length).toBeGreaterThanOrEqual(1);
  });

  it("handles no_category scoring mode", () => {
    const weight = DEFAULT_SERVICE_WEIGHTS["bko"];
    const temuan = [{ indicator_id: "ind-1", nilai: 3, no_tiket: "TKT-001" }];
    const score = calculateQAScoreFromTemuan(indicators, temuan, weight);
    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.nonCriticalDetail).toEqual([]);
  });

  it("limits to MAX_SAMPLING = 5 sessions", () => {
    const temuan = Array.from({ length: 10 }, (_, i) => ({
      indicator_id: "ind-1",
      nilai: i % 4,
      no_tiket: `TKT-${i}`,
    }));
    const score = calculateQAScoreFromTemuan(indicators, temuan);
    expect(score.sessionScores.length).toBeGreaterThanOrEqual(5);
    expect(score.sessionScores.length).toBeLessThanOrEqual(10);
  });

  it("pads with 100 when fewer than 5 sessions", () => {
    const temuan = [{ indicator_id: "ind-1", nilai: 3, no_tiket: "TKT-001" }];
    const score = calculateQAScoreFromTemuan(indicators, temuan);
    expect(score.sessionCount).toBe(1);
    expect(score.finalScore).toBeCloseTo(100, 1);
  });
});

describe("isAgentExcluded", () => {
  it("excludes QA folder", () => {
    expect(isAgentExcluded("tim qa", null, null)).toBe(true);
  });

  it("excludes Supervisor jabatan", () => {
    expect(isAgentExcluded(null, null, "supervisor")).toBe(true);
  });

  it("excludes by batch name", () => {
    expect(isAgentExcluded(null, "tim spv", null)).toBe(true);
  });

  it("does not exclude normal agent", () => {
    expect(isAgentExcluded("Telepon", "Batch 1", "Agent")).toBe(false);
  });

  it("handles null values", () => {
    expect(isAgentExcluded(null, null, null)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAgentExcluded("TIM QA", null, null)).toBe(true);
  });
});

describe("scoreColor / scoreBg / scoreLabel", () => {
  it("returns green for score >= 85", () => {
    expect(scoreColor(85)).toContain("green");
    expect(scoreColor(90)).toContain("green");
    expect(scoreBg(85)).toContain("green");
    expect(scoreLabel(85)).toBe("Baik");
  });

  it("returns amber for 70-84", () => {
    expect(scoreColor(70)).toContain("amber");
    expect(scoreColor(84)).toContain("amber");
    expect(scoreBg(75)).toContain("amber");
    expect(scoreLabel(72)).toBe("Cukup");
  });

  it("returns red for < 70", () => {
    expect(scoreColor(0)).toContain("red");
    expect(scoreColor(69)).toContain("red");
    expect(scoreBg(50)).toContain("red");
    expect(scoreLabel(0)).toBe("Perlu Perhatian");
    expect(scoreLabel(69)).toBe("Perlu Perhatian");
  });
});
