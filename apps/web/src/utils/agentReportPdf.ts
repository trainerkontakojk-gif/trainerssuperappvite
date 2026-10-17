/**
 * Laporan audit agen (SIDAK) — generator PDF A4 dengan teks yang bisa dicari.
 *
 * Unduhan PDF LANGSUNG, bukan dialog cetak: `jsPDF` (dependency web yang sudah
 * ada, diimpor dinamis) menulis dokumen biner dari snapshot yang sama dengan
 * HTML dan Excel, lalu hook mengunduhnya sebagai Blob `application/pdf`.
 *
 * Aturan yang dijaga di sini:
 *  - **Urutan baca sama dengan HTML.** Identitas → Kesimpulan Utama →
 *    Ringkasan (posisi, skor bulan terpilih, rekap bulanan, tiket, akar
 *    masalah) → Perkembangan Skor → Tren Temuan (total, per parameter,
 *    perbandingan) → Detail Temuan per parameter → catatan kaki. Label,
 *    cakupan, kesimpulan, dan arah baik/buruk datang dari `agentReportModel`.
 *  - **Teks asli, bukan gambar.** Seluruh isi ditulis sebagai operator teks;
 *    grafik hanya garis vektor dan angkanya tetap ada di tabel.
 *  - **Paginasi jujur.** Judul tidak menggantung di dasar halaman, header tabel
 *    berulang saat tabel terbelah, baris tabel tidak pernah keluar dari area
 *    cetak, dan setiap halaman memakai footer "Halaman X dari N".
 *  - **Teks aman untuk font standar tanpa kehilangan bukti.** Helvetica hanya
 *    mencetak WinAnsi; titik kode tanpa glyph dicetak sebagai penanda
 *    `[U+XXXX]` yang bisa dicari dan dibalik.
 *  - **Tanpa aset remote dan tanpa angka karangan.** Bagian kosong dinyatakan
 *    eksplisit; sesi tanpa temuan tidak pernah jadi baris temuan.
 */

import type { SidakAgentQuickviewResponse } from "@trainers/types";
import {
  QA_TARGET,
  SCORE_EMPTY_NOTE,
  TREND_EMPTY_NOTE,
  TREND_UNIT_LABEL,
  buildHighlights,
  comparisonDelta,
  computeTenure,
  countAxis,
  findingDeltaTone,
  findingTrend,
  finiteNumber,
  formatNumber,
  formatPercentDelta,
  formatPointDelta,
  groupFindingsByParameter,
  jabatanLabel,
  monthLabel,
  nilaiText,
  qaStatusLabel,
  reportScopes,
  resolveActiveMonth,
  resolveActiveScore,
  scoreAxis,
  scoreDeltaTone,
  scoreTrend,
  serviceLabel,
  yearText,
  type AgentReportSnapshot,
  type ReportScopes,
  type TrendSeries,
} from "./agentReportModel";
import { sidakScoreLabel, sidakScoreTone } from "./sidakScoreStatus";
import {
  PAGE_WIDTH,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  CONTENT_BOTTOM,
  CONTENT_WIDTH,
  FONT,
  INK,
  INK_MUTE,
  INK_FAINT,
  LINE,
  LINE_STRONG,
  WASH,
  mm,
  line,
  toneColor,
} from "./agentReportPdfTheme";
import { pdfSafeText, createMeasurer, wrapPdfText } from "./agentReportPdfText";
import { PdfDocument, bullet, statRow, note } from "./agentReportPdfLayout";
import { type PdfChart, chartHeight, drawChart } from "./agentReportPdfChart";

/** Snapshot laporan yang dipakai PDF: sama dengan HTML, tanpa `variant`. */
export type AgentReportPdfInput = AgentReportSnapshot;

// ---------------------------------------------------------------------------
// Bagian dokumen
// ---------------------------------------------------------------------------

