/**
 * Spreadsheet unification tests (plan 018).
 *
 * Contract: after dropping the frozen `xlsx` package, every spreadsheet
 * read/write goes through excel-utils (ExcelJS) with behavior identical
 * to the old xlsx-based parsers:
 *   - parseExcel: template sheet "Input Temuan" (or first-sheet fallback),
 *     bilingual header mapping with positional fallback, per-row errors.
 *   - toCsv / buildFlatWorkbookBuffer: flat exports round-trip cleanly.
 */
import { describe, it, expect } from "vitest";
import {
  parseExcel,
  toCsv,
  parseCsv,
  buildFlatWorkbookBuffer,
  readWorkbookRaw,
} from "../lib/excel-utils";
import { formatQAIndicatorName, type QAIndicator } from "@trainers/types";

const ExcelJSModule = await import("exceljs");
const ExcelJS = ExcelJSModule.default;

// ── Fixtures ──

const indicator: QAIndicator = {
  id: "11111111-1111-4111-8111-111111111111",
  service_type: "call",
  name: "Menyebutkan nama",
  parameter_group: null,
  category: "critical",
  bobot: 1,
  has_na: false,
};

const HEADERS = [
  "No Tiket",
  "Indikator",
  "Nilai (0-3)",
  "Ketidaksesuaian",
  "Sebaiknya",
];

async function buildWorkbook(
  opts: { sheetName?: string; rows?: (string | number)[][] } = {},
): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName ?? "Input Temuan");
  ws.addRow(HEADERS);
  for (const r of opts.rows ?? []) ws.addRow(r);

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const file = new File([buf], "temuan.xlsx");
  // Guarantee arrayBuffer() availability regardless of jsdom version.
  Object.defineProperty(file, "arrayBuffer", { value: async () => buf });
  return file;
}

// ── parseExcel (reader migration contract) ──

describe("parseExcel (exceljs-backed)", () => {
  it("maps a valid row to ParsedRow with matched indicator", async () => {
    const file = await buildWorkbook({
      rows: [["TIK-001", "Menyebutkan nama", 2, "Tidak menyebutkan nama", "Sebutkan nama"]],
    });
    const rows = await parseExcel(file, [indicator], "call");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      row: 2,
      no_tiket: "TIK-001",
      indicator_name: "Menyebutkan nama",
      nilai: 2,
      ketidaksesuaian: "Tidak menyebutkan nama",
      sebaiknya: "Sebutkan nama",
      service_type: "call",
      indicator_id: indicator.id,
    });
    expect(rows[0].error).toBeUndefined();
  });

  it("flags an unknown indicator as row error instead of throwing", async () => {
    const file = await buildWorkbook({
      rows: [["CONTOH-001", "Bukan Indikator", 2, "", ""]],
    });
    const rows = await parseExcel(file, [indicator]);
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toContain("tidak ditemukan");
    expect(rows[0].indicator_id).toBeUndefined();
  });

  it("skips fully empty rows", async () => {
    const file = await buildWorkbook({
      rows: [
        ["TIK-001", "Menyebutkan nama", 2, "", ""],
        ["", "", "", "", ""],
        ["TIK-002", "Menyebutkan nama", 3, "", ""],
      ],
    });
    const rows = await parseExcel(file, [indicator]);
    expect(rows.map((r) => r.no_tiket)).toEqual(["TIK-001", "TIK-002"]);
  });

  it("coerces a text-cell nilai ('2') into numeric 2", async () => {
    const file = await buildWorkbook({
      rows: [["TIK-003", "Menyebutkan nama", "2", "", ""]],
    });
    const rows = await parseExcel(file, [indicator]);
    expect(rows[0].nilai).toBe(2);
    expect(rows[0].error).toBeUndefined();
  });

  it("falls back to the first sheet when 'Input Temuan' is absent", async () => {
    const file = await buildWorkbook({
      sheetName: "Sheet1",
      rows: [["TIK-004", formatQAIndicatorName(indicator), 1, "", ""]],
    });
    const rows = await parseExcel(file, [indicator]);
    expect(rows).toHaveLength(1);
    expect(rows[0].no_tiket).toBe("TIK-004");
    expect(rows[0].indicator_id).toBe(indicator.id);
  });

  it("rejects legacy .xls files with a friendly message", async () => {
    const buf = new ArrayBuffer(8);
    const file = new File([buf], "old.xls");
    Object.defineProperty(file, "arrayBuffer", { value: async () => buf });
    await expect(parseExcel(file, [indicator])).rejects.toThrow(
      /\.xls tidak didukung/,
    );
  });
});

// ── Flat exports (writer migration contract) ──

describe("toCsv", () => {
  it("quotes fields containing commas and embedded quotes", () => {
    const csv = toCsv([
      { Nama: 'Ditulis "bagus"', Catatan: "baik, cepat" },
    ]);
    expect(csv).toBe('Nama,Catatan\r\n"Ditulis ""bagus""","baik, cepat"');
  });

  it("parses its own output back through parseCsv", () => {
    const original = [{ A: 'kata "x"', B: "a,b" }];
    const parsed = parseCsv(toCsv(original));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(["A", "B"]);
    expect(parsed[1]).toEqual(['kata "x"', "a,b"]);
  });
});

describe("buildFlatWorkbookBuffer round-trip", () => {
  it("re-reads header and data rows exactly as written", async () => {
    const rows = [
      { Layanan: "call", Agen: "Sinta", Skor: 3 },
      { Layanan: "email", Agen: "Rani", Skor: 2 },
    ];
    const buf = await buildFlatWorkbookBuffer("Data Laporan", rows);
    const { names, sheets } = await readWorkbookRaw(buf);
    expect(names).toContain("Data Laporan");
    const table = sheets["Data Laporan"];
    expect(table[0]).toEqual(["Layanan", "Agen", "Skor"]);
    expect(table[1]).toEqual(["call", "Sinta", "3"]);
    expect(table[2]).toEqual(["email", "Rani", "2"]);
  });
});
