/**
 * Tests for exportAgentReport.ts — CSV, MD, HTML generators
 *
 * Covers: full dataset output, escaping/encoding (comma, quote, newline,
 * HTML entities), empty states, formula-injection CSV protection.
 */
import { describe, it, expect } from "vitest";
import {
  generateCSV,
  generateMD,
  generateHTML,
} from "../utils/exportAgentReport";
import type {
  AgentDetailData,
  AgentPeriodSummary,
  RootCauseResult,
} from "@trainers/types";
import type {
  TicketScoreExport,
  TemuanDisplayItemExport,
} from "../utils/exportAgentReport";

// ── Test Data ──

const samplePeserta: AgentDetailData["peserta"] = {
  id: "agent-1",
  nama: "Noor Qodiri Mobarok",
  tim: "Tim Email",
  batch_name: "Tim Email",
  jabatan: "cca",
  foto_url: null,
  bergabung_date: "2025-05-01",
};

const sampleSummaries: AgentPeriodSummary[] = [
  { id: "p1", month: 1, year: 2026, label: "01/2026", serviceType: "call", finalScore: 90, nonCriticalScore: 88, criticalScore: 92, sessionCount: 2, findingsCount: 3 },
  { id: "p2", month: 5, year: 2026, label: "05/2026", serviceType: "call", finalScore: 92, nonCriticalScore: 90, criticalScore: 94, sessionCount: 3, findingsCount: 7 },
];

const sampleTemuan: TemuanDisplayItemExport[] = [
  { id: "t1", month: 5, year: 2026, indicatorName: "Penyampaian Informasi", category: "critical", nilai: 2, ketidaksesuaian: 'Kurang detail, ada "error" data', sebaiknya: "Disampaikan lebih lengkap", no_tiket: "T-001" },
  { id: "t2", month: 1, year: 2026, indicatorName: "Sapaan Pembuka", category: "non_critical", nilai: 3, ketidaksesuaian: null, sebaiknya: null, no_tiket: null },
  { id: "t3", month: 5, year: 2026, indicatorName: "Kom,data\nbaru", category: "critical", nilai: 1, ketidaksesuaian: 'Nilai, "koma", dan\nnewline', sebaiknya: "Perbaiki handling data", no_tiket: "T-002" },
];

const sampleTickets: TicketScoreExport[] = [
  { no_tiket: "T-001", scoreDeduction: 8.5, findingCount: 3, heaviestParam: "Penyampaian Informasi", isSamplingQa: false },
  { no_tiket: "T-002", scoreDeduction: 5.2, findingCount: 1, heaviestParam: "Komunikasi Data", isSamplingQa: false },
];

const sampleRootCauses: RootCauseResult[] = [
  {
    clusterId: "salah_jawaban",
    label: "Jawaban salah/tidak akurat",
    priority: 8,
    findingsCount: 3,
    affectedTickets: 2,
    criticalFindingsCount: 1,
    averageNilai: 0.5,
    matchedKeywords: ["salah jawaban"],
    recommendation: "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
    evidence: [
      { id: "e1", no_tiket: "T-001", periodId: "p2", indicatorName: "Penyampaian Informasi", nilai: 2, text: "Evidence text" },
    ],
    periods: [
      { periodId: "p2", month: 5, year: 2026, label: "05/2026", serviceType: "call", findingsCount: 2, criticalFindingsCount: 1, affectedTickets: 2 },
      { periodId: "p1", month: 1, year: 2026, label: "01/2026", serviceType: "call", findingsCount: 1, criticalFindingsCount: 0, affectedTickets: 1 },
    ],
  },
];

