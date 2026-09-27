/**
 * Invarian yang TIDAK bisa dibuktikan lewat E2E — satu-satunya test non-E2E
 * yang dipertahankan di Fase 5 untuk generator laporan agen.
 *
 * Semua kontrak lain dari generator ini sudah dipindahkan ke
 * `apps/web/e2e/sidak-agent-report-download.spec.ts` dan
 * `apps/web/e2e/sidak-agent-html-export-parity.spec.ts`, yang mengukurnya dari
 * file yang benar-benar diunduh lewat menu. Test-test lama di sini dihapus
 * hanya SETELAH penggantinya lulus, dan matriks pemetaannya tercatat di
 * `docs/feature-agent-detail-export-csv-md-html.md`.
 *
 * Yang tersisa adalah payload numerik NON-BERHINGGA. Batasnya nyata, bukan
 * alasan formal: fixture E2E melewati HTTP, dan `JSON.stringify` mengubah
 * `NaN` maupun `Infinity` menjadi `null` sebelum sampai ke peramban. Bukti
 * langsungnya — menyuntik `Number.NaN` ke fixture E2E dan melihat test tetap
 * hijau — ada di catatan verifikasi Fase 5 pada
 * `plans/markdown/sidak-agent-report-html-redesign.md`. Jadi nilai non-berhingga
 * hanya bisa masuk lewat cast di sisi runtime, dan hanya jalur itu yang bisa
 * mengujinya.
 *
 * Retensi ini disetujui Fajar untuk invarian "NaN/Infinity runtime payload"
 * (izin non-E2E minimal). Tidak ada test non-E2E lain yang ditambahkan di sini.
 */
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { generateHTML } from "../utils/exportAgentReport";
import type {
  AgentDetailData,
  AgentPeriodSummary,
  RootCauseResult,
} from "@trainers/types";
import type { TemuanDisplayItemExport } from "../utils/exportAgentReport";

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
  {
    id: "p1",
    month: 1,
    year: 2026,
    label: "01/2026",
    serviceType: "call",
    finalScore: 90,
    nonCriticalScore: 88,
    criticalScore: 92,
    sessionCount: 2,
    findingsCount: 3,
  },
  {
    id: "p2",
    month: 5,
    year: 2026,
    label: "05/2026",
    serviceType: "call",
    finalScore: 92,
    nonCriticalScore: 90,
    criticalScore: 94,
    sessionCount: 3,
    findingsCount: 7,
  },
];

const sampleTemuan: TemuanDisplayItemExport[] = [
  {
    id: "t1",
    month: 5,
    year: 2026,
    indicatorName: "Penyampaian Informasi",
    category: "critical",
    nilai: 2,
    ketidaksesuaian: 'Kurang detail, ada "error" data',
    sebaiknya: "Disampaikan lebih lengkap",
    no_tiket: "T-001",
  },
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
    recommendation:
      "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
    evidence: [],
    periods: [
      {
        periodId: "p2",
        month: 5,
        year: 2026,
        label: "05/2026",
        serviceType: "call",
        findingsCount: 2,
        criticalFindingsCount: 1,
        affectedTickets: 2,
      },
    ],
    ticketReferences: [],
  },
];

const sampleData = (overrides?: Partial<AgentDetailData>): AgentDetailData => ({
  peserta: samplePeserta,
  periodSummaries: sampleSummaries,
  temuan: [],
  phantomSessions: [],
  indicators: [],
  weights: {} as AgentDetailData["weights"],
  availableYears: [2026],
  scoreHistory: [],
  rootCauses: sampleRootCauses,
  initialYear: 2026,
  initialService: "call",
  initialTrendRange: { start: 1, end: 5 },
  personalTrend: { labels: [], datasets: [] },
  comparisonTable: undefined,
  ...overrides,
});

describe("generateHTML — payload numerik non-berhingga", () => {
  it("never lets NaN or Infinity from a runtime payload reach the document", () => {
    // Non-finite values are injected in every place a cast could plausibly put
    // one: trend data, period year, ticket deduction/count, and root-cause
    // counts. Each is cast through `unknown` because that is exactly how a
    // value that never crossed a JSON boundary arrives in production.
    const malformed = sampleData({
      personalTrend: {
        labels: ["Jan", "Feb"],
        datasets: [
          {
            label: "Total",
            data: [Number.NaN, Number.POSITIVE_INFINITY] as unknown as number[],
            isTotal: true,
          },
        ],
      },
    });
    const hostileSummaries = [
      {
        ...sampleSummaries[0],
        month: 5,
        year: Number.POSITIVE_INFINITY as unknown as number,
      },
    ];
    const hostileRootCauses = [
      {
        ...sampleRootCauses[0],
        findingsCount: Number.POSITIVE_INFINITY as unknown as number,
        ticketReferences: [
          {
            no_tiket: "T-999",
            periodId: "p-hostile",
            periodLabel: "<b>Mei</b> 2026",
            findingsCount: Number.POSITIVE_INFINITY as unknown as number,
            criticalFindingsCount: 1,
          },
        ],
      },
    ];
    const html = generateHTML(
      malformed,
      hostileSummaries as AgentPeriodSummary[],
      sampleTemuan,
      [
        {
          no_tiket: "T-001",
          scoreDeduction: Number.NaN,
          findingCount: Number.POSITIVE_INFINITY,
          heaviestParam: "Penyampaian Informasi",
          isSamplingQa: false,
        },
      ],
      hostileRootCauses as RootCauseResult[],
      2026,
      "call",
    );

    // A non-finite value in a coordinate is what makes a chart silently blank;
    // `undefined` in a label is what makes a section read "undefined" forever.
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    expect(html).not.toMatch(/width:(?:NaN|Infinity)/);
    // A non-finite count must degrade to "no findings", not to a count.
    expect(html).toContain("0 temuan");
    // The period label in the same payload is still escaped.
    expect(html).toContain("&lt;b&gt;Mei&lt;/b&gt; 2026");
  });
});
