/**
 * Model bersama laporan agen SIDAK (HTML, PDF, dan Excel).
 *
 * Semua keputusan "bagaimana laporan dibaca manusia" hidup di sini, sekali:
 *  - **Kamus label.** Layanan (`call` → `Call`), jabatan (`cca` → `CCA`),
 *    kategori (`non_critical` → `Non-critical`), nilai temuan, nama bulan, dan
 *    format angka Indonesia. Tidak ada format yang boleh menulis kode mentah.
 *  - **Cakupan.** Header laporan menyatakan layanan + tahun + bulan terpilih
 *    sekali. Seksi hanya menulis cakupan bila memang berbeda dari header
 *    (tiket = bulan terpilih, akar masalah = s.d. bulan terpilih, benchmark =
 *    cakupan yang dideklarasikan backend).
 *  - **Kesimpulan Utama.** Ringkasan deterministik dari angka yang sudah ada —
 *    tidak ada AI, tidak ada angka baru, tidak ada hitung ulang skor.
 *  - **Arah baik/buruk.** Untuk jumlah temuan, LEBIH SEDIKIT dari rata-rata
 *    adalah baik; untuk skor, LEBIH TINGGI adalah baik.
 *
 * Semua angka melewati `finiteNumber`, jadi `NaN`/`Infinity` dari payload
 * runtime tidak pernah sampai ke dokumen.
 */

import {
  labelJabatan,
  type AgentDetailData,
  type AgentPeriodSummary,
  type RootCauseResult,
  type ServiceType,
  type SidakAgentQuickviewResponse,
} from "@trainers/types";
import { SERVICE_LABELS } from "../lib/scoring";
import { SIDAK_QA_TARGET } from "./sidakScoreStatus";

// ---------------------------------------------------------------------------
// Kontrak snapshot laporan
// ---------------------------------------------------------------------------

export interface TicketScoreExport {
  no_tiket: string;
  scoreDeduction: number;
  findingCount: number;
  heaviestParam: string;
  isSamplingQa: boolean;
}

export interface TemuanDisplayItemExport {
  id: string;
  month: number;
  year: number;
  indicatorName: string;
  category: string;
  nilai: number;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket: string | null;
}

export interface AgentHtmlExportContext {
  selectedMonth?: number | null;
  trendStartMonth?: number;
  trendEndMonth?: number;
  quickview?: SidakAgentQuickviewResponse | null;
  isStaff?: boolean;
}

/** Snapshot state UI yang sama untuk semua format laporan. */
export interface AgentReportSnapshot {
  data: AgentDetailData;
  monthlySummaries: AgentPeriodSummary[];
  temuanDisplayItems: TemuanDisplayItemExport[];
  topTickets: TicketScoreExport[];
  activeRootCauses: RootCauseResult[];
  selectedYear: number;
  selectedService: string;
  context: AgentHtmlExportContext;
}

// ---------------------------------------------------------------------------
// Angka
// ---------------------------------------------------------------------------

/** Ambang QA yang sama dengan `MonthRail`/`AgentAuditDossier` di aplikasi. */
export const QA_TARGET = SIDAK_QA_TARGET;

export function finiteNumber(
  value: unknown,
  fallback = 0,
  min = -Infinity,
  max = Infinity,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const numberFormatters = new Map<number, Intl.NumberFormat>();

/** Angka gaya Indonesia: `86,25`, `1.204`. Non-berhingga ditulis `0`. */
export function formatNumber(value: unknown, maxFractionDigits = 2): string {
  let formatter = numberFormatters.get(maxFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: maxFractionDigits,
    });
    numberFormatters.set(maxFractionDigits, formatter);
  }
  return formatter.format(finiteNumber(value));
}

/** Selisih skor dalam poin dengan tanda: `+9 poin`, `-3,5 poin`, `0 poin`. */
export function formatPointDelta(delta: number): string {
  const rounded = Math.round(finiteNumber(delta) * 100) / 100;
  if (rounded === 0) return "0 poin";
  return (rounded > 0 ? "+" : "-") + formatNumber(Math.abs(rounded)) + " poin";
}

/** Selisih persen dengan tanda: `+25%`, `-50%`, `0%`, atau `—`. */
export function formatPercentDelta(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(finiteNumber(value) * 10) / 10;
  if (rounded === 0) return "0%";
  return (rounded > 0 ? "+" : "-") + formatNumber(Math.abs(rounded), 1) + "%";
}