const sampleData = (overrides?: Partial<AgentDetailData>): AgentDetailData => ({
  peserta: samplePeserta,
  periodSummaries: sampleSummaries,
  temuan: [],
  indicators: [],
  weights: {
    call: { service_type: "call", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    chat: { service_type: "chat", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    email: { service_type: "email", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    cso: { service_type: "cso", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    pencatatan: { service_type: "pencatatan", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    bko: { service_type: "bko", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
    slik: { service_type: "slik", critical_weight: 50, non_critical_weight: 50, scoring_mode: "weighted" },
  },
  availableYears: [2026],
  scoreHistory: [],
  rootCauses: sampleRootCauses,
  initialYear: 2026,
  initialService: "call",
  initialTrendRange: { start: 1, end: 5 },
  personalTrend: {
    labels: ["Jan", "Feb", "Mar"],
    datasets: [
      { label: "Skor Final", data: [90, 88, 92], isTotal: true },
      { label: "NC Score", data: [88, 85, 90], isTotal: false },
    ],
  },
  comparisonTable: {
    scope: {
      year: 2026,
      serviceType: "call",
      startMonth: 1,
      endMonth: 5,
      teamLabel: "Tim Call",
      serviceLabel: "Call",
    },
    rows: [
      { key: "total", label: "Total Temuan", agentCount: 6, teamAverage: 4, serviceAverage: 5, teamAgentCount: 3, serviceAgentCount: 10 },
      { key: "ind-1", label: "Penyampaian Informasi", agentCount: 3, teamAverage: 2, serviceAverage: 2.5, teamAgentCount: 3, serviceAgentCount: 10 },
    ],
  },
  ...overrides,
});

// ── CSV Tests ──

describe("generateCSV", () => {
  it("produces a non-empty string with BOM prefix output format", () => {
    const csv = generateCSV(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026);
    expect(csv).toBeTruthy();
    expect(csv.length).toBeGreaterThan(100);
    // Should contain profile info
    expect(csv).toContain("Noor Qodiri Mobarok");
    expect(csv).toContain("Tim Email");
    // Should contain monthly summaries header
    expect(csv).toContain("Skor Final");
    // Should contain section headers
    expect(csv).toContain("Ringkasan Skor per Bulan");
    expect(csv).toContain("Detail Temuan");
    expect(csv).toContain("Top 5 Pengurang Skor Terbesar");
    expect(csv).toContain("Analisis Akar Masalah");
    expect(csv).toContain("Benchmark Temuan");
  });

  it("escapes commas, quotes, and newlines in values", () => {
    const csv = generateCSV(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026);
    // Value with comma: 'Kurang detail, ada "error" data' should be quoted
    expect(csv).toContain('"Kurang detail, ada ""error"" data"');
    // Value with newline and comma: 'Kom,data\nbaru'
    expect(csv).toContain('"Kom,data');
    expect(csv).toContain('baru"');
    // Value with quotes and newline: 'Nilai, "koma", dan\nnewline'
    expect(csv).toContain('"Nilai, ""koma"", dan');
    expect(csv).toContain('newline"');
  });

  it("protects against CSV formula injection", () => {
    // Create a finding with a formula-injection-prone value
    const malicious: TemuanDisplayItemExport[] = [
      { id: "t99", month: 5, year: 2026, indicatorName: "=SUM(A1:A10)", category: "non_critical", nilai: 0, ketidaksesuaian: "+CMD", sebaiknya: "@DANGER", no_tiket: null },
    ];
    const csv = generateCSV(sampleData(), sampleSummaries, malicious, sampleTickets, sampleRootCauses, 2026);
    // Values starting with =, +, -, @ should be quoted
    expect(csv).toContain('"=SUM(A1:A10)"');
    expect(csv).toContain('"+CMD"');
    expect(csv).toContain('"@DANGER"');
  });

  it("handles empty arrays gracefully", () => {
    const csv = generateCSV(
      sampleData({ personalTrend: { labels: [], datasets: [] }, comparisonTable: undefined }),
      [],
      [],
      [],
      [],
      2026,
    );
    expect(csv).toContain("Noor Qodiri Mobarok");
    // Should not crash
    expect(csv.length).toBeGreaterThan(50);
  });

  it("includes trend data headers and values when present", () => {
    const csv = generateCSV(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026);
    expect(csv).toContain("Data Tren");
    expect(csv).toContain("Skor Final");
    expect(csv).toContain("NC Score");
    expect(csv).toContain("90");
  });

  it("includes comparison table data", () => {
    const csv = generateCSV(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026);
    expect(csv).toContain("Total Temuan");
    expect(csv).toContain("Penyampaian Informasi");
  });
});

// ── MD Tests ──

describe("generateMD", () => {
  it("produces valid markdown with headers and tables", () => {
    const md = generateMD(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026);
    expect(md).toContain("# Laporan Audit Agent: Noor Qodiri Mobarok");
    expect(md).toContain("## Profil Agent");
    expect(md).toContain("## Ringkasan Skor per Bulan");
    expect(md).toContain("## Detail Temuan");
    expect(md).toContain("## Top 5 Pengurang Skor Terbesar");
    expect(md).toContain("## Analisis Akar Masalah");
    expect(md).toContain("|"); // Tables
    expect(md).toContain("---"); // Table separators
  });

  it("escapes pipe characters in values", () => {
    const items: TemuanDisplayItemExport[] = [
      { id: "t1", month: 5, year: 2026, indicatorName: "Pipe | symbol", category: "critical", nilai: 1, ketidaksesuaian: "A | B", sebaiknya: "C | D", no_tiket: "T|001" },
    ];
    const md = generateMD(sampleData(), sampleSummaries, items, sampleTickets, sampleRootCauses, 2026);
    // Pipes should be backslash-escaped
    expect(md).toContain("Pipe \\| symbol");
    expect(md).toContain("A \\| B");
    expect(md).toContain("C \\| D");
    expect(md).toContain("T\\|001");
  });

  it("renders root causes with details", () => {
    const md = generateMD(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026);
    expect(md).toContain("Jawaban salah/tidak akurat");
    expect(md).toContain("Fokuskan coaching");
    expect(md).toContain("Prioritas");
  });

  it("includes trend and comparison data", () => {
    const md = generateMD(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026);
    expect(md).toContain("## Data Tren");
    expect(md).toContain("Skor Final");
    expect(md).toContain("## Benchmark Temuan");
    expect(md).toContain("Total Temuan");
  });

  it("shows empty state messages when no data", () => {
    const md = generateMD(sampleData(), [], [], [], [], 2026);
    expect(md).toContain("Tidak ada data ringkasan");
    expect(md).toContain("Tidak ada temuan");
    expect(md).toContain("Tidak ada tiket");
    expect(md).toContain("Belum ada pola akar masalah");
  });
});

// ── HTML Tests ──

describe("generateHTML", () => {
  it("renders a static inline SVG chart inside responsive table boundaries", () => {
    const html = generateHTML(
      sampleData(),
      sampleSummaries,
      sampleTemuan,
      sampleTickets,
      sampleRootCauses,
      2026,
      "call",
      "static",
    );

    expect(html).toContain('data-report-variant="static"');
    expect(html).toContain('<svg class="trend-chart"');
    expect(html).toContain('data-series="Skor Final"');
    expect(html).toContain('class="table-scroll"');
    expect(html).not.toMatch(/<script(?:\s|>)/i);
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it.each([
    {
      name: "single point",
      trend: {
        labels: ["Jan"],
        datasets: [{ label: "Total Temuan", data: [4], isTotal: true }],
      },
    },
    {
      name: "all zero values",
      trend: {
        labels: ["Jan", "Feb"],
        datasets: [{ label: "Total Temuan", data: [0, 0], isTotal: true }],
      },
    },
    {
      name: "missing value",
      trend: {
        labels: ["Jan", "Feb"],
        datasets: [
          {
            label: "Total Temuan",
            data: [3, undefined] as unknown as number[],
            isTotal: true,
          },
        ],
      },
    },
  ])("keeps $name chart coordinates finite", ({ trend }) => {
    const html = generateHTML(
      sampleData({ personalTrend: trend }),
      sampleSummaries,
      sampleTemuan,
      sampleTickets,
      sampleRootCauses,
      2026,
      "call",
      "static",
    );

    expect(html).toContain('<svg class="trend-chart"');
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it("renders dependency-free interactive trend filters", () => {
    const html = generateHTML(
      sampleData(),
      sampleSummaries,
      sampleTemuan,
      sampleTickets,
      sampleRootCauses,
      2026,
      "call",
      "interactive",
    );

    expect(html).toContain('data-report-variant="interactive"');
    expect(html).toContain('data-trend-filter="summary"');
    expect(html).toContain('data-trend-filter="total"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/<script>\s*\(\(\) =>/);
    expect(html).not.toContain("<script src=");
  });

  it("changes SVG and legend visibility when an interactive parameter is clicked", () => {
    const html = generateHTML(
      sampleData({
        personalTrend: {
          labels: ["Jan", "Feb", "Mar"],
          datasets: [
            { label: "Total Temuan", data: [3, 4, 5], isTotal: true },
            { label: "Parameter A", data: [1, 2, 1], isTotal: false },
            { label: "Parameter B", data: [2, 2, 4], isTotal: false },
          ],
        },
      }),
      sampleSummaries,
      sampleTemuan,
      sampleTickets,
      sampleRootCauses,
      2026,
      "call",
      "interactive",
    );
    const parsed = new DOMParser().parseFromString(html, "text/html");
    document.body.innerHTML = parsed.body.innerHTML;
    const script = parsed.querySelector("script")?.textContent;
    expect(script).toBeTruthy();
    expect(script).toContain("toggleAttribute('hidden', !visible)");
    expect(script).not.toContain("node.hidden = !visible");
    new Function(script ?? "")();

    const button = document.querySelector<HTMLButtonElement>(
      '[data-trend-filter="series-1"]',
    );
    const selectedNodes = Array.from(
      document.querySelectorAll('[data-chart-series][data-series-key="series-1"]'),
    );
    const otherNodes = Array.from(
      document.querySelectorAll('[data-chart-series][data-series-key="series-2"]'),
    );
    expect(button).not.toBeNull();
    expect(selectedNodes).toHaveLength(2);
    expect(otherNodes).toHaveLength(2);

    button?.click();

    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedNodes.every((node) => !node.hasAttribute("hidden"))).toBe(true);
    expect(otherNodes.every((node) => node.hasAttribute("hidden"))).toBe(true);

    button?.click();

    expect(
      document.querySelector('[data-trend-filter="summary"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(otherNodes.every((node) => !node.hasAttribute("hidden"))).toBe(true);
  });

  it("uses the live agent-detail hierarchy for trend and grouped findings", () => {
    const html = generateHTML(
      sampleData(),
      sampleSummaries,
      sampleTemuan,
      sampleTickets,
      sampleRootCauses,
      2026,
      "call",
      "interactive",
    );

    expect(html).toContain("Tren Kinerja");
    expect(html).toContain("Pergerakan skor per periode audit");
    expect(html).toContain("Volume Periode");
    expect(html).toContain("Insight Tren");
    expect(html).toContain('class="findings-period"');
  });

  it("keeps script-closing trend labels inert in interactive HTML", () => {
    const payload = "</script><script>alert(1)</script>";
    const html = generateHTML(
      sampleData({
        personalTrend: {
          labels: ["Jan"],
          datasets: [{ label: payload, data: [3], isTotal: true }],
        },
      }),
      sampleSummaries,
      sampleTemuan,
      sampleTickets,
      sampleRootCauses,
      2026,
      "call",
      "interactive",
    );

    expect(html).not.toContain(payload);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;/script&gt;");
  });

  it("produces a fully self-contained offline HTML document (no external dependencies)", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
    // Has inline CSS (fully self-contained)
    expect(html).toContain("background: #f8fafc");
    // No external font resources
    expect(html).not.toContain("https://fonts.googleapis.com");
    expect(html).not.toContain("https://fonts.gstatic.com");
    // No @import CSS rules
    expect(html).not.toContain("@import");
    // No external stylesheet links
    expect(html).not.toContain('<link href="http');
    // No external scripts
    expect(html).not.toContain('<script src=');
  });

  it("includes agent profile info", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("Noor Qodiri Mobarok");
    expect(html).toContain("Tim Email");
    expect(html).toContain("cca");
  });

  it("renders score summary table", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("Analisis Performa Bulanan");
    expect(html).toContain("01/2026");
    expect(html).toContain("05/2026");
  });

  it("renders findings table with all columns", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("Riwayat Temuan Detil");
    expect(html).toContain("Penyampaian Informasi");
    expect(html).toContain("Sapaan Pembuka");
    expect(html).toContain("SESUAI");
    expect(html).toContain("PERBAIKAN");
  });

  it("escapes HTML special characters in values", () => {
    const malicious: TemuanDisplayItemExport[] = [
      { id: "t99", month: 5, year: 2026, indicatorName: "<script>alert('xss')</script>", category: "critical", nilai: 3, ketidaksesuaian: "&quot;quote&quot;", sebaiknya: "<b>bold</b>", no_tiket: null },
    ];
    const html = generateHTML(sampleData(), sampleSummaries, malicious, sampleTickets, sampleRootCauses, 2026, "call");
    // HTML special chars should be escaped
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert");
    expect(html).toContain("&amp;quot;quote&amp;quot;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("renders top tickets section", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("Top 5 Pengurang Skor Terbesar");
    expect(html).toContain("T-001");
    expect(html).toContain("8.5");
  });

  it("renders root causes section", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("Diagnosis Akar Masalah");
    expect(html).toContain("Jawaban salah/tidak akurat");
    expect(html).toContain("Fokuskan coaching");
  });

  it("renders trend data when present", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("Data Tren");
    expect(html).toContain("Jan");
    expect(html).toContain("Feb");
    expect(html).toContain("Skor Final");
  });

  it("renders comparison table when present", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    expect(html).toContain("Benchmark Temuan");
    expect(html).toContain("Total Temuan");
    expect(html).toContain("Penyampaian Informasi");
  });

  it("matches the live six-column benchmark and delta semantics", () => {
    const html = generateHTML(
      sampleData({
        comparisonTable: {
          scope: {
            year: 2026,
            serviceType: "call",
            startMonth: 1,
            endMonth: 5,
            teamLabel: "Tim Call",
            serviceLabel: "Call",
          },
          rows: [
            {
              key: "total",
              label: "Total Temuan",
              agentCount: 6,
              teamAverage: 4,
              serviceAverage: 12,
              teamAgentCount: 3,
              serviceAgentCount: 10,
            },
            {
              key: "zero",
              label: "Tanpa Temuan",
              agentCount: 0,
              teamAverage: 0,
              serviceAverage: 0,
              teamAgentCount: 3,
              serviceAgentCount: 10,
            },
            {
              key: "no-baseline",
              label: "Tanpa Baseline",
              agentCount: 1,
              teamAverage: 0,
              serviceAverage: 0,
              teamAgentCount: 3,
              serviceAgentCount: 10,
            },
          ],
        },
      }),
      sampleSummaries,
      sampleTemuan,
      sampleTickets,
      sampleRootCauses,
      2026,
      "call",
      "static",
    );

    expect(html).toContain("Rata-rata layanan sama");
    expect(html).toContain("% vs tim");
    expect(html).toContain("% vs layanan sama");
    expect(html).toContain("+50%");
    expect(html).toContain("-50%");
    expect(html).toContain("0%");
    expect(html).toContain("n/a");
    expect(html).toContain("3 agent tim / 10 agent layanan sama");
  });

  it("handles empty state gracefully", () => {
    const html = generateHTML(
      sampleData({ personalTrend: { labels: [], datasets: [] }, comparisonTable: undefined }),
      [],
      [],
      [],
      [],
      2026,
      "call",
    );
    expect(html).toContain("Belum ada ringkasan skor");
    expect(html).toContain("Tidak ada data temuan");
  });

  it("is light mode (no dark theme colors)", () => {
    const html = generateHTML(sampleData(), sampleSummaries, sampleTemuan, sampleTickets, sampleRootCauses, 2026, "call");
    // Dark ink is allowed for text, but the document must not enable dark mode.
    expect(html).not.toContain("class=\"dark\"");
    // Should contain light mode background
    expect(html).toContain("#f8fafc"); // body background
    expect(html).toContain("#ffffff"); // card background
  });
});
