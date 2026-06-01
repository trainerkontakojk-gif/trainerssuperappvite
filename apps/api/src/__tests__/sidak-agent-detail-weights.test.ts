import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_WEIGHTS } from "../lib/scoring";
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
      expect(Math.abs(w.critical_weight + w.non_critical_weight - 1)).toBeLessThan(
        0.01,
      );
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

describe("getAgentDetail — weights resolution contract", () => {
  it("builds resolvedWeights by merging DB overrides with defaults", () => {
    const rawWeights = [
      { service_type: "call" as const, critical_weight: 0.7, non_critical_weight: 0.3, scoring_mode: "weighted" as const },
    ];
    const resolvedWeights: Record<string, ServiceWeight> = {
      ...DEFAULT_SERVICE_WEIGHTS,
    } as unknown as Record<string, ServiceWeight>;
    for (const w of rawWeights) {
      const st = w.service_type as ServiceType;
      if (resolvedWeights[st]) {
        resolvedWeights[st] = {
          service_type: st,
          critical_weight: Number(w.critical_weight ?? resolvedWeights[st].critical_weight),
          non_critical_weight: Number(w.non_critical_weight ?? resolvedWeights[st].non_critical_weight),
          scoring_mode: w.scoring_mode ?? resolvedWeights[st].scoring_mode,
        };
      }
    }
    // call should be overridden
    expect(resolvedWeights.call.critical_weight).toBe(0.7);
    expect(resolvedWeights.call.non_critical_weight).toBe(0.3);
    // chat should remain default
    expect(resolvedWeights.chat).toEqual(DEFAULT_SERVICE_WEIGHTS.chat);
  });

  it("falls back to DEFAULT_SERVICE_WEIGHTS when DB returns empty", () => {
    const rawWeights: any[] = [];
    const resolvedWeights: Record<string, ServiceWeight> = {
      ...DEFAULT_SERVICE_WEIGHTS,
    } as unknown as Record<string, ServiceWeight>;
    for (const w of rawWeights) {
      const st = w.service_type as ServiceType;
      if (resolvedWeights[st]) {
        resolvedWeights[st] = {
          service_type: st,
          critical_weight: Number(w.critical_weight ?? resolvedWeights[st].critical_weight),
          non_critical_weight: Number(w.non_critical_weight ?? resolvedWeights[st].non_critical_weight),
          scoring_mode: w.scoring_mode ?? resolvedWeights[st].scoring_mode,
        };
      }
    }
    expect(resolvedWeights).toEqual(DEFAULT_SERVICE_WEIGHTS);
  });

  it("works when DB has partial services (not all 7)", () => {
    const rawWeights = [
      { service_type: "email" as const, critical_weight: 0.8, non_critical_weight: 0.2, scoring_mode: "weighted" as const },
      { service_type: "slik" as const, critical_weight: 0.9, non_critical_weight: 0.1, scoring_mode: "weighted" as const },
    ];
    const resolvedWeights: Record<string, ServiceWeight> = {
      ...DEFAULT_SERVICE_WEIGHTS,
    } as unknown as Record<string, ServiceWeight>;
    for (const w of rawWeights) {
      const st = w.service_type as ServiceType;
      if (resolvedWeights[st]) {
        resolvedWeights[st] = {
          service_type: st,
          critical_weight: Number(w.critical_weight ?? resolvedWeights[st].critical_weight),
          non_critical_weight: Number(w.non_critical_weight ?? resolvedWeights[st].non_critical_weight),
          scoring_mode: w.scoring_mode ?? resolvedWeights[st].scoring_mode,
        };
      }
    }
    expect(resolvedWeights.email.critical_weight).toBe(0.8);
    expect(resolvedWeights.slik.critical_weight).toBe(0.9);
    // non-overridden services should keep defaults
    expect(resolvedWeights.call).toEqual(DEFAULT_SERVICE_WEIGHTS.call);
    expect(resolvedWeights.bko).toEqual(DEFAULT_SERVICE_WEIGHTS.bko);
  });
});
