import type {
  QAIndicator,
  QAPeriod,
  QATemuan,
  RootCauseClusterId,
  RootCauseResult,
  RootCauseEvidence,
  RootCausePeriodBreakdown,
  RootCauseTicketReference,
  ServiceType,
} from "@trainers/types";

// ─── Registry ───────────────────────────────────────────────────────────────

interface RegistryEntry {
  clusterId: RootCauseClusterId;
  priority: number;
  label: string;
  keywords: string[];
  recommendation: string;
}

const ROOT_CAUSE_REGISTRY: RegistryEntry[] = [
  {
    clusterId: "salah_nama_perusahaan_produk",
    priority: 10,
    label: "Salah nama perusahaan/produk",
    keywords: [
      "nama perusahaan salah",
      "salah nama perusahaan",
      "nama produk salah",
      "penulisan nama pujk tidak sesuai",
    ],
    recommendation:
      "Perkuat pengecekan nama perusahaan, produk, dan istilah PUJK sebelum respons dikirim.",
  },
  {
    clusterId: "kelebihan_standar_jawaban",
    priority: 9,
    label: "Jawaban melebihi standar",
    keywords: [
      "sj tidak diperlukan",
      "standar jawaban tidak diperlukan",
      "informasi berlebihan",
      "penjelasan berlebihan",
      "di luar konteks pertanyaan",
    ],
    recommendation:
      "Latih agent menjawab sesuai konteks pertanyaan dan hanya memakai standar jawaban yang relevan.",
  },
  {
    clusterId: "salah_penggunaan_sistem",
    priority: 9,
    label: "Kesalahan penggunaan sistem/APPK",
    keywords: [
      "appk",
      "pada appk",
      "di appk",
    ],
    recommendation:
      "Latih agent memilih tiket, mengisi kolom, dan mencatat data dengan benar di sistem yang tersedia.",
  },
  {
    clusterId: "salah_jawaban",
    priority: 8,
    label: "Jawaban salah/tidak akurat",
    keywords: [
      "salah jawaban",
      "jawaban salah",
      "informasi tidak akurat",
      "tidak sesuai ketentuan",
      // Phase 2 expansion — audit-backed from top fallback patterns
      "tidak sesuai dalam memilih",   // APPK/CRM selection errors (231x)
      "tidak sesuai memilih",         // broader selection errors (813x "memilih")
      "salah memilih",                // direct wrong selection
      "tidak sesuai dalam memberikan", // incorrect information provision
      "tidak sesuai dalam menuliskan", // incorrect writing/recording
      "tidak sesuai menuliskan",       // variant without "dalam"
      "tidak sesuai dalam menyampaikan", // incorrect information delivery (32x)
      "tidak sesuai dalam melakukan",    // incorrect action/execution (45x verb pattern)
      "salah menulis",                 // wrong writing (sample evidence)
      "tidak memberikan jawaban",      // didn't give correct answer
      "belum memperbaiki",              // hasn't fixed previously flagged issue (163x)
    ],
    recommendation:
      "Fokuskan coaching pada validasi aturan dan akurasi informasi sebelum jawaban final.",
  },
  {
    clusterId: "kurang_teliti_verifikasi_data",
    priority: 7,
    label: "Kurang teliti verifikasi data",
    keywords: [
      "kurang teliti",
      "verifikasi data",
      "tidak verifikasi",
      "tidak melakukan verifikasi",
      "salah verifikasi",
      "data tidak sesuai",
      "tidak mengecek data",
      "konfirmasi data",
      // Phase 2 expansion — data recording/entry errors
      "tidak sesuai mencatat",        // incorrect recording of data
      "tidak mencatat",               // missing recording
      "tidak menuliskan",             // missing writing/entry
      "tidak melampirkan",            // missing document attachment
    ],
    recommendation:
      "Biasakan checklist verifikasi data pelanggan dan pastikan data dikonfirmasi sebelum memberi arahan.",
  },
  {
    clusterId: "kurang_paham_standar_jawaban",
    priority: 6,
    label: "Kurang paham standar jawaban",
    keywords: [
      "kurang paham standar jawaban",
      "tidak memahami standar jawaban",
      "tidak sesuai sj",
      "tidak mengikuti standar jawaban",
      "standar jawaban",
      "panduan jawaban",
    ],
    recommendation:
      "Review ulang standar jawaban untuk skenario terkait dan latih pemilihan template yang tepat.",
  },
  {
    clusterId: "kurang_menggali",
    priority: 5,
    label: "Kurang menggali kebutuhan",
    keywords: [
      "tidak bertanya",
      "kurang menggali",
      "berasumsi",
      "terlewat",
      "tidak tuntas",
      // Phase 2 expansion
      "tidak menanyakan",             // did not ask about specific details
      "tidak melakukan probing",      // didn't probe further
    ],
    recommendation:
      "Latih pertanyaan klarifikasi agar kebutuhan, kronologi, dan konteks pelanggan tergali tuntas.",
  },
];

