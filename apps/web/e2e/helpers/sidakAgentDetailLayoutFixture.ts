/**
 * Fixture SINTETIS untuk spec tata letak detail agent (`/sidak/agents/:id`).
 *
 * Harness `sidakAgentDetailDatesHarness` sengaja minimal (satu bulan, satu
 * temuan). Spec tata letak butuh halaman yang "penuh": beberapa bulan dengan
 * skor naik-turun, beberapa tiket pengurang, akar masalah lebih dari satu,
 * dan ranking + forecast. Semua nama, tiket, dan angka di sini karangan.
 */

import { AGENT_ID } from "./sidakAgentDetailDatesHarness";

const INDICATORS = [
  {
    id: "dddddddd-4444-4444-8444-ddddddddddd1",
    name: "Kesesuaian Data",
    category: "non_critical",
    bobot: 0.15,
  },
  {
    id: "dddddddd-4444-4444-8444-ddddddddddd2",
    name: "Ketepatan Solusi",
    category: "critical",
    bobot: 0.35,
  },
  {
    id: "dddddddd-4444-4444-8444-ddddddddddd3",
    name: "Verifikasi Identitas",
    category: "critical",
    bobot: 0.25,
  },
  {
    id: "dddddddd-4444-4444-8444-ddddddddddd4",
    name: "Empati dan Bahasa",
    category: "non_critical",
    bobot: 0.25,
  },
];

/** Skor per bulan Jan–Jun 2026; Jun dipilih otomatis sebagai bulan aktif. */
export const MONTH_SCORES = [
  { month: 1, score: 96.4, findings: 1, sessions: 5 },
  { month: 2, score: 91.2, findings: 3, sessions: 6 },
  { month: 3, score: 88.7, findings: 4, sessions: 6 },
  { month: 4, score: 93.5, findings: 2, sessions: 5 },
  { month: 5, score: 79.8, findings: 6, sessions: 7 },
  { month: 6, score: 84.1, findings: 5, sessions: 6 },
] as const;

const MONTH_LABELS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni"];

function periodId(month: number) {
  return `bbbbbbbb-2222-4222-8222-${String(month).padStart(12, "0")}`;
}

/** Tiket bulan Juni: nilai rendah pada indikator berbobot besar. */
export const JUNE_TICKETS = [
  "TKT-2026-06-118",
  "TKT-2026-06-142",
  "TKT-2026-06-177",
];

function temuanRows() {
  const rows: unknown[] = [];
  let seq = 0;
  const push = (
    month: number,
    ticket: string,
    indicator: number,
    nilai: number,
    text: string,
  ) => {
    seq += 1;
    rows.push({
      id: `eeeeeeee-1111-4111-8111-${String(seq).padStart(12, "0")}`,
      peserta_id: AGENT_ID,
      period_id: periodId(month),
      indicator_id: INDICATORS[indicator]!.id,
      service_type: "call",
      no_tiket: ticket,
      nilai,
      ketidaksesuaian: text,
      sebaiknya: "Ikuti standar jawaban dan konfirmasi ulang ke nasabah.",
      tanggal_layanan: `2026-${String(month).padStart(2, "0")}-1${seq % 9}`,
      tanggal_sampel: null,
      is_phantom_padding: false,
    });
  };
  push(6, JUNE_TICKETS[0]!, 1, 0, "Solusi tidak sesuai produk");
  push(6, JUNE_TICKETS[0]!, 0, 1, "Data alamat tidak dicek");
  push(6, JUNE_TICKETS[1]!, 2, 1, "Verifikasi identitas tidak lengkap");
  push(6, JUNE_TICKETS[2]!, 3, 2, "Nada bicara terburu-buru");
  push(6, JUNE_TICKETS[2]!, 0, 2, "Salah input nomor rekening");
  push(5, "TKT-2026-05-031", 1, 0, "Salah jawaban terkait limit");
  push(5, "TKT-2026-05-044", 2, 1, "Lupa verifikasi tanggal lahir");
  push(3, "TKT-2026-03-090", 3, 2, "Kurang empati");
  return rows;
}

function rootCauses() {
  const juneRef = (ticket: string, findings: number, critical: number) => ({
    no_tiket: ticket,
    periodId: periodId(6),
    periodLabel: "Juni 2026",
    findingsCount: findings,
    criticalFindingsCount: critical,
  });
  const breakdown = (
    month: number,
    findings: number,
    critical: number,
    tickets: number,
  ) => ({
    periodId: periodId(month),
    month,
    year: 2026,
    label: `${MONTH_LABELS[month - 1]} 2026`,
    serviceType: "call",
    findingsCount: findings,
    criticalFindingsCount: critical,
    affectedTickets: tickets,
  });
  return [
    {
      clusterId: "salah_jawaban",
      label: "Salah jawaban atau solusi",
      priority: 3,
      findingsCount: 0,
      affectedTickets: 0,
      criticalFindingsCount: 0,
      averageNilai: 0.5,
      matchedKeywords: ["solusi"],
      recommendation:
        "Latih ulang skenario limit dan produk kartu memakai studi kasus tiket nyata.",
      evidence: [],
      periods: [breakdown(5, 1, 1, 1), breakdown(6, 1, 1, 1)],
      ticketReferences: [juneRef(JUNE_TICKETS[0]!, 1, 1)],
    },
    {
      clusterId: "kurang_teliti_verifikasi_data",
      label: "Kurang teliti verifikasi data",
      priority: 2,
      findingsCount: 0,
      affectedTickets: 0,
      criticalFindingsCount: 0,
      averageNilai: 1.2,
      matchedKeywords: ["verifikasi"],
      recommendation:
        "Pakai checklist verifikasi tiga langkah sebelum menutup panggilan.",
      evidence: [],
      periods: [breakdown(5, 1, 1, 1), breakdown(6, 2, 1, 2)],
      ticketReferences: [
        juneRef(JUNE_TICKETS[0]!, 1, 0),
        juneRef(JUNE_TICKETS[1]!, 1, 1),
      ],
    },
    {
      clusterId: "kurang_paham_standar_jawaban",
      label: "Kurang paham standar jawaban",
      priority: 1,
      findingsCount: 0,
      affectedTickets: 0,
      criticalFindingsCount: 0,
      averageNilai: 2,
      matchedKeywords: ["empati"],
      recommendation: "Dengarkan dua rekaman contoh terbaik tim setiap minggu.",
      evidence: [],
      periods: [breakdown(3, 1, 0, 1), breakdown(6, 1, 0, 1)],
      ticketReferences: [juneRef(JUNE_TICKETS[2]!, 1, 0)],
    },
  ];
}

