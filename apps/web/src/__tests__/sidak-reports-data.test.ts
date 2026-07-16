import { describe, expect, it } from "vitest";
import {
  getReportFindingText,
  getReportTicketText,
  normalizeReportAgents,
  validateReportFilters,
} from "../routes/sidak/reports-data-utils";

describe("normalizeReportAgents", () => {
  it("extracts agents from the current SIDAK directory response contract", () => {
    const agents = [
      { id: "agent-1", nama: "Alya", batch_name: "Batch A" },
      { id: "agent-2", nama: "Bima", batch_name: null },
    ];

    expect(normalizeReportAgents({ agents, batches: ["Batch A"] })).toEqual(agents);
  });

  it("returns an empty list for malformed or missing API data", () => {
    expect(normalizeReportAgents(null)).toEqual([]);
    expect(normalizeReportAgents({ agents: "not-an-array" })).toEqual([]);
  });
});

describe("validateReportFilters", () => {
  it("requires an agent in individual mode", () => {
    expect(
      validateReportFilters({
        mode: "individu",
        pesertaId: "",
        startMonth: 1,
        endMonth: 12,
      }),
    ).toBe("Pilih agen terlebih dahulu.");
  });

  it("rejects a reversed month range", () => {
    expect(
      validateReportFilters({
        mode: "layanan",
        pesertaId: "",
        startMonth: 8,
        endMonth: 3,
      }),
    ).toBe("Bulan awal tidak boleh setelah bulan akhir.");
  });

  it("accepts a complete valid filter", () => {
    expect(
      validateReportFilters({
        mode: "individu",
        pesertaId: "agent-1",
        startMonth: 1,
        endMonth: 12,
      }),
    ).toBeNull();
  });
});

describe("getReportFindingText", () => {
  it("keeps the complete finding text visible", () => {
    const finding = "Agent belum menyampaikan seluruh informasi wajib kepada konsumen.";

    expect(getReportFindingText({ ketidaksesuaian: finding })).toBe(finding);
  });

  it("uses a visible placeholder when the finding is empty", () => {
    expect(getReportFindingText({ ketidaksesuaian: "   " })).toBe("-");
  });
});

describe("getReportTicketText", () => {
  it("shows the normalized ticket number", () => {
    expect(getReportTicketText({ no_tiket: "  TKT-2026-001  " })).toBe(
      "TKT-2026-001",
    );
  });

  it("uses a visible placeholder when the ticket number is empty", () => {
    expect(getReportTicketText({ no_tiket: null })).toBe("-");
    expect(getReportTicketText({})).toBe("-");
  });
});