export function yearText(value: unknown, fallback = 0): string {
  return String(Math.trunc(finiteNumber(value, fallback)));
}

// ---------------------------------------------------------------------------
// Kamus label
// ---------------------------------------------------------------------------

export const MONTHS_FULL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function monthIndex(month: unknown): number | null {
  const value = finiteOrNull(month);
  if (value === null) return null;
  const index = Math.trunc(value);
  return index >= 1 && index <= 12 ? index : null;
}

/** `Februari 2026`; bulan di luar 1–12 menjadi `Periode tidak dikenal`. */
export function monthLabel(month: unknown, year: unknown): string {
  const index = monthIndex(month);
  const yearValue = finiteOrNull(year);
  if (index === null) return "Periode tidak dikenal";
  return yearValue === null
    ? MONTHS_FULL[index - 1]
    : `${MONTHS_FULL[index - 1]} ${Math.trunc(yearValue)}`;
}

/** `Feb 2026` — label sumbu grafik yang ringkas. */
export function shortMonthLabel(month: unknown, year: unknown): string {
  const index = monthIndex(month);
  const yearValue = finiteOrNull(year);
  if (index === null) return "?";
  return yearValue === null
    ? MONTHS_SHORT[index - 1]
    : `${MONTHS_SHORT[index - 1]} ${Math.trunc(yearValue)}`;
}

/** `call` → `Call`; nilai yang tidak dikenal ditulis apa adanya. */
export function serviceLabel(service: string | null | undefined): string {
  const key = (service ?? "").trim().toLowerCase();
  if (!key) return "—";
  return SERVICE_LABELS[key as ServiceType] ?? service ?? "—";
}

/** `cca` → `CCA`; jabatan kosong menjadi `Agen`. */
export function jabatanLabel(jabatan: string | null | undefined): string {
  const raw = (jabatan ?? "").trim();
  if (!raw) return "Agen";
  return labelJabatan[raw.toLowerCase()] ?? raw;
}

/** `critical` → `Critical`, `non_critical` → `Non-critical`. */
export function categoryLabel(category: string | null | undefined): string {
  switch ((category ?? "").trim().toLowerCase()) {
    case "critical":
      return "Critical";
    case "non_critical":
      return "Non-critical";
    case "none":
    case "":
      return "Tanpa kategori";
    default:
      return category ?? "Tanpa kategori";
  }
}

/** Arti nilai temuan 0–3 dalam kalimat biasa. */
export function nilaiLabel(nilai: number): string {
  const labels: Record<number, string> = {
    3: "Sesuai",
    2: "Perlu Perbaikan",
    1: "Tidak Sesuai",
    0: "Kritis",
  };
  return labels[Math.trunc(finiteNumber(nilai))] ?? "Tidak dikenal";
}

/** `1 (Tidak Sesuai)`. */
export function nilaiText(nilai: number): string {
  return `${formatNumber(nilai)} (${nilaiLabel(nilai)})`;
}

export function computeTenure(bergabungDate: string | null): string {
  if (!bergabungDate) return "-";
  const start = new Date(bergabungDate);
  if (Number.isNaN(start.getTime())) return "-";
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (months < 12) return Math.max(0, months) + " bulan";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? years + " tahun " + rem + " bulan" : years + " tahun";
}

export function qaStatusLabel(score: number): string {
  return finiteNumber(score) >= QA_TARGET
    ? `Memenuhi target ${QA_TARGET}`
    : `Di bawah target ${QA_TARGET}`;
}

// ---------------------------------------------------------------------------
// Bulan aktif & skor
// ---------------------------------------------------------------------------

export function resolveActiveMonth(snapshot: AgentReportSnapshot): number | null {
  return (
    snapshot.context.selectedMonth ??
    snapshot.monthlySummaries[snapshot.monthlySummaries.length - 1]?.month ??
    null
  );
}

export interface ActiveScore {
  current: AgentPeriodSummary;
  previous: AgentPeriodSummary | null;
  /** Selisih skor final dalam POIN terhadap periode sebelumnya. */
  delta: number | null;
}