function buildMasthead(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
  dateStr: string,
): void {
  const peserta = input.data.peserta;
  const initial = (peserta.nama.trim().charAt(0) || "?").toUpperCase();
  pdf.ensureSpace(50);
  const top = pdf.cursor;

  // Inisial dan nama SEBARIS: kotak di kiri, identitas di kanannya.
  pdf.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
  pdf.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
  pdf.doc.setLineWidth(0.2);
  pdf.doc.rect(MARGIN_LEFT, top, 14, 14, "FD");
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(13);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  pdf.doc.text(pdfSafeText(initial), MARGIN_LEFT + 7, top + 7, {
    align: "center",
    baseline: "middle",
  });

  const nameX = MARGIN_LEFT + 18;
  const nameWidth = CONTENT_WIDTH - 18;
  pdf.moveTo(top);
  pdf.paragraph("LAPORAN AUDIT AGENT", {
    x: nameX,
    width: nameWidth,
    font: "bold",
    size: 7,
    color: INK_FAINT,
  });
  pdf.paragraph(peserta.nama, {
    x: nameX,
    width: nameWidth,
    font: "bold",
    size: 17,
    color: INK,
    lineHeight: mm(17 * 1.2),
  });
  pdf.paragraph(scopes.header, {
    x: nameX,
    width: nameWidth,
    size: 9,
    color: INK_MUTE,
  });
  // Waktu pembuatan ditulis di identitas, bukan di blok penutup tersendiri:
  // blok penutup yang tidak muat bisa membuat halaman terakhir berisi itu saja.
  pdf.paragraph(`Dibuat ${dateStr} dari SIDAK`, {
    x: nameX,
    width: nameWidth,
    size: 7,
    color: INK_FAINT,
  });
  pdf.moveTo(Math.max(pdf.cursor, top + 14) + 4);

  const meta: Array<[string, string]> = [
    ["Tim", peserta.tim],
    ["Batch", peserta.batch_name],
    ["Jabatan", jabatanLabel(peserta.jabatan)],
    ["Masa kerja", computeTenure(peserta.bergabung_date)],
  ];
  const columnWidth = CONTENT_WIDTH / meta.length;
  const metaTop = pdf.cursor;
  meta.forEach(([term, value], index) => {
    const x = MARGIN_LEFT + columnWidth * index;
    pdf.doc.setFont(FONT, "normal");
    pdf.doc.setFontSize(7);
    pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
    pdf.doc.text(pdfSafeText(term), x, metaTop, { baseline: "top" });
    wrapPdfText(value, columnWidth - 2, pdf.measure, "bold", 9).forEach(
      (item, lineIndex) => {
        pdf.doc.setFont(FONT, "bold");
        pdf.doc.setFontSize(9);
        pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
        pdf.doc.text(item, x, metaTop + line(7) + lineIndex * line(9), {
          baseline: "top",
        });
      },
    );
  });
  pdf.moveTo(metaTop + line(7) + line(9) * 2);
  pdf.rule(INK, 1, 5);
}

function buildHighlightsSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
): void {
  pdf.heading("Kesimpulan Utama", undefined, 20);
  for (const item of buildHighlights(input)) bullet(pdf, item);
  pdf.rule(LINE, 2, 5);
}

function buildStanding(pdf: PdfDocument, input: AgentReportPdfInput): void {
  const quickview = input.context.quickview;
  if (!quickview) return;
  const rank = (
    metric: SidakAgentQuickviewResponse["combinedTeam"],
  ): { value: string; note: string } => {
    if (!metric) return { value: "—", note: "Peringkat belum tersedia" };
    if (metric.rank != null) {
      return {
        value: `#${formatNumber(metric.rank)} dari ${formatNumber(metric.total)}`,
        note: metric.scopeLabel,
      };
    }
    return {
      value: "—",
      note:
        finiteNumber(metric.total) > 0
          ? "Belum masuk peringkat pada cakupan ini"
          : "Belum ada agen pembanding",
    };
  };
  const combined = rank(quickview.combinedTeam);
  const leader = rank(quickview.leaderTeam);
  pdf.heading("Posisi Performa", undefined, 20, 10);
  pdf.table({
    columns: [
      { header: "Cakupan", weight: 1, minWidth: 32 },
      { header: "Peringkat", weight: 0.7, minWidth: 24, align: "right" },
      { header: "Keterangan", weight: 1.6, minWidth: 44 },
    ],
    rows: [
      ["Tim Gabungan", combined.value, combined.note],
      ["Tim Leader", leader.value, leader.note],
      [
        "Perkiraan 3 bulan",
        quickview.forecast?.label ?? "—",
        quickview.forecast?.supportingText ?? "Perkiraan belum tersedia",
      ],
    ],
  });
}

