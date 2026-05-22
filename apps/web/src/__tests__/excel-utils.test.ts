import { describe, it, expect } from "vitest";
import { validateImportRows, type ParsedRow } from "../lib/excel-utils";

describe("validateImportRows", () => {
  it("returns valid rows as-is", () => {
    const rows: ParsedRow[] = [
      {
        row: 2,
        no_tiket: "TKT-001",
        indicator_name: "Salam",
        nilai: 3,
        ketidaksesuaian: "",
        sebaiknya: "",
        indicator_id: "i1",
      },
      {
        row: 3,
        no_tiket: "TKT-002",
        indicator_name: "Verifikasi",
        nilai: 2,
        ketidaksesuaian: "",
        sebaiknya: "",
        indicator_id: "i2",
      },
    ];
    const { valid, invalid } = validateImportRows(rows);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(0);
  });

  it("separates invalid rows", () => {
    const rows: ParsedRow[] = [
      {
        row: 2,
        no_tiket: "TKT-001",
        indicator_name: "Salam",
        nilai: 3,
        ketidaksesuaian: "",
        sebaiknya: "",
        indicator_id: "i1",
      },
      {
        row: 3,
        no_tiket: "TKT-002",
        indicator_name: "",
        nilai: -1,
        ketidaksesuaian: "",
        sebaiknya: "",
        error: "Indikator kosong; Nilai harus 0-3",
      },
    ];
    const { valid, invalid } = validateImportRows(rows);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);
  });

  it("detects duplicate tiket+indicator combos", () => {
    const rows: ParsedRow[] = [
      {
        row: 2,
        no_tiket: "TKT-001",
        indicator_name: "Salam",
        nilai: 3,
        ketidaksesuaian: "",
        sebaiknya: "",
        indicator_id: "i1",
      },
      {
        row: 3,
        no_tiket: "TKT-001",
        indicator_name: "Salam",
        nilai: 2,
        ketidaksesuaian: "",
        sebaiknya: "",
        indicator_id: "i1",
      },
    ];
    const { valid, invalid } = validateImportRows(rows);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].error).toContain("Duplikat");
  });
});
