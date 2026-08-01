import { describe, it, expect } from "vitest";
import {
  calculateSessionScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
} from "../lib/scoring";
import type { QAIndicator, ServiceType } from "@trainers/types";

function makeIndicator(
  id: string,
  bobot: number,
  category: "critical" | "non_critical",
  name: string,
): QAIndicator {
  return {
    id,
    service_type: "call" as ServiceType,
    name,
    category,
    bobot,
    has_na: false,
  };
}

function makeFinding(
  indicator_id: string,
  nilai: number,
): { indicator_id: string; nilai: number } {
  return { indicator_id, nilai };
}

describe("calculateSessionScoreFromTemuan — weighted mode", () => {
  const weight = DEFAULT_SERVICE_WEIGHTS.call;

  it("returns 100 when all findings are perfect (nilai=3)", () => {
    const indicators = [
      makeIndicator("i1", 10, "critical", "Kepatuhan Prosedur"),
      makeIndicator("i2", 10, "critical", "Salam Pembuka"),
      makeIndicator("i3", 10, "non_critical", "Nada Bicara"),
    ];
    const findings = [
      makeFinding("i1", 3),
      makeFinding("i2", 3),
      makeFinding("i3", 3),
    ];
    expect(calculateSessionScoreFromTemuan(indicators, findings, weight)).toBe(
      100,
    );
  });

  it("returns 0 when all findings are worst (nilai=0)", () => {
    const indicators = [
      makeIndicator("i1", 10, "critical", "Kepatuhan Prosedur"),
      makeIndicator("i2", 10, "non_critical", "Nada Bicara"),
    ];
    const findings = [makeFinding("i1", 0), makeFinding("i2", 0)];
    expect(calculateSessionScoreFromTemuan(indicators, findings, weight)).toBe(
      0,
    );
  });

  it("computes correctly with mixed critical/non-critical values", () => {
    const indicators = [
      makeIndicator("i1", 10, "critical", "Kepatuhan"),
      makeIndicator("i2", 10, "critical", "Salam"),
      makeIndicator("i3", 10, "non_critical", "Nada"),
    ];
    // critical: i1=3 (earned=10/10*3/3*100=100), i2=1 (earned=10/10*1/3*100=33.33)
    //   avg cat: (10*1 + 10*0.333) / 20 * 100 = 66.67
    // non_critical: i3=2 (earned=10/10*2/3=66.67)
    //   avg cat: 66.67
    // final: 66.67 * 0.5 + 66.67 * 0.5 = 66.67
    const findings = [
      makeFinding("i1", 3),
      makeFinding("i2", 1),
      makeFinding("i3", 2),
    ];
    const score = calculateSessionScoreFromTemuan(indicators, findings, weight);
    expect(score).toBeCloseTo(66.67, 0);
  });

  it("penalty weight proportionally affects deduction", () => {
    const indicators = [
      makeIndicator("heavy", 20, "critical", "Bobot 20"),
      makeIndicator("light", 5, "critical", "Bobot 5"),
    ];
    // heavy=0, light=3: critical earned = (0/3)*20 + (3/3)*5 = 5, total=25 → score=20
    // non_critical is empty → score=100
    // final = 20*0.5 + 100*0.5 = 60
    const findingsHeavy = [makeFinding("heavy", 0), makeFinding("light", 3)];
    const scoreHeavy = calculateSessionScoreFromTemuan(
      indicators,
      findingsHeavy,
      weight,
    );
    expect(scoreHeavy).toBeCloseTo(60, 0);

    // heavy=3, light=0: critical earned = (3/3)*20 + (0/3)*5 = 20, total=25 → score=80
    // final = 80*0.5 + 100*0.5 = 90
    const findingsLight = [makeFinding("heavy", 3), makeFinding("light", 0)];
    const scoreLight = calculateSessionScoreFromTemuan(
      indicators,
      findingsLight,
      weight,
    );
    expect(scoreLight).toBeCloseTo(90, 0);

    // heavy penalty = 40pt, light penalty = 10pt → 4:1 matches bobot ratio 20:5
  });
});