function buildActiveScore(pdf: PdfDocument, input: AgentReportPdfInput): void {
  const active = resolveActiveScore(
    input.monthlySummaries,
    resolveActiveMonth(input),
  );
  pdf.heading("Skor Bulan Terpilih", undefined, 30, 10);
  if (!active) {
    note(pdf, "Belum ada skor untuk tahun dan layanan ini.");
    return;
  }
  const { current, previous, delta } = active;
  const score = finiteNumber(current.finalScore, 0, 0, 100);
  pdf.ensureSpace(30);
  const top = pdf.cursor;
  pdf.doc.setFont(FONT, "normal");
  pdf.doc.setFontSize(8);
  pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
  pdf.doc.text(pdfSafeText(monthLabel(current.month, current.year)), MARGIN_LEFT, top, {
    baseline: "top",
  });
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(22);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  pdf.doc.text(formatNumber(score), MARGIN_LEFT, top + line(8), {
    baseline: "top",
  });
  const statusTop = top + line(8) + mm(22 * 1.1);
  const statusColor = toneColor(sidakScoreTone(score));
  pdf.doc.setFontSize(8);
  pdf.doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.doc.text(
    pdfSafeText(`${sidakScoreLabel(score)} (target ${QA_TARGET})`),
    MARGIN_LEFT,
    statusTop,
    { baseline: "top" },
  );
  pdf.moveTo(statusTop + line(8) + 3);
  statRow(pdf, [
    { term: "Sesi diaudit", value: formatNumber(current.sessionCount), tone: null },
    { term: "Temuan", value: formatNumber(current.findingsCount), tone: null },
    {
      term: previous
        ? `Dibanding ${monthLabel(previous.month, previous.year)}`
        : "Dibanding bulan sebelumnya",
      value: delta === null ? "—" : formatPointDelta(delta),
      tone: delta === null ? null : scoreDeltaTone(delta),
    },
  ]);
}

function buildMonthlyTable(pdf: PdfDocument, input: AgentReportPdfInput): void {
  if (input.monthlySummaries.length === 0) return;
  pdf.table({
    caption: "Rekap Skor Bulanan",
    columns: [
      { header: "Bulan", weight: 1.2, minWidth: 26 },
      { header: "Skor Final", weight: 0.8, minWidth: 18, align: "right" },
      { header: "Skor Non-Critical", weight: 1, minWidth: 26, align: "right" },
      { header: "Skor Critical", weight: 0.9, minWidth: 20, align: "right" },
      { header: "Sesi", weight: 0.5, minWidth: 10, align: "right" },
      { header: "Temuan", weight: 0.6, minWidth: 13, align: "right" },
      {
        header: "Status",
        weight: 1.2,
        minWidth: 30,
        tone: (rowIndex) =>
          finiteNumber(input.monthlySummaries[rowIndex]?.finalScore) < QA_TARGET
            ? "warn"
            : "ok",
      },
    ],
    rows: input.monthlySummaries.map((summary) => [
      monthLabel(summary.month, summary.year),
      formatNumber(summary.finalScore),
      formatNumber(summary.nonCriticalScore),
      formatNumber(summary.criticalScore),
      formatNumber(summary.sessionCount),
      formatNumber(summary.findingsCount),
      qaStatusLabel(summary.finalScore),
    ]),
  });
  note(
    pdf,
    "Sesi tanpa temuan dihitung pada kolom Sesi, tetapi tidak ditampilkan sebagai temuan.",
  );
}

function buildTicketsTable(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  pdf.heading("Tiket Pengurang Skor Terbesar", scopes.tickets, 14, 10);
  if (input.topTickets.length === 0) {
    note(pdf, "Tidak ada tiket yang menurunkan skor pada bulan ini.");
    return;
  }
  pdf.table({
    columns: [
      { header: "#", weight: 0.25, minWidth: 7, align: "right" },
      { header: "No Tiket", weight: 1.1, minWidth: 30, emphasis: true },
      { header: "Parameter Terberat", weight: 1.7, minWidth: 42 },
      { header: "Pengurangan Skor", weight: 0.9, minWidth: 26, align: "right" },
      { header: "Jumlah Temuan", weight: 0.8, minWidth: 22, align: "right" },
    ],
    rows: input.topTickets.map((ticket, index) => [
      String(index + 1),
      ticket.no_tiket,
      ticket.heaviestParam,
      formatNumber(ticket.scoreDeduction, 1),
      formatNumber(ticket.findingCount),
    ]),
  });
}