export function resolveActiveScore(
  summaries: AgentPeriodSummary[],
  activeMonth: number | null,
): ActiveScore | null {
  if (summaries.length === 0) return null;
  const current =
    (activeMonth
      ? summaries.find((summary) => summary.month === activeMonth)
      : null) ?? summaries[summaries.length - 1];
  const index = summaries.findIndex((summary) => summary.id === current.id);
  const previous = index > 0 ? summaries[index - 1] : null;
  const delta = previous
    ? finiteNumber(current.finalScore) - finiteNumber(previous.finalScore)
    : null;
  return { current, previous, delta };
}

// ---------------------------------------------------------------------------
// Cakupan
// ---------------------------------------------------------------------------

export interface ReportScopes {
  /** Satu kalimat di header: layanan, tahun, dan bulan terpilih. */
  header: string;
  /** Tiket pengurang skor: hanya bulan terpilih. */
  tickets: string;
  /** Akar masalah: tahun berjalan s.d. bulan terpilih. */
  rootCauses: string;
  /** Benchmark: cakupan yang dideklarasikan backend, apa adanya. */
  comparison: string;
}

export function reportScopes(snapshot: AgentReportSnapshot): ReportScopes {
  const year = yearText(snapshot.selectedYear);
  // Agen tanpa audit belum punya layanan terpilih: header cukup menyebut tahun.
  const servicePart = snapshot.selectedService
    ? `Layanan ${serviceLabel(snapshot.selectedService)} • `
    : "";
  const activeMonth = resolveActiveMonth(snapshot);
  const active = monthIndex(activeMonth)
    ? monthLabel(activeMonth, snapshot.selectedYear)
    : null;
  return {
    header:
      `${servicePart}Tahun ${year}` +
      (active ? ` • Bulan terpilih ${active}` : ""),
    tickets: active ? `Hanya ${active}` : `Tahun ${year}`,
    rootCauses: active
      ? `Januari s.d. ${active}`
      : `Sepanjang tahun ${year}`,
    comparison: comparisonScopeLabel(snapshot.data),
  };
}

/**
 * Cakupan benchmark dari `comparisonTable.scope` (backend), tidak pernah
 * ditimpa state UI. Jumlah agen pembanding hanya ditulis bila memang ada.
 */
export function comparisonScopeLabel(data: AgentDetailData): string {
  const scope = data.comparisonTable?.scope;
  if (!scope) return "";
  const start = monthIndex(scope.startMonth ?? 1) ?? 1;
  const end = monthIndex(scope.endMonth ?? 12) ?? 12;
  const year = yearText(scope.year);
  const period =
    start === end
      ? `${MONTHS_FULL[start - 1]} ${year}`
      : `${MONTHS_FULL[start - 1]} – ${MONTHS_FULL[end - 1]} ${year}`;
  const total = data.comparisonTable?.rows.find((row) => row.key === "total");
  const teamCount = finiteNumber(total?.teamAgentCount);
  const serviceCount = finiteNumber(total?.serviceAgentCount);
  const peers =
    teamCount > 0 || serviceCount > 0
      ? ` (${formatNumber(teamCount)} agen di tim, ${formatNumber(serviceCount)} agen di layanan)`
      : "";
  return (
    `${period} • Layanan ${scope.serviceLabel || serviceLabel(scope.serviceType)}` +
    ` • ${scope.teamLabel}${peers}`
  );
}

// ---------------------------------------------------------------------------
// Perbandingan
// ---------------------------------------------------------------------------

export type Tone = "ok" | "warn" | "bad" | "flat";

/** Selisih persen jumlah temuan agen terhadap rata-rata pembanding. */
export function comparisonDelta(
  agentCount: number,
  average: number,
): number | null {
  const agent = finiteNumber(agentCount);
  const mean = finiteNumber(average);
  if (mean === 0) return agent === 0 ? 0 : null;
  return finiteNumber(((agent - mean) / mean) * 100);
}

/**
 * Untuk JUMLAH TEMUAN, lebih sedikit dari rata-rata adalah baik (hijau) dan
 * lebih banyak adalah buruk (merah). `null` (rata-rata nol, agen punya temuan)
 * juga buruk: agen punya temuan sementara pembanding tidak.
 */
export function findingDeltaTone(
  agentCount: number,
  delta: number | null,
): Tone {
  if (delta === null) return finiteNumber(agentCount) > 0 ? "bad" : "flat";
  if (delta < 0) return "ok";
  if (delta > 0) return "bad";
  return "flat";
}

