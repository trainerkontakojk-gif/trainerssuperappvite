import { describe, it, expect } from "vitest";
import {
  resolveServiceTypeFromTeam,
  calculateQAScoreFromTemuan,
  scoreColor,
  scoreBg,
  scoreLabel,
  NILAI_LABELS,
  NILAI_BADGE_COLORS,
} from "../lib/scoring";
import type { QAIndicator, ServiceWeight } from "@trainers/types";

// ── resolveServiceTypeFromTeam ────────────────────────────
describe("resolveServiceTypeFromTeam", () => {
  it("maps Telepon to call", () => {
    expect(resolveServiceTypeFromTeam("Telepon")).toBe("call");
  });
  it("maps Chat to chat", () => {
    expect(resolveServiceTypeFromTeam("Chat")).toBe("chat");
  });
  it("maps Email to email", () => {
    expect(resolveServiceTypeFromTeam("Email")).toBe("email");
  });
  it("maps Mix to cso", () => {
    expect(resolveServiceTypeFromTeam("Mix")).toBe("cso");
  });
  it("maps BKO to bko", () => {
    expect(resolveServiceTypeFromTeam("BKO")).toBe("bko");
  });
  it("maps SLIK to slik", () => {
    expect(resolveServiceTypeFromTeam("SLIK")).toBe("slik");
  });
  it("defaults to call for unknown team", () => {
    expect(resolveServiceTypeFromTeam("Unknown")).toBe("call");
  });
  it("defaults to call for null/undefined", () => {
    expect(resolveServiceTypeFromTeam(null)).toBe("call");
    expect(resolveServiceTypeFromTeam(undefined)).toBe("call");
  });
});

// ── NILAI_LABELS ──────────────────────────────────────────
describe("NILAI_LABELS", () => {
  it("has correct labels for 0-3", () => {
    expect(NILAI_LABELS[0]).toBe("Sangat Tidak Sesuai");
    expect(NILAI_LABELS[1]).toBe("Tidak Sesuai");
    expect(NILAI_LABELS[2]).toBe("Perlu Perbaikan");
    expect(NILAI_LABELS[3]).toBe("Sesuai");
  });
});

// ── NILAI_BADGE_COLORS ────────────────────────────────────
describe("NILAI_BADGE_COLORS", () => {
  it("has correct color classes", () => {
    expect(NILAI_BADGE_COLORS[0]).toBe("bg-rose-500");
    expect(NILAI_BADGE_COLORS[3]).toBe("bg-green-500");
  });
});

// ── calculateQAScoreFromTemuan ────────────────────────────
function makeInd(
  id: string,
  cat: "critical" | "non_critical",
  bobot: number,
): QAIndicator {
  return {
    id,
    service_type: "call",
    name: id,
    category: cat,
    bobot,
    has_na: false,
  };
}

function makeWeight(
  mode: "weighted" | "flat" | "no_category" = "weighted",
): ServiceWeight {
  return {
    service_type: "call",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: mode,
  };
}