function buildRootCauses(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  pdf.heading("Akar Masalah", scopes.rootCauses, 14, 10);
  if (input.activeRootCauses.length === 0) {
    note(pdf, "Belum ada pola akar masalah yang menonjol.");
    return;
  }
  input.activeRootCauses.forEach((cause, index) => {
    const critical = finiteNumber(cause.criticalFindingsCount);
    pdf.ensureSpace(line(9.5) + line(7.5) + line(9) * 2);
    pdf.paragraph(`${index + 1}. ${cause.label}`, {
      font: "bold",
      size: 9.5,
      color: INK,
    });
    pdf.paragraph(
      [
        `${formatNumber(cause.findingsCount)} temuan`,
        `${formatNumber(cause.affectedTickets)} tiket`,
        critical > 0 ? `${formatNumber(critical)} critical` : "",
      ]
        .filter(Boolean)
        .join(" • "),
      { size: 7.5, color: INK_MUTE },
    );
    pdf.paragraph(cause.recommendation, { size: 9, gapAfter: 1 });
    const references = cause.ticketReferences ?? [];
    if (references.length > 0) {
      pdf.paragraph(
        "Tiket terkait: " +
          references
            .map(
              (reference) =>
                `${reference.no_tiket} (${reference.periodLabel}, ${formatNumber(reference.findingsCount)} temuan)`,
            )
            .join("; "),
        { size: 7.5, color: INK_MUTE, gapAfter: 1 },
      );
    }
    pdf.moveTo(pdf.cursor + 2);
  });
}



function buildScoreTrendSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
): void {
  const { labels, charts } = scoreTrend(input);
  pdf.heading("Perkembangan Skor", undefined, 50);
  if (labels.length === 0) {
    note(pdf, SCORE_EMPTY_NOTE);
    return;
  }
  note(
    pdf,
    `Satu grafik per jenis skor. Garis putus-putus menandai target ${QA_TARGET}; angka lengkapnya ada di tabel Rekap Skor Bulanan.`,
  );
  const gap = 6;
  const width = (CONTENT_WIDTH - gap * (charts.length - 1)) / charts.length;
  const specs: PdfChart[] = charts.map((chart, index) => ({
    x: MARGIN_LEFT + index * (width + gap),
    width,
    title: chart.title,
    labels,
    series: chart.series,
    axis: scoreAxis(chart.series.data),
    target: QA_TARGET,
    plotHeight: 30,
  }));
  pdf.ensureSpace(Math.max(...specs.map(chartHeight)));
  const top = pdf.cursor;
  const bottoms = specs.map((spec) => drawChart(pdf, spec, top));
  pdf.moveTo(Math.max(...bottoms) + 4);
}

function buildFindingsTrendSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  const { labels, total, parameters } = findingTrend(input.data);
  pdf.heading("Tren Temuan", undefined, 40);
  if (labels.length === 0 || (total === null && parameters.length === 0)) {
    note(pdf, TREND_EMPTY_NOTE);
  } else {
    if (total) {
      const spec: PdfChart = {
        x: MARGIN_LEFT,
        width: CONTENT_WIDTH,
        title: "Total Temuan per Bulan",
        unit: TREND_UNIT_LABEL,
        labels,
        series: total,
        axis: countAxis(total.data),
        plotHeight: 32,
      };
      pdf.ensureSpace(chartHeight(spec));
      pdf.moveTo(drawChart(pdf, spec, pdf.cursor) + 3);
    }
    const sum = (series: TrendSeries) =>
      series.data.reduce<number>((acc, value) => acc + (value ?? 0), 0);
    const cell = (value: number | null) =>
      value === null ? "—" : formatNumber(value);
    const rows = [
      ...(total ? [total] : []),
      ...parameters,
    ].map((series) => [
      series.label,
      ...series.data.map(cell),
      formatNumber(sum(series)),
    ]);
    pdf.table({
      caption: "Temuan per Parameter",
      columns: [
        { header: "Parameter", weight: 3, minWidth: 40 },
        ...labels.map((label) => ({
          header: label,
          weight: 1,
          minWidth: 9,
          align: "right" as const,
        })),
        { header: "Total", weight: 1, minWidth: 11, align: "right" as const },
      ],
      rows,
      totalRows: total ? [0] : [],
    });
  }
  buildComparisonTable(pdf, input, scopes);
}

