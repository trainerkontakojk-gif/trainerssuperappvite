import { describe, it, expect, vi, beforeEach } from "vitest";

function buildQuery(onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(onAwait());
        }
        return () => q;
      },
    },
  );
  return q;
}

let pendingResolve: (table?: string) => any = () => ({ data: [], error: null });

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => buildQuery(() => pendingResolve(table))),
  },
  createAdminClient: vi.fn(),
}));


vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn().mockResolvedValue({ success: true, text: '{"executiveSummary": "test summary"}' }),
}));

vi.mock("../lib/openrouter", () => ({
  generateOpenRouterContent: vi.fn().mockResolvedValue({ success: true, text: '{"executiveSummary": "test summary"}' }),
}));

import * as sidakService from "../services/sidak-service";

describe("sidak-service", () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  describe("getPeriods", () => {
    it("returns periods ordered by desc", async () => {
      const fake = [{ id: "1", month: 1, year: 2025 }];
      pendingResolve = () => ({ data: fake, error: null });

      const result = await sidakService.getPeriods();
      expect(result).toEqual(fake);
    });

    it("returns [] when null", async () => {
      pendingResolve = () => ({ data: null, error: null });
      expect(await sidakService.getPeriods()).toEqual([]);
    });
  });

  describe("createPeriod", () => {
    it("adds label", async () => {
      pendingResolve = () => ({
        data: { id: "1", month: 3, year: 2025 },
        error: null,
      });
      const r = await sidakService.createPeriod(3, 2025);
      expect(r.label).toBe("03/2025");
    });

    it("throws on error", async () => {
      pendingResolve = () => ({ data: null, error: { message: "dup" } });
      await expect(sidakService.createPeriod(1, 2025)).rejects.toThrow(
        "Failed to create period",
      );
    });
  });

  describe("deletePeriod", () => {
    it("fails closed when verification query returns error", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1)
          return { count: null, error: { message: "timeout" } };
        if (callCount === 2) return { count: 0, error: null };
        return { data: null, error: null };
      };
      await expect(sidakService.deletePeriod("pid")).rejects.toThrow(
        "Gagal memverifikasi status periode.",
      );
    });

    it("blocks delete when temuan exist", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { count: 5, error: null };
        return { data: null, error: null };
      };
      await expect(sidakService.deletePeriod("pid")).rejects.toThrow(
        "Periode ini sudah memiliki data temuan dan tidak bisa dihapus.",
      );
    });

    it("blocks delete when rule versions reference the period", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { count: 0, error: null };
        if (callCount === 2) return { count: 3, error: null };
        return { data: null, error: null };
      };
      await expect(sidakService.deletePeriod("pid")).rejects.toThrow(
        "Periode ini masih digunakan oleh versi aturan QA",
      );
    });

    it("deletes when no references exist", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { count: 0, error: null };
        if (callCount === 2) return { count: 0, error: null };
        return { data: null, error: null };
      };
      const r = await sidakService.deletePeriod("pid");
      expect(r.success).toBe(true);
    });
  });

  describe("getIndicators", () => {
    it("filters by service type", async () => {
      pendingResolve = () => ({ data: [{ id: "1" }], error: null });
      expect(await sidakService.getIndicators("call")).toHaveLength(1);
    });

    it("all without type", async () => {
      pendingResolve = () => ({
        data: [{ id: "1" }, { id: "2" }],
        error: null,
      });
      expect(await sidakService.getIndicators()).toHaveLength(2);
    });
  });

  describe("createTemuanBatch", () => {
    it("inserts valid rows after validation", async () => {
      let callCount = 0;
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") return { data: [{ id: "i1", name: "Test", service_type: "call" }], error: null };
        if (table === "qa_temuan") {
          callCount++;
          if (callCount === 1) return { data: [], error: null }; // select (existing)
          return { data: [{ id: "t1" }], error: null }; // insert
        }
        return { data: [], error: null };
      };
      const r = await sidakService.createTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [{ indicator_id: "i1", nilai: 2 }],
      });
      expect(r.inserted).toBe(1);
    });

    it("returns 0 for indicator not matching service_type", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") return { data: [{ id: "i1", name: "Wrong", service_type: "email" }], error: null };
        if (table === "qa_temuan") return { data: [], error: null };
        return { data: [], error: null };
      };
      const r = await sidakService.createTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [{ indicator_id: "i1", nilai: 0 }],
      });
      expect(r.inserted).toBe(0);
    });

    it("friendly msg for FK error", async () => {
      let callCount = 0;
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") return { data: [{ id: "i1", name: "Test", service_type: "call" }], error: null };
        if (table === "qa_temuan") {
          callCount++;
          if (callCount === 1) return { data: [], error: null }; // select (existing)
          return {
            data: null,
            error: { message: "violates foreign key constraint" },
          }; // insert fails
        }
        return { data: [], error: null };
      };
      await expect(
        sidakService.createTemuanBatch({
          peserta_id: "bad",
          period_id: "bad",
          service_type: "call",
          items: [{ indicator_id: "i1", nilai: 0 }],
        }),
      ).rejects.toThrow("Data tidak valid");
    });

  });

  describe("getTemuan", () => {
    it("applies filters", async () => {
      pendingResolve = () => ({ data: [{ id: "t1" }], count: 1, error: null });
      const r = await sidakService.getTemuan({
        peserta_id: "p1",
        service_type: "call",
      });
      expect(r.total).toBe(1);
    });

    it("returns empty data for an explicit empty agent scope", async () => {
      pendingResolve = () => {
        throw new Error("empty agent scope should not query qa_temuan");
      };

      await expect(sidakService.getTemuan({ agent_ids: [] })).resolves.toEqual({
        data: [],
        total: 0,
      });
    });
  });

  describe("deleteTemuan", () => {
    it("deletes by id", async () => {
      pendingResolve = () => ({ error: null });
      await expect(sidakService.deleteTemuan("t1")).resolves.toBeUndefined();
    });
  });

  describe("getAgents", () => {
    it("searches by name", async () => {
      pendingResolve = () => ({
        data: [{ id: "a1", nama: "Budi" }],
        error: null,
      });
      const r = await sidakService.getAgents({ search: "Budi" });
      expect(r).toHaveLength(1);
    });
  });

  describe("saveReportArchive", () => {
    it("inserts and returns with id", async () => {
      pendingResolve = () => ({
        data: {
          id: "r1",
          title: "Test",
          report_type: "ai",
          created_at: "2025-01-01",
        },
        error: null,
      });
      const r = await sidakService.saveReportArchive({
        userId: "u1",
        title: "Test",
        reportType: "ai",
        filterParams: {},
        reportData: { summary: "test" },
      });
      expect(r.id).toBe("r1");
      expect(r.report_type).toBe("ai");
    });

    it("throws on error", async () => {
      pendingResolve = () => ({
        data: null,
        error: { message: "insert failed" },
      });
      await expect(
        sidakService.saveReportArchive({
          userId: "u1",
          title: "Test",
          reportType: "ai",
          filterParams: {},
          reportData: {},
        }),
      ).rejects.toThrow("Gagal menyimpan report");
    });
  });

  describe("getReportArchives", () => {
    it("returns list for admin", async () => {
      pendingResolve = () => ({
        data: [{ id: "r1", title: "Report 1" }],
        error: null,
      });
      const r = await sidakService.getReportArchives("u1", "admin");
      expect(r).toHaveLength(1);
    });

    it("returns [] when null", async () => {
      pendingResolve = () => ({ data: null, error: null });
      const r = await sidakService.getReportArchives("u1", "agent");
      expect(r).toEqual([]);
    });
  });

  describe("getReportArchiveById", () => {
    it("returns report for owner", async () => {
      pendingResolve = () => ({
        data: { id: "r1", title: "My Report", user_id: "u1" },
        error: null,
      });
      const r = await sidakService.getReportArchiveById("r1", "u1", "agent");
      expect(r).not.toBeNull();
      expect(r!.id).toBe("r1");
    });

    it("returns null for other user", async () => {
      pendingResolve = () => ({
        data: { id: "r1", user_id: "u2" },
        error: null,
      });
      const r = await sidakService.getReportArchiveById("r1", "u1", "agent");
      expect(r).toBeNull();
    });

    it("returns null for non-existent", async () => {
      pendingResolve = () => ({ data: null, error: { message: "not found" } });
      const r = await sidakService.getReportArchiveById("bad", "u1", "agent");
      expect(r).toBeNull();
    });
  });

  describe("deleteReportArchive", () => {
    it("deletes successfully", async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        sidakService.deleteReportArchive("r1", "u1", "admin"),
      ).resolves.toBeUndefined();
    });
  });

  describe("refreshDashboardSummary", () => {
    it("returns early when no temuan", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount <= 2) return { data: [], error: null };
        return { data: [], error: null };
      };
      const r = await sidakService.refreshDashboardSummary("p1", "call");
      expect(r.agent_count).toBe(0);
      expect(r.message).toBe("No data to summarize");
    });

    it("aggregates and stores summary with temuan", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1)
          return {
            data: [
              { id: "i1", name: "Test", service_type: "call", category: "non_critical", bobot: 1 },
            ],
            error: null,
          };
        if (callCount === 2)
          return {
            data: [
              {
                service_type: "call",
                critical_weight: 0.5,
                non_critical_weight: 0.5,
                scoring_mode: "weighted",
              },
            ],
            error: null,
          };
        if (callCount === 3)
          return {
            data: [
              {
                peserta_id: "a1",
                service_type: "call",
                indicator_id: "i1",
                nilai: 2,
                is_phantom_padding: false,
                profiler_peserta: {
                  id: "a1",
                  nama: "Agent 1",
                  batch_name: "B1",
                  tim: "T1",
                  jabatan: "Agent",
                },
              },
            ],
            error: null,
          };
        if (callCount === 4 || callCount === 5)
          return { data: null, error: null };
        if (callCount === 6 || callCount === 7)
          return { data: [{ id: "x" }], error: null };
        return { data: null, error: null };
      };
      const r = await sidakService.refreshDashboardSummary("p1", "call");
      expect(r.agent_count).toBe(1);
      expect(r.message).toBe("Summary refreshed");
    });
  });

  describe("validateTemuanBatch", () => {
    it("returns all valid when no issues", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Test", service_type: "call" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };
      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [{ indicator_id: "i1", nilai: 2 }],
      });
      expect(r.stats.valid_count).toBe(1);
      expect(r.stats.invalid_count).toBe(0);
      expect(r.stats.skipped_count).toBe(0);
      expect(r.valid).toHaveLength(1);
    });

    it("flags invalid indicator (wrong service_type)", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Wrong", service_type: "email" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };
      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [{ indicator_id: "i1", nilai: 0 }],
      });
      expect(r.stats.invalid_count).toBe(1);
      expect(r.invalid[0].error).toContain("milik layanan email");
    });

    it("skips duplicates already in db", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Test", service_type: "call" }],
            error: null,
          };
        }
        if (table === "qa_temuan") {
          return {
            data: [{ indicator_id: "i1", no_tiket: "TKT-123", service_type: "call" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };
      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        no_tiket: "TKT-123",
        items: [{ indicator_id: "i1", nilai: 2 }],
      });
      expect(r.stats.skipped_count).toBe(1);
      expect(r.stats.valid_count).toBe(0);
    });

    it("mentions Settings QA when indicator not in active rule version", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") {
          return {
            data: [{ id: "v-active", service_type: "call", status: "published", effective_period_id: "per1", qa_periods: { id: "per1", month: 5, year: 2025 } }],
            error: null,
          };
        }
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Test", service_type: "call" }],
            error: null,
          };
        }
        if (table === "qa_service_rule_indicators") {
          return {
            data: [{ legacy_indicator_id: "gi-other" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };
      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [{ indicator_id: "i1", nilai: 2 }],
      });
      expect(r.stats.invalid_count).toBe(1);
      expect(r.invalid[0].error).toMatch(/Settings QA/);
    });
  });


  describe("resolveActivePublishedRuleVersion", () => {
    it("returns published version id", async () => {
      pendingResolve = () => ({ data: { id: "v1" }, error: null });
      const r = await sidakService.resolveActivePublishedRuleVersion("call");
      expect(r).toEqual({ id: "v1" });
    });

    it("returns null when no published version", async () => {
      pendingResolve = () => ({ data: null, error: null });
      const r = await sidakService.resolveActivePublishedRuleVersion("call");
      expect(r).toBeNull();
    });
  });

  describe("hasDraftRuleVersion", () => {
    it("returns true when draft exists", async () => {
      pendingResolve = () => ({ count: 2, error: null });
      const r = await sidakService.hasDraftRuleVersion("call");
      expect(r).toBe(true);
    });

    it("returns false when no draft", async () => {
      pendingResolve = () => ({ count: 0, error: null });
      const r = await sidakService.hasDraftRuleVersion("call");
      expect(r).toBe(false);
    });
  });

  describe("validateTemuanBatch - duplicate checks regression", () => {
    it("allows different tickets for same indicator", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Test", service_type: "call" }],
            error: null,
          };
        }
        if (table === "qa_temuan") {
          return {
            data: [{ indicator_id: "i1", no_tiket: "TKT-123", service_type: "call" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };

      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [
          { indicator_id: "i1", nilai: 2, no_tiket: "TKT-456" },
        ],
      });
      expect(r.stats.skipped_count).toBe(0);
      expect(r.stats.valid_count).toBe(1);
    });

    it("skips duplicate in case-insensitive and trimmed matching", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Test", service_type: "call" }],
            error: null,
          };
        }
        if (table === "qa_temuan") {
          return {
            data: [{ indicator_id: "i1", no_tiket: "  tkt-123  ", service_type: "call" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };

      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [
          { indicator_id: "i1", nilai: 2, no_tiket: "TKT-123" },
        ],
      });
      expect(r.stats.skipped_count).toBe(1);
      expect(r.stats.valid_count).toBe(0);
    });

    it("allows duplicate parameters if no_tiket is empty or null", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Test", service_type: "call" }],
            error: null,
          };
        }
        if (table === "qa_temuan") {
          return {
            data: [{ indicator_id: "i1", no_tiket: null, service_type: "call" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };

      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [
          { indicator_id: "i1", nilai: 2, no_tiket: null },
          { indicator_id: "i1", nilai: 1, no_tiket: "" },
        ],
      });
      expect(r.stats.skipped_count).toBe(0);
      expect(r.stats.valid_count).toBe(2);
    });

    it("handles intra-batch duplicate detection", async () => {
      pendingResolve = (table) => {
        if (table === "qa_periods") return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (table === "qa_service_rule_versions") return { data: null, error: null };
        if (table === "qa_indicators") {
          return {
            data: [{ id: "i1", name: "Test", service_type: "call" }],
            error: null,
          };
        }
        return { data: [], error: null };
      };

      const r = await sidakService.validateTemuanBatch({
        peserta_id: "p1",
        period_id: "per1",
        service_type: "call",
        items: [
          { indicator_id: "i1", nilai: 2, no_tiket: "TKT-999" },
          { indicator_id: "i1", nilai: 1, no_tiket: "TKT-999" },
        ],
      });
      expect(r.stats.skipped_count).toBe(1);
      expect(r.stats.valid_count).toBe(1);
    });
  });


  describe("createPerfectScoreSession", () => {
    it("creates 5 × N phantom rows with nilai=3 and is_phantom_padding=true", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: { year: 2025 }, error: null };
        if (callCount === 2) return { count: 0, error: null };
        if (callCount === 3) return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (callCount === 4) return { data: [{ id: "ver1", service_type: "call", status: "published", effective_period_id: "per1", qa_periods: { id: "per1", month: 5, year: 2025 } }], error: null };
        if (callCount === 5) return { data: [{ id: "ri1", indicator_id: "ind1" }, { id: "ri2", indicator_id: "ind2" }], error: null };
        return { data: [{ id: "p1", nilai: 3, is_phantom_padding: true, no_tiket: "__PHANTOM__batch_1" }], error: null };
      };

      const result = await sidakService.createPerfectScoreSession("peserta1", "per1", "call");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].nilai).toBe(3);
      expect(result[0].is_phantom_padding).toBe(true);
      expect(result[0].no_tiket).toContain("__PHANTOM__");
    });

    it("throws when phantom sessions already exist for same period/service/agent", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: { year: 2025 }, error: null };
        if (callCount >= 2) return { count: 3, error: null };
        return { data: null, error: null };
      };

      await expect(
        sidakService.createPerfectScoreSession("peserta1", "per1", "call"),
      ).rejects.toThrow("Sesi tanpa temuan untuk periode ini sudah pernah dibuat.");
    });

    it("throws when no indicators available", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: { year: 2025 }, error: null };
        if (callCount === 2) return { count: 0, error: null };
        if (callCount === 3) return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (callCount === 4) return { data: [], error: null };
        if (callCount >= 5) return { data: [], error: null };
        return { data: null, error: null };
      };

      await expect(
        sidakService.createPerfectScoreSession("peserta1", "per1", "call"),
      ).rejects.toThrow("Tidak ada parameter untuk tim agent ini");
    });

    it("uses fallback qa_indicators when rule version has no indicators", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: { year: 2025 }, error: null };
        if (callCount === 2) return { count: 0, error: null };
        if (callCount === 3) return { data: { id: "per1", month: 5, year: 2025 }, error: null };
        if (callCount === 4) return { data: [{ id: "ver1", service_type: "call", status: "published", effective_period_id: "per1", qa_periods: { id: "per1", month: 5, year: 2025 } }], error: null };
        if (callCount === 5) return { data: [], error: null };
        if (callCount === 6) return { data: [{ id: "ind1" }, { id: "ind2" }], error: null };
        return { data: [{ id: "p1", nilai: 3, is_phantom_padding: true }], error: null };
      };

      const result = await sidakService.createPerfectScoreSession("peserta1", "per1", "call");
      expect(result.length).toBeGreaterThan(0);
    });
  });


  describe("getAllFolders", () => {
    it("returns sorted folders from database", async () => {
      const fake = [{ id: "1", name: "Folder A" }];
      pendingResolve = () => ({ data: fake, error: null });

      const result = await sidakService.getAllFolders();
      expect(result).toEqual(fake);
    });
  });

  describe("getAgentsByFolder", () => {
    it("returns agents for folder", async () => {
      const fake = [{ id: "a1", nama: "Agent A" }, { id: "a2", nama: "Agent B" }];
      pendingResolve = () => ({ data: fake, error: null });

      const result = await sidakService.getAgentsByFolder("Folder A", null);
      expect(result).toEqual(fake);
    });

    it("filters agents by allowed agentIds in filterScope", async () => {
      const fake = [{ id: "a1", nama: "Agent A" }, { id: "a2", nama: "Agent B" }];
      pendingResolve = () => ({ data: fake, error: null });

      const result = await sidakService.getAgentsByFolder("Folder A", {
        agentIds: ["a1"],
        allowedFolders: [],
        allowedServices: [],
        serviceTypeLocked: false,
      });
      expect(result).toEqual([{ id: "a1", nama: "Agent A" }]);
    });
  });

  describe("generateAiReport", () => {
    it("throws error when no data rows are found", async () => {
      pendingResolve = () => ({ data: [], error: null });

      await expect(
        sidakService.generateAiReport(
          { mode: "layanan", serviceType: "call", year: 2025 },
          "u1",
        ),
      ).rejects.toThrow("Tidak ada data temuan untuk filter yang dipilih.");
    });

    it("generates and returns report when rows exist", async () => {
      const fakeRows = [
        {
          id: "r1",
          nilai: 3,
          service_type: "call",
          profiler_peserta: { nama: "Agent A" },
          qa_indicators: { name: "Param 1" },
        },
      ];
      pendingResolve = () => ({ data: fakeRows, error: null });

      const result = await sidakService.generateAiReport(
        { mode: "layanan", serviceType: "call", year: 2025 },
        "u1",
      );

      expect(result.report).toEqual({ executiveSummary: "test summary" });
      expect(result.metadata.totalRows).toBe(1);
      expect(result.metadata.totalFindings).toBe(0);
      expect(result.metadata.serviceTypes).toBe("call");
    });
  });
});