/** Untuk SKOR, naik adalah baik. */
export function scoreDeltaTone(delta: number | null): Tone {
  if (delta === null) return "flat";
  if (delta > 0) return "ok";
  if (delta < 0) return "bad";
  return "flat";
}

// ---------------------------------------------------------------------------
// Temuan per parameter
// ---------------------------------------------------------------------------

export interface FindingOccurrence {
  month: number;
  year: number;
  ticket: string;
  nilai: number;
}

export interface FindingEntry {
  ketidaksesuaian: string;
  sebaiknya: string;
  occurrences: FindingOccurrence[];
}

export interface FindingGroup {
  parameter: string;
  category: string;
  count: number;
  criticalCount: number;
  entries: FindingEntry[];
}

const INTERNAL_AUDIT_TICKET = "Audit internal";

function ticketLabel(raw: string | null): string {
  const value = (raw ?? "").trim();
  return value ? value.toUpperCase() : INTERNAL_AUDIT_TICKET;
}

function periodKey(year: number, month: number): number {
  return finiteNumber(year) * 100 + finiteNumber(month);
}

/**
 * Temuan dikelompokkan per parameter (paling sering lebih dulu). Di dalam satu
 * parameter, temuan dengan kalimat ketidaksesuaian + saran yang SAMA digabung
 * menjadi satu entri dengan daftar kemunculan (bulan, tiket, nilai), jadi teks
 * yang sama tidak dicetak berulang kali. Tidak ada temuan yang dibuang.
 */
export function groupFindingsByParameter(
  items: TemuanDisplayItemExport[],
): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const item of items) {
    const parameter = item.indicatorName?.trim() || "Parameter tanpa nama";
    const group = groups.get(parameter) ?? {
      parameter,
      category: categoryLabel(item.category),
      count: 0,
      criticalCount: 0,
      entries: [],
    };
    group.count += 1;
    if ((item.category ?? "").toLowerCase() === "critical") {
      group.criticalCount += 1;
    }
    const ketidaksesuaian = item.ketidaksesuaian?.trim() || "—";
    const sebaiknya = item.sebaiknya?.trim() || "—";
    let entry = group.entries.find(
      (candidate) =>
        candidate.ketidaksesuaian === ketidaksesuaian &&
        candidate.sebaiknya === sebaiknya,
    );
    if (!entry) {
      entry = { ketidaksesuaian, sebaiknya, occurrences: [] };
      group.entries.push(entry);
    }
    entry.occurrences.push({
      month: finiteNumber(item.month),
      year: finiteNumber(item.year),
      ticket: ticketLabel(item.no_tiket),
      nilai: finiteNumber(item.nilai),
    });
    groups.set(parameter, group);
  }

  const latest = (entry: FindingEntry) =>
    Math.max(...entry.occurrences.map((o) => periodKey(o.year, o.month)));
  return Array.from(groups.values())
    .map((group) => {
      for (const entry of group.entries) {
        entry.occurrences.sort(
          (a, b) =>
            periodKey(b.year, b.month) - periodKey(a.year, a.month) ||
            a.ticket.localeCompare(b.ticket),
        );
      }
      group.entries.sort(
        (a, b) =>
          b.occurrences.length - a.occurrences.length || latest(b) - latest(a),
      );
      return group;
    })
    .sort(
      (a, b) => b.count - a.count || a.parameter.localeCompare(b.parameter),
    );
}

/** Baris datar untuk tabel/sheet: urut bulan terbaru, lalu nomor tiket. */
export function flatFindingRows(items: TemuanDisplayItemExport[]): Array<{
  period: string;
  ticket: string;
  parameter: string;
  category: string;
  nilai: number;
  nilaiLabel: string;
  ketidaksesuaian: string;
  sebaiknya: string;
}> {
  return items
    .slice()
    .sort(
      (a, b) =>
        periodKey(b.year, b.month) - periodKey(a.year, a.month) ||
        ticketLabel(a.no_tiket).localeCompare(ticketLabel(b.no_tiket)),
    )
    .map((item) => ({
      period: monthLabel(item.month, item.year),
      ticket: ticketLabel(item.no_tiket),
      parameter: item.indicatorName,
      category: categoryLabel(item.category),
      nilai: finiteNumber(item.nilai),
      nilaiLabel: nilaiLabel(item.nilai),
      ketidaksesuaian: item.ketidaksesuaian?.trim() || "—",
      sebaiknya: item.sebaiknya?.trim() || "—",
    }));
}