function buildComparisonTable(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  const table = input.data.comparisonTable;
  if (!table || table.rows.length === 0) return;
  pdf.heading("Perbandingan dengan Tim dan Layanan", scopes.comparison, 20, 10);
  const deltas = table.rows.map((row) => ({
    team: comparisonDelta(row.agentCount, row.teamAverage),
    service: comparisonDelta(row.agentCount, row.serviceAverage),
  }));
  pdf.table({
    columns: [
      { header: "Parameter", weight: 1.8, minWidth: 44 },
      { header: "Agen ini", weight: 0.6, minWidth: 14, align: "right" },
      { header: "Rata-rata tim", weight: 0.8, minWidth: 20, align: "right" },
      { header: "Rata-rata layanan", weight: 0.9, minWidth: 25, align: "right" },
      {
        header: "Selisih vs tim",
        weight: 0.8,
        minWidth: 21,
        align: "right",
        tone: (rowIndex) =>
          findingDeltaTone(
            table.rows[rowIndex]?.agentCount ?? 0,
            deltas[rowIndex]?.team ?? null,
          ),
      },
      {
        header: "Selisih vs layanan",
        weight: 0.9,
        minWidth: 26,
        align: "right",
        tone: (rowIndex) =>
          findingDeltaTone(
            table.rows[rowIndex]?.agentCount ?? 0,
            deltas[rowIndex]?.service ?? null,
          ),
      },
    ],
    rows: table.rows.map((row, index) => [
      row.label,
      formatNumber(row.agentCount),
      formatNumber(row.teamAverage, 1),
      formatNumber(row.serviceAverage, 1),
      formatPercentDelta(deltas[index].team),
      formatPercentDelta(deltas[index].service),
    ]),
    totalRows: table.rows
      .map((row, index) => (row.key === "total" ? index : -1))
      .filter((index) => index >= 0),
  });
  note(
    pdf,
    "Hijau = temuan lebih sedikit dari rata-rata (lebih baik). Merah = lebih banyak.",
  );
}

// ---------------------------------------------------------------------------
// Detail temuan
// ---------------------------------------------------------------------------

/**
 * Pita satu parameter: nama parameter (tebal) di kiri, ringkasan jumlah dan
 * kategori di kanan. Pita selalu membawa minimal dua baris isi bersamanya.
 */
function drawGroupBand(pdf: PdfDocument, title: string, facts: string): void {
  const paddingX = 3;
  const paddingY = 1.8;
  const size = 10;
  const factsWidth = pdf.measure(pdfSafeText(facts), "normal", 7.5) + 2;
  const titleLines = wrapPdfText(
    title,
    CONTENT_WIDTH - paddingX * 2 - factsWidth - 4,
    pdf.measure,
    "bold",
    size,
  );
  const bandHeight = paddingY * 2 + line(size) * titleLines.length;
  pdf.ensureSpace(bandHeight + line(9) * 2 + 2);
  const top = pdf.cursor;
  pdf.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
  pdf.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
  pdf.doc.setLineWidth(0.2);
  pdf.doc.rect(MARGIN_LEFT, top, CONTENT_WIDTH, bandHeight, "FD");
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(size);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  titleLines.forEach((item, index) => {
    pdf.doc.text(item, MARGIN_LEFT + paddingX, top + paddingY + index * line(size), {
      baseline: "top",
    });
  });
  pdf.doc.setFont(FONT, "normal");
  pdf.doc.setFontSize(7.5);
  pdf.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
  pdf.doc.text(
    pdfSafeText(facts),
    PAGE_WIDTH - MARGIN_RIGHT - paddingX,
    top + paddingY + 0.6,
    { align: "right", baseline: "top" },
  );
  pdf.moveTo(top + bandHeight + 2);
}

