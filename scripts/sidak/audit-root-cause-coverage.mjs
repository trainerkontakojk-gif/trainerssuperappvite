#!/usr/bin/env node

/**
 * audit-root-cause-coverage.mjs — Phase 1 Read-Only Audit
 * ========================================================
 *
 * Measures how many SIDAK qa_temuan rows fall into the "lainnya" (fallback)
 * cluster vs. matching one of the 7 deterministic root-cause clusters.
 *
 * Usage:
 *   node scripts/sidak/audit-root-cause-coverage.mjs --help
 *   node scripts/sidak/audit-root-cause-coverage.mjs --dry-run
 *   node scripts/sidak/audit-root-cause-coverage.mjs --limit 5000
 *   node scripts/sidak/audit-root-cause-coverage.mjs --limit 10000 --label after-expansion
 *   node scripts/sidak/audit-root-cause-coverage.mjs --limit 10000 --label baseline --out-dir ./custom-reports
 *
 * Environment variables (from .env):
 *   SUPABASE_URL=              Required unless --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY= Required unless --dry-run
 *
 * Output:
 *   .hermes/reports/sidak-root-cause-coverage-{YYYYMMDD}-{label}.json
 *   .hermes/reports/sidak-root-cause-coverage-{YYYYMMDD}-{label}.md
 *
 * Keep synchronized with:
 *   apps/api/src/services/sidak/agent-root-causes.ts  (ROOT_CAUSE_REGISTRY)
 */

