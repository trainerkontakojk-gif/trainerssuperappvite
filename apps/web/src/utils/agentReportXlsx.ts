/**
 * Laporan agen SIDAK sebagai workbook Excel (.xlsx).
 *
 * Menggantikan CSV multi-seksi dan Markdown: satu sheet per bagian laporan,
 * baris header tebal dan beku, filter otomatis, lebar kolom yang pas, dan angka
 * yang tersimpan sebagai angka sehingga bisa langsung diolah. Label dan
 * kesimpulan memakai `agentReportModel`, jadi isinya sama dengan HTML dan PDF.
 *
 * Keamanan formula: setiap teks ditulis sebagai nilai string sel. `exceljs`
 * hanya membuat sel formula dari objek `{ formula }`, yang tidak pernah dipakai
 * di sini — jadi catatan temuan yang diawali `=`, `+`, `-`, atau `@` tetap teks
 * dan tidak pernah dievaluasi spreadsheet.
 *
 * `exceljs` (dependency web yang sudah ada) diimpor dinamis supaya hanya dimuat
 * saat pengguna memilih Excel.
 */

import type { Worksheet } from "exceljs";
import {
  buildHighlights,
  comparisonDelta,
  computeTenure,
  findingTrend,
  finiteNumber,
  finiteOrNull,
  flatFindingRows,
  jabatanLabel,
  monthLabel,
  qaStatusLabel,
  reportScopes,
  resolveActiveMonth,
  serviceLabel,
  type AgentReportSnapshot,
} from "./agentReportModel";

type CellValue = string | number | null;

interface SheetSpec {
  columns: Array<{ header: string; width: number; wrap?: boolean; numFmt?: string }>;
  rows: CellValue[][];
  empty: string;
}

const HEADER_FILL = "FFF1F5F9";

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(finiteNumber(value) * factor) / factor;
}