// ---------------------------------------------------------------------------
// Tren
// ---------------------------------------------------------------------------

export interface TrendSeries {
  key: string;
  label: string;
  data: Array<number | null>;
}

/** Satuan sumbu Y grafik jumlah temuan. */
export const TREND_UNIT_LABEL = "Jumlah temuan";
/** Satuan sumbu Y grafik skor. */
export const SCORE_UNIT_LABEL = "Skor";
export const SCORE_EMPTY_NOTE =
  "Riwayat skor belum tersedia untuk tahun dan layanan ini.";
export const TREND_EMPTY_NOTE =
  "Data tren temuan belum tersedia untuk tahun dan layanan ini.";

/**
 * Tren JUMLAH TEMUAN dari `personalTrend`: satu seri total + tabel parameter
 * (parameter terbanyak lebih dulu). `null` berarti periode tanpa data.
 */
export function findingTrend(data: AgentDetailData): {
  labels: string[];
  total: TrendSeries | null;
  parameters: Array<TrendSeries & { sum: number }>;
} {
  const labels = data.personalTrend?.labels ?? [];
  const datasets = data.personalTrend?.datasets ?? [];
  const toSeries = (
    dataset: (typeof datasets)[number],
    index: number,
  ): TrendSeries => ({
    key: "series-" + index,
    label: dataset.label,
    data: labels.map((_, position) => finiteOrNull(dataset.data[position])),
  });
  const totalIndex = datasets.findIndex((dataset) => dataset.isTotal);
  return {
    labels,
    total: totalIndex >= 0 ? toSeries(datasets[totalIndex], totalIndex) : null,
    parameters: datasets
      .map((dataset, index) => ({ dataset, index }))
      .filter(({ dataset }) => !dataset.isTotal)
      .map(({ dataset, index }) => {
        const series = toSeries(dataset, index);
        return {
          ...series,
          sum: series.data.reduce<number>((acc, value) => acc + (value ?? 0), 0),
        };
      })
      .sort((a, b) => b.sum - a.sum || a.label.localeCompare(b.label)),
  };
}

export type ScoreMetric = "final" | "nonCritical" | "critical";

export interface ScoreChart {
  metric: ScoreMetric;
  title: string;
  series: TrendSeries;
}

const SCORE_METRICS: ReadonlyArray<{ metric: ScoreMetric; title: string }> = [
  { metric: "final", title: "Skor Final" },
  { metric: "nonCritical", title: "Skor Non-Critical" },
  { metric: "critical", title: "Skor Critical" },
];

/**
 * Tiga grafik skor (satu metrik satu grafik) dari `monthlySummaries` — angka
 * yang sama persis dengan tabel Rekap Skor Bulanan, untuk tahun laporan saja.
 */
export function scoreTrend(snapshot: {
  monthlySummaries: AgentPeriodSummary[];
  selectedYear: number;
}): { labels: string[]; charts: ScoreChart[] } {
  const periods = snapshot.monthlySummaries
    .filter((summary) => summary.year === snapshot.selectedYear)
    .slice()
    .sort((a, b) => a.month - b.month);
  if (periods.length === 0) return { labels: [], charts: [] };
  // Tahun sudah dinyatakan di header laporan, jadi sumbu cukup nama bulan.
  const labels = periods.map((period) => shortMonthLabel(period.month, null));
  const value = (summary: AgentPeriodSummary, metric: ScoreMetric) =>
    finiteOrNull(
      metric === "final"
        ? summary.finalScore
        : metric === "nonCritical"
          ? summary.nonCriticalScore
          : summary.criticalScore,
    );
  return {
    labels,
    charts: SCORE_METRICS.map(({ metric, title }) => ({
      metric,
      title,
      series: {
        key: "score-" + metric,
        label: title,
        data: periods.map((period) => value(period, metric)),
      },
    })),
  };
}

/**
 * Domain sumbu skor yang di-zoom: berhenti di 100, dimulai sedikit di bawah
 * nilai terendah (atau target), dengan langkah bulat. Skor 80–95 tidak lagi
 * tampak sebagai garis datar di dasar sumbu 0–100.
 */