export function richAgentDetailPayload() {
  return {
    indicators: INDICATORS.map((indicator) => ({
      ...indicator,
      service_type: "call",
      parameter_group: null,
      is_active: true,
    })),
    periodSummaries: MONTH_SCORES.map((m) => ({
      id: periodId(m.month),
      month: m.month,
      year: 2026,
      serviceType: "call",
      label: `${MONTH_LABELS[m.month - 1]} 2026`,
      finalScore: m.score,
      findingsCount: m.findings,
      nonCriticalScore: Math.min(100, m.score + 4),
      criticalScore: Math.max(0, m.score - 6),
      sessionCount: m.sessions,
      totalPenaltyWeight: (100 - m.score) / 100,
      isSamplingQa: false,
    })),
    selectedPeriod: null,
    temuan: temuanRows(),
    phantomSessions: [],
    rootCauses: rootCauses(),
    weights: {
      call: {
        service_type: "call",
        critical_weight: 0.6,
        non_critical_weight: 0.4,
        scoring_mode: "weighted",
      },
    },
    personalTrend: {
      labels: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"],
      datasets: [
        {
          label: "Total temuan",
          data: MONTH_SCORES.map((m) => m.findings),
          isTotal: true,
        },
      ],
    },
    availableYears: [2026, 2025],
    scoreHistory: [],
    initialService: "call",
    initialTrendRange: { start: 1, end: 12 },
    peserta: {
      id: AGENT_ID,
      nama: "Rahmawati Kusumaningrum",
      tim: "Tim Kartu Kredit",
      batch_name: "Batch Januari 2025",
      jabatan: "Agent Senior",
      foto_url: null,
      bergabung_date: "2024-02-01",
    },
    comparisonTable: undefined,
  };
}

export function richQuickviewPayload() {
  return {
    context: {
      agentId: AGENT_ID,
      year: 2026,
      serviceType: "call",
      periodMode: "ytd",
    },
    combinedTeam: {
      rank: 7,
      total: 42,
      scopeId: "scope-combined",
      scopeLabel: "Semua agen layanan Call",
      basis: "least_findings_ytd",
      tiedAgents: [],
    },
    leaderTeam: {
      rank: 3,
      total: 12,
      scopeId: "scope-leader",
      scopeLabel: "Tim Leader Andika",
      basis: "least_findings_ytd",
      tiedAgents: [{ agentId: "peer-1", nama: "Dimas Prakoso" }],
    },
    forecast: {
      status: "declining",
      label: "Memburuk",
      supportingText: "Temuan diperkirakan naik dalam 3 bulan ke depan.",
      findingsSlope: 0.6,
      sourcePointCount: 6,
      confidence: "medium",
      horizonMonths: 3,
    },
  };
}

export const LAYOUT_FOLDERS = [{ id: "folder-1", name: "Batch Januari 2025" }];
export const LAYOUT_FOLDER_AGENTS = [
  { id: AGENT_ID, nama: "Rahmawati Kusumaningrum" },
  { id: "peer-1", nama: "Dimas Prakoso" },
];

/** Direktori agen untuk pemilih agen (`GET /sidak/agents`). */
export const LAYOUT_DIRECTORY_AGENTS = [
  {
    id: AGENT_ID,
    nama: "Rahmawati Kusumaningrum",
    tim: "Tim Kartu Kredit",
    batch: "B1",
    batch_name: "Batch Januari 2025",
    foto_url: null,
    jabatan: "Agent Senior",
    avgScore: 88,
    trend: "down",
    trendValue: -2,
    atRisk: false,
  },
  {
    id: "peer-1",
    nama: "Dimas Prakoso",
    tim: "Tim Kartu Kredit",
    batch: "B1",
    batch_name: "Batch Januari 2025",
    foto_url: null,
    jabatan: "Agent",
    avgScore: 91,
    trend: "up",
    trendValue: 1,
    atRisk: false,
  },
  {
    id: "peer-2",
    nama: "Sari Wulandari",
    tim: "Tim Tabungan",
    batch: "B2",
    batch_name: "Batch Maret 2025",
    foto_url: null,
    jabatan: "Agent",
    avgScore: 94,
    trend: "same",
    trendValue: 0,
    atRisk: false,
  },
];