import fs from "node:fs";
import path from "node:path";
import {
  extractTopPhrases,
  normalizeText,
} from "./root-cause-phrase-extract.mjs";

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function readOption(name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return fallback;
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: node scripts/sidak/audit-root-cause-coverage.mjs [options]

Options:
  --dry-run              Use in-memory fixture data (no Supabase connection)
  --limit=<number>       Max rows to fetch from Supabase (default: 10000)
  --label=<string>       Label for output files (default: "baseline")
  --out-dir=<path>       Output directory for reports (default: .hermes/reports/)
  --help, -h             Show this help

Environment:
  SUPABASE_URL            Required unless --dry-run
  SUPABASE_SERVICE_ROLE_KEY  Required unless --dry-run

Example:
  node scripts/sidak/audit-root-cause-coverage.mjs --dry-run
  node scripts/sidak/audit-root-cause-coverage.mjs --limit 10000 --label baseline
`);
  process.exit(0);
}

const IS_DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(readOption("--limit", "10000"), 10);
const LABEL = readOption("--label", "baseline");
const OUT_DIR = readOption(
  "--out-dir",
  path.join(import.meta.dirname, "../../.hermes/reports"),
);

const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUT_BASE = `sidak-root-cause-coverage-${DATE_STAMP}-${LABEL}`;

// ─── Registry (mirrors agent-root-causes.ts) ─────────────────────────────
// Keep in sync with apps/api/src/services/sidak/agent-root-causes.ts
// This script is read-only and only measures coverage.

const ROOT_CAUSE_REGISTRY = [
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
  },
  {
    clusterId: "salah_penggunaan_sistem",
    priority: 9,
    label: "Kesalahan penggunaan sistem/APPK",
    keywords: ["appk", "pada appk", "di appk"],
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
      "tidak sesuai dalam memilih",
      "tidak sesuai memilih",
      "salah memilih",
      "tidak sesuai dalam memberikan",
      "tidak sesuai dalam menuliskan",
      "tidak sesuai menuliskan",
      "tidak sesuai dalam menyampaikan",
      "tidak sesuai dalam melakukan",
      "salah menulis",
      "tidak memberikan jawaban",
      "belum memperbaiki",
    ],
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
      "tidak sesuai mencatat",
      "tidak mencatat",
      "tidak menuliskan",
      "tidak melampirkan",
    ],
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
      "tidak menanyakan",
      "tidak melakukan probing",
    ],
  },
];

const FALLBACK_CLUSTER_ID = "lainnya";

// ─── Matcher ────────────────────────────────────────────────────────────────

function buildSearchText(row) {
  const parts = [
    row.ketidaksesuaian,
    row.sebaiknya,
    row.indicator_name || row.indicatorName || "",
  ].filter(Boolean);
  return normalizeText(parts.join(" "));
}

function matchCluster(searchText) {
  for (const entry of ROOT_CAUSE_REGISTRY) {
    const matched = entry.keywords.filter((kw) =>
      searchText.includes(normalizeText(kw)),
    );
    if (matched.length > 0) {
      return {
        clusterId: entry.clusterId,
        label: entry.label,
        matchedKeywords: matched,
      };
    }
  }
  return {
    clusterId: FALLBACK_CLUSTER_ID,
    label: "Lainnya",
    matchedKeywords: [],
  };
}

// ─── Dry-Run Fixture ────────────────────────────────────────────────────────

function getDryRunFixture() {
  return [
    // Should match clusters
    {
      id: "dr-01",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Akurasi Jawaban",
      ketidaksesuaian:
        "Salah nama perusahaan pada respons, menyebut Bank ABC bukan Bank XYZ",
      sebaiknya: "Pastikan nama perusahaan sesuai dengan data di sistem",
    },
    {
      id: "dr-02",
      nilai: 1,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Menggali Kebutuhan",
      ketidaksesuaian: "Agent tidak bertanya mengenai kronologi kejadian",
      sebaiknya: "Sebaiknya agent menggali lebih dalam kronologi",
    },
    {
      id: "dr-03",
      nilai: 0,
      service_type: "chat",
      period_id: "p1",
      indicator_name: "Verifikasi Data",
      ketidaksesuaian: "Tidak melakukan verifikasi data identitas nasabah",
      sebaiknya: "Lakukan verifikasi data nasabah sebelum melanjutkan",
    },
    {
      id: "dr-04",
      nilai: 2,
      service_type: "call",
      period_id: "p2",
      indicator_name: "Kepatuhan SJ",
      ketidaksesuaian: "Jawaban tidak sesuai standar jawaban yang berlaku",
      sebaiknya: "Gunakan standar jawaban yang sudah ditetapkan",
    },
    {
      id: "dr-05",
      nilai: 1,
      service_type: "email",
      period_id: "p2",
      indicator_name: "Akurasi Informasi",
      ketidaksesuaian:
        "Informasi suku bunga tidak akurat, menyebut 5% padahal 4.5%",
      sebaiknya: "Pastikan informasi yang diberikan sesuai ketentuan terbaru",
    },
    {
      id: "dr-06",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Probing",
      ketidaksesuaian: "Kurang menggali kebutuhan nasabah secara detail",
      sebaiknya: "Tanyakan tujuan nasabah secara lengkap",
    },
    {
      id: "dr-06b",
      nilai: 1,
      service_type: "bko",
      period_id: "p1",
      indicator_name: "Dokumentasi APPK",
      ketidaksesuaian:
        "Agent tidak sesuai dalam memilih data kontak pada APPK.",
      sebaiknya: "Pilih data kontak yang benar di APPK",
    },
    // Should fall back to lainnya
    {
      id: "dr-07",
      nilai: 1,
      service_type: "chat",
      period_id: "p1",
      indicator_name: "Etika Komunikasi",
      ketidaksesuaian: "Penggunaan bahasa kurang formal dan terlalu santai",
      sebaiknya: "Gunakan bahasa yang lebih profesional",
    },
    {
      id: "dr-08",
      nilai: 2,
      service_type: "call",
      period_id: "p2",
      indicator_name: "Penanganan Keberatan",
      ketidaksesuaian: "Respon terhadap keberatan nasabah kurang empati",
      sebaiknya: null,
    },
    {
      id: "dr-09",
      nilai: 3,
      service_type: "email",
      period_id: "p2",
      indicator_name: "Tata Bahasa",
      ketidaksesuaian: "Terdapat beberapa typo pada kalimat",
      sebaiknya: "Periksa kembali ejaan sebelum mengirim email",
    },
    // nilai=3 with evidence that could match a cluster
    {
      id: "dr-10",
      nilai: 3,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Verifikasi Data",
      ketidaksesuaian: "Sebaiknya melakukan verifikasi data lebih teliti",
      sebaiknya: "Verifikasi data nasabah sebelum closing",
    },
    // Multiple clusters match — priority test
    {
      id: "dr-11",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Akurasi Jawaban",
      ketidaksesuaian: "Salah jawaban dan nama perusahaan juga salah",
      sebaiknya: null,
    },
    // Phantom padding — should be excluded
    {
      id: "dr-12",
      nilai: 3,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Sesi Tanpa Temuan",
      ketidaksesuaian: null,
      sebaiknya: null,
      is_phantom_padding: true,
    },
    // Weak evidence — no text at all
    {
      id: "dr-13",
      nilai: 1,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Parameter Tidak Dikenal",
      ketidaksesuaian: null,
      sebaiknya: null,
    },
    // Additional fallback patterns for phrase extraction
    {
      id: "dr-14",
      nilai: 1,
      service_type: "chat",
      period_id: "p1",
      indicator_name: "Respon Cepat",
      ketidaksesuaian:
        "Waktu respons terlalu lama, melebihi SLA yang ditentukan",
      sebaiknya: "Perhatikan waktu respons agar sesuai SLA",
    },
    {
      id: "dr-15",
      nilai: 0,
      service_type: "bko",
      period_id: "p1",
      indicator_name: "Dokumentasi",
      ketidaksesuaian: "Dokumentasi tidak lengkap, beberapa field tidak diisi",
      sebaiknya: "Lengkapi semua field dokumentasi",
    },
    {
      id: "dr-16",
      nilai: 1,
      service_type: "slik",
      period_id: "p1",
      indicator_name: "Ketepatan Data",
      ketidaksesuaian:
        "Data debitur tidak sesuai dengan SLIK, terdapat perbedaan nomor identitas",
      sebaiknya: null,
    },
    {
      id: "dr-17",
      nilai: 2,
      service_type: "call",
      period_id: "p2",
      indicator_name: "Penutupan",
      ketidaksesuaian:
        "Tidak melakukan konfirmasi ulang data sebelum menutup interaksi",
      sebaiknya: null,
    },
    // Hard-to-classify pattern
    {
      id: "dr-18",
      nilai: 1,
      service_type: "email",
      period_id: "p2",
      indicator_name: "Lampiran",
      ketidaksesuaian: "Lampiran tidak sesuai dengan isi email",
      sebaiknya: "Pastikan lampiran sesuai dengan konten email",
    },
    {
      id: "dr-19",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Identifikasi",
      ketidaksesuaian:
        "Tidak melakukan verifikasi identitas penelepon sama sekali",
      sebaiknya: null,
    },
  ];
}

// ─── Supabase REST API Fetch ────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(import.meta.dirname, "../../.env");
  try {
    const content = fs.readFileSync(envPath, "utf8");
    const env = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i > 0) {
        const key = trimmed.slice(0, i);
        const val = trimmed.slice(i + 1);
        env[key] = process.env[key] || val; // CLI env takes precedence
      }
    }
    return env;
  } catch {
    return {};
  }
}

async function fetchFromSupabase(limit) {
  const env = loadEnv();
  const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "in .env or environment variables, or run with --dry-run.",
    );
  }

  // Fetch flat qa_temuan rows (no joins — avoids FK constraint issues)
  const url = new URL(`${supabaseUrl}/rest/v1/qa_temuan`);
  url.searchParams.set(
    "select",
    [
      "id",
      "period_id",
      "peserta_id",
      "indicator_id",
      "service_type",
      "no_tiket",
      "nilai",
      "ketidaksesuaian",
      "sebaiknya",
      "is_phantom_padding",
    ].join(","),
  );
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", String(limit));

  // Supabase REST API caps at 1000 rows per request.
  // Paginate with Range header to fetch up to the requested limit.
  const PAGE_SIZE = 1000;
  const numPages = Math.ceil(Math.min(limit, 100000) / PAGE_SIZE);
  const actualLimit = Math.min(limit, 100000);

  console.error(
    `[audit] Fetching up to ${actualLimit} rows from ${supabaseUrl}/rest/v1/qa_temuan (${numPages} pages of ${PAGE_SIZE}) ...`,
  );

  const allRows = [];
  let totalAvailable = null;

  for (let page = 0; page < numPages; page++) {
    const rangeStart = page * PAGE_SIZE;
    const rangeEnd = Math.min(rangeStart + PAGE_SIZE - 1, actualLimit - 1);
    if (rangeStart >= actualLimit) break;

    const pageUrl = new URL(url); // clone
    const response = await fetch(pageUrl.toString(), {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        Accept: "application/json",
        Range: `${rangeStart}-${rangeEnd}`,
        Prefer: "count=exact",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown");
      throw new Error(
        `Supabase API error (page ${page}, status ${response.status}): ${text.slice(0, 500)}`,
      );
    }

    const pageRows = await response.json();
    if (!Array.isArray(pageRows)) {
      throw new Error(`Expected array, got ${typeof pageRows} on page ${page}`);
    }

    if (totalAvailable === null) {
      const cr = response.headers.get("content-range");
      totalAvailable = cr ? parseInt(cr.split("/")[1], 10) : null;
    }

    allRows.push(...pageRows);

    // Stop early if we got fewer rows than requested (end of data)
    if (pageRows.length < PAGE_SIZE) break;

    // Small delay to avoid rate limiting
    if (page < numPages - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (totalAvailable) {
    console.error(`[audit] Total rows available in table: ~${totalAvailable}`);
  }
  console.error(`[audit] Fetched ${allRows.length} rows`);

  // Consistent shape (no joins — indicator_name not available)
  return allRows.map((r) => ({
    id: r.id,
    period_id: r.period_id,
    peserta_id: r.peserta_id,
    indicator_id: r.indicator_id,
    service_type: r.service_type,
    no_tiket: r.no_tiket,
    nilai: r.nilai,
    ketidaksesuaian: r.ketidaksesuaian,
    sebaiknya: r.sebaiknya,
    is_phantom_padding: r.is_phantom_padding,
    indicator_name: null,
    indicator_category: null,
    period_year: null,
    period_month: null,
    period_label: null,
  }));
}

// ─── Coverage Analysis ──────────────────────────────────────────────────────

function analyzeCoverage(rows) {
  // Filter: exclude phantom padding, valid nilai range
  const auditable = rows.filter((r) => {
    if (r.is_phantom_padding === true) return false;
    const nilai = Number(r.nilai);
    if (!Number.isFinite(nilai) || nilai < 0 || nilai > 3) return false;
    return true;
  });

  // Separate weak evidence rows (both ketidaksesuaian and sebaiknya empty, no indicator name)
  const weakEvidence = [];
  const goodEvidence = [];

  for (const row of auditable) {
    const hasText = Boolean(
      (row.ketidaksesuaian || "").trim() ||
      (row.sebaiknya || "").trim() ||
      (row.indicator_name || "").trim(),
    );
    if (hasText) {
      goodEvidence.push(row);
    } else {
      weakEvidence.push(row);
    }
  }

  // Match each row
  const matchedRows = [];
  const fallbackRows = [];

  for (const row of goodEvidence) {
    const searchText = buildSearchText(row);
    const { clusterId } = matchCluster(searchText);
    if (clusterId === FALLBACK_CLUSTER_ID) {
      fallbackRows.push(row);
    } else {
      matchedRows.push(row);
    }
  }

  // Coverage by nilai
  const nilaiGroups = {};
  for (const row of auditable) {
    const n = row.nilai;
    if (!nilaiGroups[n]) nilaiGroups[n] = { total: 0, fallback: 0, matched: 0 };
    nilaiGroups[n].total += 1;

    const searchText = buildSearchText(row);
    const { clusterId } = matchCluster(searchText);
    if (clusterId === FALLBACK_CLUSTER_ID) {
      nilaiGroups[n].fallback += 1;
    } else {
      nilaiGroups[n].matched += 1;
    }
  }

  // Coverage by service_type
  const serviceGroups = {};
  for (const row of auditable) {
    const st = row.service_type || "unknown";
    if (!serviceGroups[st])
      serviceGroups[st] = { total: 0, fallback: 0, matched: 0 };
    serviceGroups[st].total += 1;

    const searchText = buildSearchText(row);
    const { clusterId } = matchCluster(searchText);
    if (clusterId === FALLBACK_CLUSTER_ID) {
      serviceGroups[st].fallback += 1;
    } else {
      serviceGroups[st].matched += 1;
    }
  }

  // Per-cluster breakdown
  const clusterBreakdown = {};
  for (const entry of ROOT_CAUSE_REGISTRY) {
    clusterBreakdown[entry.clusterId] = {
      label: entry.label,
      priority: entry.priority,
      count: 0,
    };
  }
  clusterBreakdown[FALLBACK_CLUSTER_ID] = {
    label: "Lainnya",
    priority: 0,
    count: 0,
  };

  for (const row of goodEvidence) {
    const searchText = buildSearchText(row);
    const { clusterId } = matchCluster(searchText);
    if (clusterBreakdown[clusterId]) {
      clusterBreakdown[clusterId].count += 1;
    }
  }

  // Top fallback phrases
  const topPhrases = extractTopPhrases(
    fallbackRows.map((r) => ({
      id: r.id,
      ketidaksesuaian: r.ketidaksesuaian,
      sebaiknya: r.sebaiknya,
      indicatorName: r.indicator_name,
    })),
    { maxPhrases: 20, minCount: 2 },
  );

  // Suggest clusters for top phrases
  const phrasesWithSuggestions = topPhrases.map((p) => {
    const searchText = normalizeText(p.phrase);
    for (const entry of ROOT_CAUSE_REGISTRY) {
      const matched = entry.keywords.some((kw) =>
        searchText.includes(normalizeText(kw)),
      );
      if (matched) {
        return {
          ...p,
          suggestedClusterId: entry.clusterId,
          suggestedLabel: entry.label,
        };
      }
    }
    return { ...p, suggestedClusterId: null, suggestedLabel: null };
  });

  // Keyword candidates per cluster: find fallback rows that WOULD have matched
  // if a candidate keyword existed
  const keywordCandidates = {};
  for (const entry of ROOT_CAUSE_REGISTRY) {
    keywordCandidates[entry.clusterId] = [];
  }

  // New cluster candidates: check for coherent patterns in fallback
  const newClusterCandidates = [];
  const fallbackOnlyPhrases = phrasesWithSuggestions.filter(
    (p) => !p.suggestedClusterId,
  );
  // If a phrase appears 3+ times and doesn't match any existing cluster, flag it
  for (const phrase of fallbackOnlyPhrases) {
    if (phrase.count >= 3) {
      newClusterCandidates.push({
        phrase: phrase.phrase,
        count: phrase.count,
        reason: `Appears ${phrase.count}x in fallback rows, no existing cluster matches`,
        sampleIds: phrase.sampleIds,
      });
    }
  }

  const sampleSize = auditable.length;
  const totalWithEvidence = goodEvidence.length;
  const fallbackTotal = fallbackRows.length;
  const fallbackPercentage =
    totalWithEvidence > 0
      ? Math.round((fallbackTotal / totalWithEvidence) * 10000) / 100
      : 0;

  // Build coverage by nilai with percentages
  const coverageByNilai = {};
  for (const [nilaiStr, g] of Object.entries(nilaiGroups)) {
    coverageByNilai[nilaiStr] = {
      sampleSize: g.total,
      matchedRows: g.matched,
      fallbackRows: g.fallback,
      fallbackPercentage:
        g.total > 0 ? Math.round((g.fallback / g.total) * 10000) / 100 : 0,
    };
  }

  const coverageByService = {};
  for (const [st, g] of Object.entries(serviceGroups)) {
    coverageByService[st] = {
      sampleSize: g.total,
      matchedRows: g.matched,
      fallbackRows: g.fallback,
      fallbackPercentage:
        g.total > 0 ? Math.round((g.fallback / g.total) * 10000) / 100 : 0,
    };
  }

  return {
    sampleSize,
    weakEvidenceCount: weakEvidence.length,
    rowsWithEvidence: totalWithEvidence,
    matchedRows: matchedRows.length,
    fallbackRows: fallbackTotal,
    fallbackPercentage,
    coverageByNilai,
    coverageByService,
    clusterBreakdown,
    topFallbackPhrases: phrasesWithSuggestions,
    keywordCandidates,
    newClusterCandidates,
    weakEvidenceSampleIds: weakEvidence.slice(0, 20).map((r) => r.id),
  };
}

// ─── Report Writers ─────────────────────────────────────────────────────────

function formatDate() {
  return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function writeJsonReport(data, outPath) {
  const report = {
    metadata: {
      generatedAt: formatDate(),
      label: LABEL,
      limit: LIMIT,
      dryRun: IS_DRY_RUN,
    },
    ...data,
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.error(`[audit] JSON report: ${outPath}`);
}

function writeMarkdownReport(data, outPath) {
  const lines = [];

  // Header
  lines.push(`# SIDAK Root Cause Coverage Audit`);
  lines.push(``);
  lines.push(`**Generated:** ${formatDate()}`);
  lines.push(`**Label:** ${LABEL}`);
  lines.push(`**Limit:** ${LIMIT}`);
  lines.push(
    `**Mode:** ${IS_DRY_RUN ? "dry-run (fixture)" : "live (Supabase)"}`,
  );
  lines.push(``);

  // Baseline Coverage
  lines.push(`## Baseline Coverage`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Sample size | ${data.sampleSize} |`);
  lines.push(`| Weak evidence (no text) | ${data.weakEvidenceCount} |`);
  lines.push(`| Rows with evidence | ${data.rowsWithEvidence} |`);
  lines.push(
    `| Matched to ${ROOT_CAUSE_REGISTRY.length} clusters | ${data.matchedRows} |`,
  );
  lines.push(`| Fallback (lainnya) | ${data.fallbackRows} |`);
  lines.push(`| **Fallback percentage** | **${data.fallbackPercentage}%** |`);
  lines.push(``);

  // Coverage by Nilai
  lines.push(`## Coverage by Nilai`);
  lines.push(``);
  lines.push(`| Nilai | Sample | Matched | Fallback | Fallback % |`);
  lines.push(`|---|---|---|---|---|`);
  for (const [nilai, g] of Object.entries(data.coverageByNilai).sort()) {
    lines.push(
      `| ${nilai} | ${g.sampleSize} | ${g.matchedRows} | ${g.fallbackRows} | ${g.fallbackPercentage}% |`,
    );
  }
  lines.push(``);

  // Coverage by Service Type
  lines.push(`## Coverage by Service Type`);
  lines.push(``);
  lines.push(`| Service | Sample | Matched | Fallback | Fallback % |`);
  lines.push(`|---|---|---|---|---|`);
  for (const [st, g] of Object.entries(data.coverageByService).sort()) {
    lines.push(
      `| ${st} | ${g.sampleSize} | ${g.matchedRows} | ${g.fallbackRows} | ${g.fallbackPercentage}% |`,
    );
  }
  lines.push(``);

  // Per-Cluster Breakdown
  lines.push(`## Per-Cluster Breakdown`);
  lines.push(``);
  lines.push(`| Cluster | Priority | Count |`);
  lines.push(`|---|---|---|`);
  const sortedClusters = Object.entries(data.clusterBreakdown).sort(
    ([, a], [, b]) => b.priority - a.priority || b.count - a.count,
  );
  for (const [id, c] of sortedClusters) {
    lines.push(`| ${c.label} (\`${id}\`) | ${c.priority} | ${c.count} |`);
  }
  lines.push(``);

  // Top 20 Fallback Phrases
  lines.push(`## Top ${data.topFallbackPhrases.length} Fallback Phrases`);
  lines.push(``);
  lines.push(`| Phrase | Count | Suggested Cluster |`);
  lines.push(`|---|---|---|`);
  for (const p of data.topFallbackPhrases) {
    const suggestion = p.suggestedClusterId
      ? `\`${p.suggestedClusterId}\` (${p.suggestedLabel})`
      : "*(none)*";
    lines.push(`| \`${p.phrase}\` | ${p.count} | ${suggestion} |`);
  }
  lines.push(``);

  // Keyword Candidates per Existing Cluster
  const hasKeywordCandidates = Object.values(data.keywordCandidates).some(
    (v) => v.length > 0,
  );
  if (hasKeywordCandidates) {
    lines.push(`## Keyword Candidates by Existing Cluster`);
    lines.push(``);
    for (const [clusterId, candidates] of Object.entries(
      data.keywordCandidates,
    )) {
      if (candidates.length > 0) {
        const entry = ROOT_CAUSE_REGISTRY.find(
          (e) => e.clusterId === clusterId,
        );
        lines.push(`- **${entry?.label || clusterId}**:`);
        for (const c of candidates) {
          lines.push(
            `  - \`${c.keyword}\` (${c.count}x, samples: ${c.sampleIds.join(", ")})`,
          );
        }
      }
    }
    lines.push(``);
  }

  // New Cluster Candidates
  if (data.newClusterCandidates.length > 0) {
    lines.push(`## New Cluster Candidates`);
    lines.push(``);
    lines.push(`| Phrase | Count | Reason |`);
    lines.push(`|---|---|---|`);
    for (const c of data.newClusterCandidates) {
      lines.push(`| \`${c.phrase}\` | ${c.count} | ${c.reason} |`);
    }
    lines.push(``);
  }

  // Weak Evidence
  if (data.weakEvidenceSampleIds.length > 0) {
    lines.push(`## Rows With Weak Evidence`);
    lines.push(``);
    lines.push(
      `These rows have empty \`ketidaksesuaian\`, \`sebaiknya\`, and indicator name — cannot be classified.`,
    );
    lines.push(``);
    lines.push(`Sample IDs: \`${data.weakEvidenceSampleIds.join("`, `")}\``);
    lines.push(``);
  }

  // Registry Info
  lines.push(`## Registry Snapshot`);
  lines.push(``);
  lines.push(
    `Registry used: ${ROOT_CAUSE_REGISTRY.length} clusters + fallback`,
  );
  lines.push(
    `Keywords tracked: ${ROOT_CAUSE_REGISTRY.reduce((s, e) => s + e.keywords.length, 0)}`,
  );
  lines.push(
    `Source: (mirror of \`apps/api/src/services/sidak/agent-root-causes.ts\`)`,
  );
  lines.push(``);

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.error(`[audit] Markdown report: ${outPath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let rows;

  if (IS_DRY_RUN) {
    console.error("[audit] Running in DRY-RUN mode with in-memory fixture");
    rows = getDryRunFixture();
  } else {
    rows = await fetchFromSupabase(LIMIT);
  }

  console.error(`[audit] Processing ${rows.length} rows...`);
  const results = analyzeCoverage(rows);

  // Print summary to stderr
  console.error("");
  console.error("═".repeat(50));
  console.error(`  Sample size:          ${results.sampleSize}`);
  console.error(`  Weak evidence:        ${results.weakEvidenceCount}`);
  console.error(`  Rows with evidence:   ${results.rowsWithEvidence}`);
  console.error(`  Matched rows:         ${results.matchedRows}`);
  console.error(`  Fallback rows:        ${results.fallbackRows}`);
  console.error(`  Fallback percentage:  ${results.fallbackPercentage}%`);
  console.error("═".repeat(50));
  console.error("");

  // Print fallback phrases (to stderr)
  if (results.topFallbackPhrases.length > 0) {
    console.error("Top fallback phrases:");
    console.error("");
    for (const p of results.topFallbackPhrases) {
      const suggestion = p.suggestedClusterId
        ? ` → ${p.suggestedClusterId}`
        : "";
      console.error(
        `  ${String(p.count).padStart(4)}x  "${p.phrase}"${suggestion}`,
      );
    }
    console.error("");
  }

  // Write reports
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const jsonPath = path.join(OUT_DIR, `${OUT_BASE}.json`);
  const mdPath = path.join(OUT_DIR, `${OUT_BASE}.md`);

  writeJsonReport(results, jsonPath);
  writeMarkdownReport(results, mdPath);

  // Output parseable summary to stdout
  console.log(
    JSON.stringify({
      sampleSize: results.sampleSize,
      matchedRows: results.matchedRows,
      fallbackRows: results.fallbackRows,
      fallbackPercentage: results.fallbackPercentage,
      reportJson: path.resolve(jsonPath),
      reportMarkdown: path.resolve(mdPath),
    }),
  );
}

main().catch((err) => {
  console.error(`[audit] ERROR: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