export function scoreAxis(values: Array<number | null>): {
  min: number;
  max: number;
  step: number;
} {
  const finite = values.filter((value): value is number => value !== null);
  const low = Math.min(QA_TARGET, ...finite);
  const step = 100 - low > 40 ? 20 : 100 - low > 20 ? 10 : 5;
  const min = Math.max(0, Math.floor((low - step / 2) / step) * step);
  return { min, max: 100, step };
}

/** Sumbu jumlah temuan: dari nol, langkah bulat, maksimal ±5 garis. */
export function countAxis(values: Array<number | null>): {
  min: number;
  max: number;
  step: number;
} {
  const top = Math.max(1, ...values.filter((v): v is number => v !== null));
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (Math.ceil(top / step) <= 5) {
      return { min: 0, max: step * Math.ceil(top / step), step };
    }
  }
  const step = Math.ceil(top / 5 / 1000) * 1000;
  return { min: 0, max: step * Math.ceil(top / step), step };
}

// ---------------------------------------------------------------------------
// Kesimpulan Utama
// ---------------------------------------------------------------------------

/**
 * Tiga sampai lima kalimat yang menjawab "agen ini bagaimana, dan apa yang
 * harus dilakukan". Semua angka berasal dari snapshot apa adanya.
 */
export function buildHighlights(snapshot: AgentReportSnapshot): string[] {
  const lines: string[] = [];
  const activeMonth = resolveActiveMonth(snapshot);
  const active = resolveActiveScore(snapshot.monthlySummaries, activeMonth);

  if (active) {
    const score = finiteNumber(active.current.finalScore);
    const label = monthLabel(active.current.month, active.current.year);
    const gap = Math.round((QA_TARGET - score) * 100) / 100;
    let sentence =
      `Skor ${label}: ${formatNumber(score)} — ` +
      (gap > 0
        ? `${formatNumber(gap)} poin di bawah target ${QA_TARGET}`
        : `memenuhi target ${QA_TARGET}`);
    if (active.previous && active.delta !== null) {
      const previousLabel = monthLabel(
        active.previous.month,
        active.previous.year,
      );
      const delta = Math.round(active.delta * 100) / 100;
      sentence +=
        delta === 0
          ? `, sama dengan ${previousLabel}`
          : `, ${delta > 0 ? "naik" : "turun"} ${formatNumber(Math.abs(delta))} poin dari ${previousLabel}`;
    }
    lines.push(sentence + ".");

    const inYear = snapshot.monthlySummaries.filter(
      (summary) => summary.year === snapshot.selectedYear,
    );
    if (inYear.length > 0) {
      const met = inYear.filter(
        (summary) => finiteNumber(summary.finalScore) >= QA_TARGET,
      ).length;
      lines.push(
        `Target ${QA_TARGET} tercapai di ${met} dari ${inYear.length} bulan yang diaudit pada ${yearText(snapshot.selectedYear)}.`,
      );
    }
  } else {
    lines.push(
      "Belum ada skor audit" +
        (snapshot.selectedService
          ? ` untuk layanan ${serviceLabel(snapshot.selectedService)}`
          : "") +
        ` pada ${yearText(snapshot.selectedYear)}.`,
    );
  }

  const groups = groupFindingsByParameter(snapshot.temuanDisplayItems);
  if (groups.length === 0) {
    lines.push("Tidak ada temuan pada tahun dan layanan ini.");
  } else {
    const top = groups[0];
    const total = snapshot.temuanDisplayItems.length;
    const benchmark = snapshot.data.comparisonTable?.rows.find(
      (row) => row.label === top.parameter,
    );
    const teamAverage = finiteOrNull(benchmark?.teamAverage);
    lines.push(
      `Temuan terbanyak: ${top.parameter} (${formatNumber(top.count)} dari ${formatNumber(total)} temuan` +
        (top.criticalCount > 0
          ? `, ${formatNumber(top.criticalCount)} critical`
          : "") +
        ")" +
        (benchmark && teamAverage !== null
          ? `; rata-rata tim ${formatNumber(teamAverage, 1)}.`
          : "."),
    );
  }

  const cause = snapshot.activeRootCauses[0];
  if (cause) {
    lines.push(`Fokus coaching: ${cause.label} — ${cause.recommendation}`);
  }
  return lines;
}