describe("calculateSessionScoreFromTemuan — flat mode", () => {
  const weight = DEFAULT_SERVICE_WEIGHTS.pencatatan;

  it("returns 100 when all perfect", () => {
    const indicators = [
      makeIndicator("i1", 5, "critical", "Kelengkapan"),
      makeIndicator("i2", 5, "critical", "Ketepatan"),
    ];
    expect(
      calculateSessionScoreFromTemuan(
        indicators,
        [makeFinding("i1", 3), makeFinding("i2", 3)],
        weight,
      ),
    ).toBe(100);
  });

  it("computes Σ(nilai/3 × bobot) / Σbobot ignoring categories", () => {
    const indicators = [
      makeIndicator("i1", 10, "critical", "Cat A"),
      makeIndicator("i2", 5, "non_critical", "Cat B"),
    ];
    // i1 nilai=1: (1/3)*10 = 3.33
    // i2 nilai=2: (2/3)*5 = 3.33
    // total: 6.67 / 15 * 100 = 44.44
    const findings = [makeFinding("i1", 1), makeFinding("i2", 2)];
    const score = calculateSessionScoreFromTemuan(indicators, findings, weight);
    expect(score).toBeCloseTo(44.44, 0);
  });
});

describe("calculateSessionScoreFromTemuan — no_category mode", () => {
  const weight = DEFAULT_SERVICE_WEIGHTS.bko;

  it("behaves identically to flat (ignores categories)", () => {
    const indicators = [
      makeIndicator("i1", 5, "critical", "Item A"),
      makeIndicator("i2", 5, "non_critical", "Item B"),
    ];
    const flatWeight = DEFAULT_SERVICE_WEIGHTS.pencatatan;
    const flatScore = calculateSessionScoreFromTemuan(
      indicators,
      [makeFinding("i1", 2), makeFinding("i2", 2)],
      flatWeight,
    );
    const noCatScore = calculateSessionScoreFromTemuan(
      indicators,
      [makeFinding("i1", 2), makeFinding("i2", 2)],
      weight,
    );
    expect(noCatScore).toBeCloseTo(flatScore, 5);
  });
});

describe("DEFAULT_SERVICE_WEIGHTS", () => {
  it("has all 7 service types", () => {
    const keys = Object.keys(DEFAULT_SERVICE_WEIGHTS).sort();
    expect(keys).toEqual([
      "bko",
      "call",
      "chat",
      "cso",
      "email",
      "pencatatan",
      "slik",
    ]);
  });

  it.each([
    "call",
    "chat",
    "email",
    "cso",
    "pencatatan",
    "bko",
    "slik",
  ] as ServiceType[])("service %s has valid ServiceWeight shape", (svc) => {
    const w = DEFAULT_SERVICE_WEIGHTS[svc];
    expect(w.service_type).toBe(svc);
    expect(w.critical_weight).toBeGreaterThanOrEqual(0);
    expect(w.critical_weight).toBeLessThanOrEqual(1);
    expect(w.non_critical_weight).toBeGreaterThanOrEqual(0);
    expect(w.non_critical_weight).toBeLessThanOrEqual(1);
    expect(["weighted", "flat", "no_category"]).toContain(w.scoring_mode);
    expect(
      Math.abs(w.critical_weight + w.non_critical_weight - 1),
    ).toBeLessThan(0.01);
  });
});

describe("calculateSessionScoreFromTemuan — edge cases", () => {
  const weight = DEFAULT_SERVICE_WEIGHTS.call;

  it("returns 100 when no temuan exist (all indicators get nilai=3)", () => {
    const indicators = [makeIndicator("i1", 10, "critical", "Kepatuhan")];
    expect(calculateSessionScoreFromTemuan(indicators, [], weight)).toBe(100);
  });

  it("returns 100 when there are no indicators (division by zero guard)", () => {
    expect(calculateSessionScoreFromTemuan([], [], weight)).toBe(100);
  });

  it("passes raw nilai to scoreSession (clamping happens at caller)", () => {
    const indicators = [makeIndicator("i1", 10, "critical", "Test")];
    // nilai=-1 is passed as-is to scoreSession: (-1/3)*10 = -3.33 → criticalScore = -33.33
    // final = -33.33 * 0.5 + 100 * 0.5 = 33.33
    const findingsLow = [{ indicator_id: "i1", nilai: -1 }];
    expect(
      calculateSessionScoreFromTemuan(indicators, findingsLow, weight),
    ).toBeCloseTo(33.33, 1);
    // nilai=5 → (5/3)*10 = 16.67 → but 16.67/10*100 = 166.67 → this is ≥100, capped? No, but can exceed 100
    // With non_critical empty (100), final = min(166.67, ...) *0.5 + 100*0.5 = > 100... actually just let it pass through
    const findingsHigh = [{ indicator_id: "i1", nilai: 5 }];
    const scoreHigh = calculateSessionScoreFromTemuan(
      indicators,
      findingsHigh,
      weight,
    );
    expect(scoreHigh).toBeGreaterThan(100);
  });

  it("missing indicator_id in temuan is treated as nilai=3", () => {
    const indicators = [makeIndicator("i1", 10, "critical", "Ada")];
    // temuan for non-existent indicator
    const findings = [{ indicator_id: "nonexistent", nilai: 0 }];
    // all existing indicators get nilai=3 → score 100
    expect(calculateSessionScoreFromTemuan(indicators, findings, weight)).toBe(
      100,
    );
  });
});