function buildFindings(pdf: PdfDocument, input: AgentReportPdfInput): void {
  pdf.heading("Detail Temuan", undefined, 30);
  const groups = groupFindingsByParameter(input.temuanDisplayItems);
  if (groups.length === 0) {
    note(pdf, "Tidak ada temuan pada tahun dan layanan ini.");
    return;
  }
  note(
    pdf,
    `${formatNumber(input.temuanDisplayItems.length)} temuan di ${formatNumber(groups.length)} parameter, paling sering lebih dulu. Temuan dengan catatan yang sama digabung dan daftar tiketnya ditulis di bawahnya.`,
    3,
  );
  for (const group of groups) {
    drawGroupBand(
      pdf,
      group.parameter,
      [
        `${formatNumber(group.count)} temuan`,
        group.category,
        group.criticalCount > 0 && group.category !== "Critical"
          ? `${formatNumber(group.criticalCount)} critical`
          : "",
      ]
        .filter(Boolean)
        .join(" • "),
    );
    group.entries.forEach((entry, index) => {
      if (index > 0) pdf.rule(LINE, 0.5, 2);
      pdf.paragraph(`Ketidaksesuaian: ${entry.ketidaksesuaian}`, {
        size: 9,
        indent: 3,
        gapAfter: 0.5,
      });
      // "Sebaiknya" + daftar tiketnya adalah satu unit: daftar tiket tidak
      // boleh jatuh sendirian ke halaman berikutnya tanpa konteksnya.
      const fixLines = wrapPdfText(
        `Sebaiknya: ${entry.sebaiknya}`,
        CONTENT_WIDTH - 3,
        pdf.measure,
        "normal",
        9,
      ).length;
      pdf.ensureSpace(
        Math.min(
          fixLines * line(9) + 1 + entry.occurrences.length * line(8),
          CONTENT_BOTTOM - MARGIN_TOP,
        ),
      );
      pdf.paragraph(`Sebaiknya: ${entry.sebaiknya}`, {
        size: 9,
        color: INK,
        indent: 3,
        gapAfter: 1,
      });
      for (const occurrence of entry.occurrences) {
        pdf.paragraph(
          `${occurrence.ticket} — ${monthLabel(occurrence.month, occurrence.year)} — Nilai ${nilaiText(occurrence.nilai)}`,
          { size: 8, color: INK_MUTE, indent: 6 },
        );
      }
      pdf.moveTo(pdf.cursor + 1.5);
    });
    pdf.moveTo(pdf.cursor + 2);
  }
}

// ---------------------------------------------------------------------------
// Pintu masuk
// ---------------------------------------------------------------------------

/**
 * Bangun PDF A4 portrait dari snapshot yang sama dengan format lain. Kegagalan
 * impor maupun pembuatan dilempar apa adanya supaya pemanggil menampilkan
 * umpan balik error dan tidak pernah mengunduh file kosong.
 */
export async function generateAgentReportPdf(
  input: AgentReportPdfInput,
): Promise<ArrayBuffer> {
  if (!input.data?.peserta) {
    throw new Error("data profil agen tidak tersedia untuk laporan PDF");
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const peserta = input.data.peserta;
  const scopes = reportScopes(input);
  const service = serviceLabel(input.selectedService);
  const year = yearText(input.selectedYear);
  const activeMonth = resolveActiveMonth(input);
  const dateStr = new Date().toLocaleString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  doc.setProperties({
    title: `Laporan Audit Agent - ${pdfSafeText(peserta.nama)}`,
    subject: `Tahun ${year} - Layanan ${service} - Bulan ${activeMonth ? monthLabel(activeMonth, year) : "belum ada"}`,
    author: "SIDAK",
    keywords: `audit, sidak, ${year}, ${service}`,
    creator: "Trainers SuperApp - Laporan Audit SIDAK",
  });

  const pdf = new PdfDocument(
    doc,
    {
      left: "Laporan Audit SIDAK",
      right: `${pdfSafeText(peserta.nama)} • Layanan ${service} • ${year}`,
    },
    createMeasurer(doc),
  );
  pdf.begin();

  buildMasthead(pdf, input, scopes, dateStr);
  buildHighlightsSection(pdf, input);

  pdf.heading("Ringkasan", undefined, 40);
  buildStanding(pdf, input);
  buildActiveScore(pdf, input);
  buildMonthlyTable(pdf, input);
  buildTicketsTable(pdf, input, scopes);
  buildRootCauses(pdf, input, scopes);

  buildScoreTrendSection(pdf, input);
  buildFindingsTrendSection(pdf, input, scopes);
  buildFindings(pdf, input);
  pdf.finalize();

  return doc.output("arraybuffer") as ArrayBuffer;
}