/** Sheet tabel: header beku + filter, kolom panjang membungkus teks. */
function writeTableSheet(sheet: Worksheet, spec: SheetSpec): void {
  sheet.columns = spec.columns.map((column) => ({
    header: column.header,
    width: column.width,
    style: {
      alignment: { vertical: "top", wrapText: column.wrap === true },
      ...(column.numFmt ? { numFmt: column.numFmt } : {}),
    },
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  if (spec.rows.length === 0) {
    sheet.addRow([spec.empty]).font = { italic: true, color: { argb: "FF64748B" } };
    return;
  }
  for (const row of spec.rows) sheet.addRow(row);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: spec.columns.length },
  };
}

function writeSummarySheet(sheet: Worksheet, snapshot: AgentReportSnapshot): void {
  const peserta = snapshot.data.peserta;
  const scopes = reportScopes(snapshot);
  const activeMonth = resolveActiveMonth(snapshot);
  sheet.columns = [
    { width: 24, style: { alignment: { vertical: "top" } } },
    { width: 90, style: { alignment: { vertical: "top", wrapText: true } } },
  ];
  const title = sheet.addRow(["Laporan Audit Agent", peserta.nama]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([]);
  const facts: Array<[string, CellValue]> = [
    ["Nama", peserta.nama],
    ["Tim", peserta.tim],
    ["Batch", peserta.batch_name],
    ["Jabatan", jabatanLabel(peserta.jabatan)],
    ["Masa kerja", computeTenure(peserta.bergabung_date)],
    ["Layanan", serviceLabel(snapshot.selectedService)],
    ["Tahun", Math.trunc(finiteNumber(snapshot.selectedYear))],
    [
      "Bulan terpilih",
      activeMonth ? monthLabel(activeMonth, snapshot.selectedYear) : "—",
    ],
    ["Cakupan tiket", scopes.tickets],
    ["Cakupan akar masalah", scopes.rootCauses],
  ];
  if (scopes.comparison) facts.push(["Cakupan perbandingan", scopes.comparison]);
  for (const [term, value] of facts) {
    const row = sheet.addRow([term, value]);
    row.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
    // Tahun ditulis rata kiri seperti teks lain di blok identitas.
    row.getCell(2).alignment = { horizontal: "left", vertical: "top", wrapText: true };
  }
  sheet.addRow([]);
  sheet.addRow(["Kesimpulan Utama"]).font = { bold: true, size: 12 };
  buildHighlights(snapshot).forEach((line, index) => {
    sheet.addRow([`${index + 1}.`, line]);
  });
  sheet.addRow([]);
  sheet.addRow([
    "Catatan",
    "Sesi tanpa temuan dihitung pada kolom Sesi, tetapi tidak ditampilkan sebagai temuan.",
  ]).font = { italic: true, color: { argb: "FF64748B" } };
}

export async function generateAgentReportXlsx(
  snapshot: AgentReportSnapshot,
): Promise<ArrayBuffer> {
  if (!snapshot.data?.peserta) {
    throw new Error("data profil agen tidak tersedia untuk laporan Excel");
  }
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIDAK";
  workbook.title = `Laporan Audit Agent - ${snapshot.data.peserta.nama}`;

  writeSummarySheet(workbook.addWorksheet("Ringkasan"), snapshot);

  writeTableSheet(workbook.addWorksheet("Skor Bulanan"), {
    columns: [
      { header: "Bulan", width: 18 },
      { header: "Skor Final", width: 12 },
      { header: "Skor Non-Critical", width: 18 },
      { header: "Skor Critical", width: 14 },
      { header: "Sesi", width: 8 },
      { header: "Temuan", width: 10 },
      { header: "Status", width: 22 },
    ],
    rows: snapshot.monthlySummaries.map((summary) => [
      monthLabel(summary.month, summary.year),
      finiteNumber(summary.finalScore),
      finiteNumber(summary.nonCriticalScore),
      finiteNumber(summary.criticalScore),
      finiteNumber(summary.sessionCount),
      finiteNumber(summary.findingsCount),
      qaStatusLabel(summary.finalScore),
    ]),
    empty: "Belum ada skor untuk tahun dan layanan ini.",
  });

  writeTableSheet(workbook.addWorksheet("Temuan"), {
    columns: [
      { header: "Bulan", width: 16 },
      { header: "No Tiket", width: 18 },
      { header: "Parameter", width: 30, wrap: true },
      { header: "Kategori", width: 14 },
      { header: "Nilai", width: 7 },
      { header: "Keterangan Nilai", width: 16 },
      { header: "Ketidaksesuaian", width: 60, wrap: true },
      { header: "Sebaiknya", width: 60, wrap: true },
    ],
    rows: flatFindingRows(snapshot.temuanDisplayItems).map((row) => [
      row.period,
      row.ticket,
      row.parameter,
      row.category,
      row.nilai,
      row.nilaiLabel,
      row.ketidaksesuaian,
      row.sebaiknya,
    ]),
    empty: "Tidak ada temuan pada tahun dan layanan ini.",
  });

  writeTableSheet(workbook.addWorksheet("Tiket"), {
    columns: [
      { header: "#", width: 5 },
      { header: "No Tiket", width: 20 },
      { header: "Parameter Terberat", width: 34, wrap: true },
      { header: "Pengurangan Skor", width: 18, numFmt: "0.0" },
      { header: "Jumlah Temuan", width: 15 },
    ],
    rows: snapshot.topTickets.map((ticket, index) => [
      index + 1,
      ticket.no_tiket,
      ticket.heaviestParam,
      round(ticket.scoreDeduction, 1),
      finiteNumber(ticket.findingCount),
    ]),
    empty: "Tidak ada tiket yang menurunkan skor pada bulan ini.",
  });

  writeTableSheet(workbook.addWorksheet("Akar Masalah"), {
    columns: [
      { header: "Akar Masalah", width: 32, wrap: true },
      { header: "Jumlah Temuan", width: 15 },
      { header: "Tiket Terdampak", width: 16 },
      { header: "Temuan Critical", width: 16 },
      { header: "Rekomendasi", width: 70, wrap: true },
    ],
    rows: snapshot.activeRootCauses.map((cause) => [
      cause.label,
      finiteNumber(cause.findingsCount),
      finiteNumber(cause.affectedTickets),
      finiteNumber(cause.criticalFindingsCount),
      cause.recommendation,
    ]),
    empty: "Belum ada pola akar masalah yang menonjol.",
  });

  const trend = findingTrend(snapshot.data);
  const trendSeries = [...(trend.total ? [trend.total] : []), ...trend.parameters];
  writeTableSheet(workbook.addWorksheet("Tren Temuan"), {
    columns: [
      { header: "Parameter", width: 34, wrap: true },
      ...trend.labels.map((label) => ({ header: label, width: 10 })),
      { header: "Total", width: 10 },
    ],
    rows: trendSeries.map((series) => [
      series.label,
      ...series.data,
      series.data.reduce<number>((acc, value) => acc + (value ?? 0), 0),
    ]),
    empty: "Data tren temuan belum tersedia.",
  });

  const comparison = snapshot.data.comparisonTable;
  const percent = (value: number | null) =>
    value === null ? null : round(value, 1);
  writeTableSheet(workbook.addWorksheet("Perbandingan"), {
    columns: [
      { header: "Parameter", width: 34, wrap: true },
      { header: "Agen Ini", width: 10 },
      { header: "Rata-rata Tim", width: 14, numFmt: "0.0" },
      { header: "Rata-rata Layanan", width: 18, numFmt: "0.0" },
      { header: "Selisih vs Tim (%)", width: 18, numFmt: "+0.0;-0.0;0" },
      { header: "Selisih vs Layanan (%)", width: 22, numFmt: "+0.0;-0.0;0" },
    ],
    rows: (comparison?.rows ?? []).map((row) => [
      row.label,
      finiteNumber(row.agentCount),
      finiteOrNull(row.teamAverage),
      finiteOrNull(row.serviceAverage),
      percent(comparisonDelta(row.agentCount, row.teamAverage)),
      percent(comparisonDelta(row.agentCount, row.serviceAverage)),
    ]),
    empty: "Data perbandingan belum tersedia.",
  });

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