const FALLBACK_ROOT_CAUSE: RegistryEntry = {
  clusterId: "lainnya",
  priority: 0,
  label: "Lainnya",
  keywords: [],
  recommendation:
    "Review contoh temuan secara manual untuk menentukan pola coaching yang paling tepat.",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTicketKey(row: Pick<QATemuan, "id" | "no_tiket">): string {
  const rawTicket = (row.no_tiket ?? "").trim();
  return rawTicket ? rawTicket.toUpperCase() : `audit-${row.id}`;
}

function pickEvidenceText(
  row: Pick<QATemuan, "ketidaksesuaian" | "sebaiknya">,
  indicatorName: string,
): string {
  return (
    row.ketidaksesuaian?.trim() ??
    row.sebaiknya?.trim() ??
    `Temuan pada parameter ${indicatorName}`
  );
}

function buildSearchText(
  row: Pick<QATemuan, "ketidaksesuaian" | "sebaiknya">,
  indicatorName: string,
): string {
  return normalizeText(
    [row.ketidaksesuaian, row.sebaiknya, indicatorName]
      .filter(Boolean)
      .join(" "),
  );
}

function matchCluster(searchText: string): {
  entry: RegistryEntry;
  matchedKeywords: string[];
} {
  let bestMatch: {
    entry: RegistryEntry;
    matchedKeywords: string[];
  } | null = null;

  for (const entry of ROOT_CAUSE_REGISTRY) {
    const matchedKeywords = entry.keywords.filter((keyword) =>
      searchText.includes(normalizeText(keyword)),
    );

    if (matchedKeywords.length === 0) continue;

    const hasMoreKeywordMatches =
      !bestMatch ||
      matchedKeywords.length > bestMatch.matchedKeywords.length;
    const winsPriorityTie =
      bestMatch !== null &&
      matchedKeywords.length === bestMatch.matchedKeywords.length &&
      entry.priority > bestMatch.entry.priority;

    if (hasMoreKeywordMatches || winsPriorityTie) {
      bestMatch = { entry, matchedKeywords };
    }
  }

  return (
    bestMatch ?? {
      entry: FALLBACK_ROOT_CAUSE,
      matchedKeywords: [],
    }
  );
}

function buildPeriodLabelFromTicketNumber(noTiket: string): string | null {
  const match = noTiket.trim().toUpperCase().match(/^[A-Z](\d{2})(\d{2})/);
  if (!match) return null;

  const year = 2000 + Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  return `${String(month).padStart(2, "0")}/${year}`;
}

function fallbackPeriodLabel(noTiket?: string): string {
  if (noTiket) {
    const ticketPeriodLabel = buildPeriodLabelFromTicketNumber(noTiket);
    if (ticketPeriodLabel) return ticketPeriodLabel;
  }

  return "Periode tidak dikenal";
}

// ─── Internal accumulator types ─────────────────────────────────────────────

interface PeriodAccumulator {
  findingsCount: number;
  criticalFindingsCount: number;
  ticketSet: Set<string>;
}

interface TicketRefAcc {
  no_tiket: string;
  periodId: string;
  serviceType: ServiceType;
  findingsCount: number;
  criticalFindingsCount: number;
}

interface ClusterAccumulator {
  entry: RegistryEntry;
  matchedKeywords: Set<string>;
  findingsCount: number;
  criticalFindingsCount: number;
  nilaiTotal: number;
  ticketSet: Set<string>;
  evidence: RootCauseEvidence[];
  periodMap: Map<string, PeriodAccumulator>; // key = periodId:serviceType
  ticketRefs: Map<string, TicketRefAcc>; // key = NO_TIKET::periodId:serviceType
}

// ─── Main function ──────────────────────────────────────────────────────────

export interface DeriveAgentRootCausesInput {
  temuan: Array<
    Pick<
      QATemuan,
      | "id"
      | "period_id"
      | "indicator_id"
      | "service_type"
      | "no_tiket"
      | "nilai"
      | "tahun"
      | "ketidaksesuaian"
      | "sebaiknya"
      | "is_phantom_padding"
    >
  >;
  indicators: QAIndicator[];
  periodById: Map<string, QAPeriod>;
  serviceType?: ServiceType;
  maxResults?: number;
  maxEvidencePerCluster?: number;
}

export function deriveAgentRootCauses(
  input: DeriveAgentRootCausesInput,
): RootCauseResult[] {
  const {
    temuan,
    indicators,
    periodById,
    serviceType,
    maxResults = 5,
    maxEvidencePerCluster = 3,
  } = input;

  const indicatorById = new Map(
    indicators.map((indicator) => [indicator.id, indicator]),
  );
  const groups = new Map<RootCauseClusterId, ClusterAccumulator>();

  for (const row of temuan) {
    // Exclude phantom padding
    if (row.is_phantom_padding === true) continue;

    // nilai = 3 recommendation rows carry evidence text and are countable.
    const nilai = Number.isFinite(row.nilai)
      ? Math.max(0, Math.min(3, Number(row.nilai)))
      : 3;

    // Filter by service type if provided
    if (serviceType && row.service_type !== serviceType) continue;

    // Resolve indicator name
    const indicator = indicatorById.get(row.indicator_id);
    const indicatorName = indicator?.name ?? "Parameter tidak dikenal";

    // Build search text and match cluster
    const searchText = buildSearchText(row, indicatorName);
    const { entry, matchedKeywords } = matchCluster(searchText);

    // Get or create accumulator
    let accumulator = groups.get(entry.clusterId);
    if (!accumulator) {
      accumulator = {
        entry,
        matchedKeywords: new Set(),
        findingsCount: 0,
        criticalFindingsCount: 0,
        nilaiTotal: 0,
        ticketSet: new Set(),
        evidence: [],
        periodMap: new Map(),
        ticketRefs: new Map(),
      };
      groups.set(entry.clusterId, accumulator);
    }

    // Accumulate metrics
    accumulator.findingsCount += 1;
    if (nilai === 0) accumulator.criticalFindingsCount += 1;
    accumulator.nilaiTotal += nilai;

    // Track unique tickets
    const ticketKey = getTicketKey(row);
    accumulator.ticketSet.add(ticketKey);

    // Track matched keywords
    for (const keyword of matchedKeywords) {
      accumulator.matchedKeywords.add(keyword);
    }

    // Accumulate period breakdown
    const periodKey = `${row.period_id}:${row.service_type}`;
    let periodAcc = accumulator.periodMap.get(periodKey);
    if (!periodAcc) {
      periodAcc = {
        findingsCount: 0,
        criticalFindingsCount: 0,
        ticketSet: new Set(),
      };
      accumulator.periodMap.set(periodKey, periodAcc);
    }
    periodAcc.findingsCount += 1;
    if (nilai === 0) periodAcc.criticalFindingsCount += 1;
    periodAcc.ticketSet.add(ticketKey);

    // Track unique ticket references (exclude missing ticket numbers)
    const rawNoTiket = (row.no_tiket ?? "").trim();
    if (rawNoTiket) {
      const ticketRefKey = `${rawNoTiket.toUpperCase()}::${periodKey}`;
      let ticketRef = accumulator.ticketRefs.get(ticketRefKey);
      if (!ticketRef) {
        ticketRef = {
          no_tiket: rawNoTiket.toUpperCase(),
          periodId: row.period_id,
          serviceType: row.service_type,
          findingsCount: 0,
          criticalFindingsCount: 0,
        };
        accumulator.ticketRefs.set(ticketRefKey, ticketRef);
      }
      ticketRef.findingsCount += 1;
      if (nilai === 0) ticketRef.criticalFindingsCount += 1;
    }

    // Accumulate evidence (limited)
    if (accumulator.evidence.length < maxEvidencePerCluster) {
      accumulator.evidence.push({
        id: row.id,
        no_tiket: row.no_tiket ?? null,
        periodId: row.period_id ?? null,
        indicatorName,
        nilai,
        text: pickEvidenceText(row, indicatorName),
      });
    }
  }

  // Build result from accumulators
  const results: RootCauseResult[] = [];

  for (const accumulator of groups.values()) {
    const periodsBreakdown: RootCausePeriodBreakdown[] = [];

    for (const [key, periodAcc] of accumulator.periodMap) {
      const separator = key.lastIndexOf(":");
      const periodId = key.slice(0, separator);
      const rawService = key.slice(separator + 1);
      const period = periodById.get(periodId);

      periodsBreakdown.push({
        periodId,
        month: period?.month ?? 0,
        year: period?.year ?? 0,
        label: period?.label ?? fallbackPeriodLabel(),
        serviceType: rawService as ServiceType,
        findingsCount: periodAcc.findingsCount,
        criticalFindingsCount: periodAcc.criticalFindingsCount,
        affectedTickets: periodAcc.ticketSet.size,
      });
    }

    const avgNilai =
      accumulator.findingsCount > 0
        ? Math.round(
            (accumulator.nilaiTotal / accumulator.findingsCount) * 100,
          ) / 100
        : 0;

    const MAX_TICKET_REFERENCES = 12;
    const ticketReferences: RootCauseTicketReference[] = [];
    for (const ref of accumulator.ticketRefs.values()) {
      const refPeriod = periodById.get(ref.periodId);
      ticketReferences.push({
        no_tiket: ref.no_tiket,
        periodId: ref.periodId,
        periodLabel: refPeriod?.label ?? fallbackPeriodLabel(ref.no_tiket),
        findingsCount: ref.findingsCount,
        criticalFindingsCount: ref.criticalFindingsCount,
      });
    }
    ticketReferences.sort((a, b) => {
      if (a.periodLabel !== b.periodLabel)
        return a.periodLabel.localeCompare(b.periodLabel);
      return a.no_tiket.localeCompare(b.no_tiket);
    });

    results.push({
      clusterId: accumulator.entry.clusterId,
      label: accumulator.entry.label,
      priority: accumulator.entry.priority,
      findingsCount: accumulator.findingsCount,
      affectedTickets: accumulator.ticketSet.size,
      criticalFindingsCount: accumulator.criticalFindingsCount,
      averageNilai: avgNilai,
      matchedKeywords: [...accumulator.matchedKeywords],
      recommendation: accumulator.entry.recommendation,
      evidence: accumulator.evidence,
      periods: periodsBreakdown,
      ticketReferences: ticketReferences.slice(0, MAX_TICKET_REFERENCES),
    });
  }

  // Sort: findingsCount desc, affectedTickets desc, criticalFindingsCount desc,
  // priority desc, label asc
  results.sort((a, b) => {
    if (b.findingsCount !== a.findingsCount)
      return b.findingsCount - a.findingsCount;
    if (b.affectedTickets !== a.affectedTickets)
      return b.affectedTickets - a.affectedTickets;
    if (b.criticalFindingsCount !== a.criticalFindingsCount)
      return b.criticalFindingsCount - a.criticalFindingsCount;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.label.localeCompare(b.label);
  });

  return results.slice(0, maxResults);
}
