import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_WEIGHTS } from "../lib/scoring";
import { mergeServiceWeights } from "../services/sidak/period-scoring-context";
import type { ServiceType, ServiceWeight } from "@trainers/types";

describe("DEFAULT_SERVICE_WEIGHTS", () => {
  it("contains all 7 service types", () => {
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

  it("each weight has valid ServiceWeight shape", () => {
    for (const [svc, w] of Object.entries(DEFAULT_SERVICE_WEIGHTS)) {
      expect(w.service_type).toBe(svc);
      expect(w.critical_weight).toBeGreaterThanOrEqual(0);
      expect(w.critical_weight).toBeLessThanOrEqual(1);
      expect(w.non_critical_weight).toBeGreaterThanOrEqual(0);
      expect(w.non_critical_weight).toBeLessThanOrEqual(1);
      expect(["weighted", "flat", "no_category"]).toContain(w.scoring_mode);
    }
  });

  it("critical_weight + non_critical_weight ≈ 1 for each service", () => {
    for (const w of Object.values(DEFAULT_SERVICE_WEIGHTS)) {
      expect(
        Math.abs(w.critical_weight + w.non_critical_weight - 1),
      ).toBeLessThan(0.01);
    }
  });

  it("pencatatan uses flat mode, bko uses no_category, others use weighted", () => {
    expect(DEFAULT_SERVICE_WEIGHTS.pencatatan.scoring_mode).toBe("flat");
    expect(DEFAULT_SERVICE_WEIGHTS.bko.scoring_mode).toBe("no_category");
    expect(DEFAULT_SERVICE_WEIGHTS.call.scoring_mode).toBe("weighted");
    expect(DEFAULT_SERVICE_WEIGHTS.chat.scoring_mode).toBe("weighted");
    expect(DEFAULT_SERVICE_WEIGHTS.email.scoring_mode).toBe("weighted");
    expect(DEFAULT_SERVICE_WEIGHTS.cso.scoring_mode).toBe("weighted");
    expect(DEFAULT_SERVICE_WEIGHTS.slik.scoring_mode).toBe("weighted");
  });
});

describe("mergeServiceWeights (production)", () => {
  it("builds resolved weights by merging DB overrides with defaults", () => {
    const rawWeights: ServiceWeight[] = [
      {
        service_type: "call",
        critical_weight: 0.7,
        non_critical_weight: 0.3,
        scoring_mode: "weighted",
      },
    ];
    const resolvedWeights = mergeServiceWeights(
      DEFAULT_SERVICE_WEIGHTS,
      rawWeights,
    );
    expect(resolvedWeights.call.critical_weight).toBe(0.7);
    expect(resolvedWeights.call.non_critical_weight).toBe(0.3);
    expect(resolvedWeights.chat).toEqual(DEFAULT_SERVICE_WEIGHTS.chat);
  });

  it("falls back to DEFAULT_SERVICE_WEIGHTS when DB returns empty", () => {
    const resolvedWeights = mergeServiceWeights(DEFAULT_SERVICE_WEIGHTS, []);
    expect(resolvedWeights).toEqual(DEFAULT_SERVICE_WEIGHTS);
  });

  it("works when DB has partial services (not all 7)", () => {
    const rawWeights: ServiceWeight[] = [
      {
        service_type: "email",
        critical_weight: 0.8,
        non_critical_weight: 0.2,
        scoring_mode: "weighted",
      },
      {
        service_type: "slik",
        critical_weight: 0.9,
        non_critical_weight: 0.1,
        scoring_mode: "weighted",
      },
    ];
    const resolvedWeights = mergeServiceWeights(
      DEFAULT_SERVICE_WEIGHTS,
      rawWeights,
    );
    expect(resolvedWeights.email.critical_weight).toBe(0.8);
    expect(resolvedWeights.slik.critical_weight).toBe(0.9);
    expect(resolvedWeights.call).toEqual(DEFAULT_SERVICE_WEIGHTS.call);
    expect(resolvedWeights.bko).toEqual(DEFAULT_SERVICE_WEIGHTS.bko);
  });

  it("handles numeric string coercion from DB rows", () => {
    const rawWeights = [
      {
        service_type: "email" as ServiceType,
        critical_weight: "0.8" as unknown as number,
        non_critical_weight: "0.2" as unknown as number,
        scoring_mode: "weighted" as const,
      },
    ];
    const resolvedWeights = mergeServiceWeights(
      DEFAULT_SERVICE_WEIGHTS,
      rawWeights,
    );
    expect(resolvedWeights.email.critical_weight).toBe(0.8);
    expect(resolvedWeights.email.non_critical_weight).toBe(0.2);
  });
});