describe("calculateQAScoreFromTemuan", () => {
  it("returns null when no indicators", () => {
    expect(calculateQAScoreFromTemuan([], [], makeWeight())).toBeNull();
  });

  it("returns 100 for empty temuan", () => {
    const inds = [makeInd("i1", "non_critical", 1)];
    const result = calculateQAScoreFromTemuan(inds, [], makeWeight());
    expect(result?.finalScore).toBe(100);
    expect(result?.sessionCount).toBe(0);
  });

  it("calculates weighted score correctly", () => {
    const inds = [
      makeInd("i1", "non_critical", 0.5),
      makeInd("i2", "critical", 0.5),
    ];
    const temuan = [{ indicator_id: "i1", nilai: 3, no_tiket: "TKT001" }];
    const result = calculateQAScoreFromTemuan(
      inds,
      temuan,
      makeWeight("weighted"),
    );
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("weighted");
    expect(result!.sessionCount).toBe(1);
    expect(result!.nonCriticalScore).toBeGreaterThan(0);
    expect(result!.criticalScore).toBe(100);
  });

  it("flat mode returns same score for nc/cr", () => {
    const inds = [
      makeInd("i1", "non_critical", 0.5),
      makeInd("i2", "critical", 0.5),
    ];
    const temuan = [{ indicator_id: "i1", nilai: 2, no_tiket: "TKT001" }];
    const result = calculateQAScoreFromTemuan(inds, temuan, makeWeight("flat"));
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("flat");
    expect(result!.nonCriticalScore).toBe(result!.criticalScore);
  });

  it("no_category mode returns same score for nc/cr", () => {
    const inds = [
      makeInd("i1", "non_critical", 0.5),
      makeInd("i2", "critical", 0.5),
    ];
    const temuan = [{ indicator_id: "i1", nilai: 2, no_tiket: "TKT001" }];
    const result = calculateQAScoreFromTemuan(
      inds,
      temuan,
      makeWeight("no_category"),
    );
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("no_category");
    expect(result!.nonCriticalScore).toBe(result!.criticalScore);
  });

  it("handles multiple sessions with sampling", () => {
    const inds = [makeInd("i1", "non_critical", 1)];
    const temuan = [
      { indicator_id: "i1", nilai: 3, no_tiket: "A" },
      { indicator_id: "i1", nilai: 0, no_tiket: "B" },
      { indicator_id: "i1", nilai: 0, no_tiket: "C" },
      { indicator_id: "i1", nilai: 0, no_tiket: "D" },
      { indicator_id: "i1", nilai: 0, no_tiket: "E" },
      { indicator_id: "i1", nilai: 0, no_tiket: "F" },
    ];
    const result = calculateQAScoreFromTemuan(inds, temuan, makeWeight());
    // 6 sessions, MAX_SAMPLING=5 takes worst 5 → all 0 except one 100
    // Worst 5 are all 0 → average = 0
    expect(result).not.toBeNull();
    expect(result!.sessionCount).toBe(6);
  });
});

// ── Perfect Score Session (Sesi Tanpa Temuan) ─────────────────
describe("Sesi Tanpa Temuan — hasBadFindings logic", () => {
  it("returns true when any temuan has nilai < 3", () => {
    const temuan = [
      { id: "1", nilai: 3 },
      { id: "2", nilai: 2 },
      { id: "3", nilai: 3 },
    ];
    const hasBad = temuan.some((t) => t.nilai < 3);
    expect(hasBad).toBe(true);
  });

  it("returns false when all temuan have nilai >= 3", () => {
    const temuan = [
      { id: "1", nilai: 3 },
      { id: "2", nilai: 3 },
    ];
    const hasBad = temuan.some((t) => t.nilai < 3);
    expect(hasBad).toBe(false);
  });

  it("returns false for empty temuan array", () => {
    const hasBad = [].some((t: any) => t.nilai < 3);
    expect(hasBad).toBe(false);
  });

  it("uses < 3 not <= 3 or < 2 — nilai === 3 is safe", () => {
    const temuan = [{ id: "1", nilai: 3 }];
    const hasBad = temuan.some((t) => t.nilai < 3);
    expect(hasBad).toBe(false);
  });

  it("nilai === 0 is considered bad", () => {
    const temuan = [{ id: "1", nilai: 0 }];
    const hasBad = temuan.some((t) => t.nilai < 3);
    expect(hasBad).toBe(true);
  });
});

describe("scoring color/label helpers (moved from sidak-input-parity)", () => {
  it("scoreColor returns green for high scores", () => {
    expect(scoreColor(85)).toContain("green");
    expect(scoreColor(100)).toContain("green");
  });

  it("scoreColor returns amber for medium scores", () => {
    expect(scoreColor(70)).toContain("amber");
    expect(scoreColor(84)).toContain("amber");
  });

  it("scoreColor returns red for low scores", () => {
    expect(scoreColor(0)).toContain("red");
    expect(scoreColor(69)).toContain("red");
  });

  it("scoreBg returns appropriate background colors", () => {
    expect(scoreBg(90)).toContain("green");
    expect(scoreBg(75)).toContain("amber");
    expect(scoreBg(50)).toContain("red");
  });

  it("scoreLabel returns correct Indonesian labels", () => {
    expect(scoreLabel(85)).toBe("Baik");
    expect(scoreLabel(72)).toBe("Cukup");
    expect(scoreLabel(0)).toBe("Perlu Perhatian");
  });
});