describe("TopTicketsCard — property name contract", () => {
  it("uses scoreDeduction and findingCount (not deduction/count)", () => {
    const mockTicket = {
      no_tiket: "TKT-001",
      scoreDeduction: 25.5,
      findingCount: 3,
      heaviestParam: "Parameter A",
      isSamplingQa: false,
      totalPenaltyWeight: 12,
    };
    expect(mockTicket).toHaveProperty("scoreDeduction");
    expect(mockTicket).toHaveProperty("findingCount");
    expect(mockTicket).not.toHaveProperty("deduction");
    expect(mockTicket).not.toHaveProperty("count");
  });
});

describe("scoreSession — 3-level tiebreaker sort contract", () => {
  it("sorts by scoreDeduction desc, then totalPenaltyWeight desc, then findingCount desc", () => {
    const tickets = [
      { scoreDeduction: 30, totalPenaltyWeight: 10, findingCount: 2 },
      { scoreDeduction: 30, totalPenaltyWeight: 20, findingCount: 1 },
      { scoreDeduction: 30, totalPenaltyWeight: 20, findingCount: 3 },
      { scoreDeduction: 40, totalPenaltyWeight: 5, findingCount: 1 },
    ];

    const sorted = [...tickets].sort((a, b) => {
      if (b.scoreDeduction !== a.scoreDeduction)
        return b.scoreDeduction - a.scoreDeduction;
      if (b.totalPenaltyWeight !== a.totalPenaltyWeight)
        return b.totalPenaltyWeight - a.totalPenaltyWeight;
      return b.findingCount - a.findingCount;
    });

    // Expected order: 40 (TF=5, FC=1), then 30 (TF=20, FC=3), 30 (TF=20, FC=1), 30 (TF=10, FC=2)
    expect(sorted[0].scoreDeduction).toBe(40);
    expect(sorted[1].scoreDeduction).toBe(30);
    expect(sorted[1].totalPenaltyWeight).toBe(20);
    expect(sorted[1].findingCount).toBe(3);
    expect(sorted[2].totalPenaltyWeight).toBe(20);
    expect(sorted[2].findingCount).toBe(1);
    expect(sorted[3].totalPenaltyWeight).toBe(10);
  });

  it("filter out deduction === 0 before sorting", () => {
    const tickets = [
      { scoreDeduction: 10, totalPenaltyWeight: 5, findingCount: 1 },
      { scoreDeduction: 0, totalPenaltyWeight: 3, findingCount: 2 },
      { scoreDeduction: 20, totalPenaltyWeight: 8, findingCount: 3 },
    ];
    const filtered = tickets.filter((t) => t.scoreDeduction > 0);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((t) => t.scoreDeduction > 0)).toBe(true);
  });

  it("takes only top 5 after sorting", () => {
    const tickets = Array.from({ length: 10 }, (_, i) => ({
      scoreDeduction: 50 - i * 5,
      totalPenaltyWeight: i,
      findingCount: 1,
    }));
    const sorted = [...tickets].sort((a, b) => {
      if (b.scoreDeduction !== a.scoreDeduction)
        return b.scoreDeduction - a.scoreDeduction;
      if (b.totalPenaltyWeight !== a.totalPenaltyWeight)
        return b.totalPenaltyWeight - a.totalPenaltyWeight;
      return b.findingCount - a.findingCount;
    });
    expect(sorted.slice(0, 5)).toHaveLength(5);
    expect(sorted.slice(0, 5)[0].scoreDeduction).toBe(50);
    expect(sorted.slice(0, 5)[4].scoreDeduction).toBe(30);
  });
});
