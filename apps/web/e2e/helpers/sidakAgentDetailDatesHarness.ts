/**
 * Harness E2E untuk tanggal temuan di DETAIL AGENT (`/sidak/agents/:id`),
 * dipakai spec `sidak-temuan-dates.spec.ts`.
 *
 * Berbeda dari harness Input Audit, halaman ini memakai endpoint
 * `agent-directory` yang mengembalikan satu payload besar (`AgentDetailData`),
 * bukan daftar ringan. Karena itu fixture di sini harus memenuhi bentuk itu
 * sepenuhnya: field yang dibaca `useAgentDetail` harus ada walau nilainya nol.
 *
 * Semua data SINTETIS. Tidak ada baris nyata dari database mana pun, dan
 * allowlist jaringan tetap fail-closed seperti harness lain.
 */

import { type Page } from "@playwright/test";
import { mockSupabaseAuth } from "./mockAuth";

const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";
const EXTERNAL_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/**
 * Allowlist endpoint `/api` yang boleh menyentuh proxy dev. Matched dengan
 * regex di dalam guard, bukan dengan "semua /api diizinkan": endpoint yang
 * TIDAK ada di sini di-abort, sehingga tidak pernah sampai ke API asli yang
 * menunjuk ke project remote.
 */
const MOCKED_API: RegExp[] = [
  /^\/api\/v1\/me\/access-status$/,
  /^\/api\/v1\/sidak\/folders$/,
  // Diminta `useAgentDetail` setelah `peserta.batch_name` terisi. Tanpa ini
  // request di-abort dan链 effect-nya tidak pernah selesai.
  /^\/api\/v1\/sidak\/folders\/[^/]+\/agents$/,
  /^\/api\/v1\/sidak\/agents$/,
  /^\/api\/v1\/sidak\/agents\/[^/]+$/,
  /^\/api\/v1\/sidak\/agents\/[^/]+\/quickview$/,
  /^\/api\/v1\/sidak\/temuan\/[^/]+$/,
  /^\/api\/v1\/sidak\/heatmap$/,
];

export type AgentAudit = {
  mockedApi: string[];
  blockedApi: string[];
  blockedExternal: string[];
  /** Query string heatmap yang diminta tab Heatmap (untuk asersi agent_id). */
  heatmapQueries?: string[];
  /** Query string detail agent (tahun, layanan, rentang tren). */
  detailQueries?: string[];
  /** Query string direktori agen yang diminta pemilih agen. */
  directoryQueries?: string[];
};

export const AGENT_ID = "cccccccc-3333-4333-8333-cccccccccccc";
export const PERIOD_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
export const INDICATOR_ID = "dddddddd-4444-4444-8444-ddddddddddd1";

/**
 * Row temuan yang bisa diubah spec lewat PUT. Sengaja memakai id BERBEDA per
 * run supaya test lama tidak saling menimpa lewat store yang sama.
 */
export type DetailRow = {
  id: string;
  tanggal_layanan: string | null;
  tanggal_sampel: string | null;
};

let row: DetailRow | null = null;
const updates: any[] = [];

export function seedRow(next: Omit<DetailRow, "id">): DetailRow {
  row = { id: "eeeeeeee-1111-4111-8111-eeeeeeeeeeee", ...next };
  updates.length = 0;
  return row;
}

export function currentRow(): DetailRow | null {
  return row;
}

export function lastUpdate(): any | null {
  return updates.length ? updates[updates.length - 1]! : null;
}

function toJson(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

/** Bentuk `AgentDetailData` minimal yang benar-benar dibaca halaman. */
function agentDetailPayload() {
  return {
    indicators: [
      {
        id: INDICATOR_ID,
        service_type: "call",
        name: "Kesesuaian Data",
        category: "non_critical",
        bobot: 0.15,
        parameter_group: null,
        is_active: true,
      },
    ],
    periodSummaries: [
      {
        id: PERIOD_ID,
        month: 1,
        year: 2026,
        serviceType: "call",
        label: "Januari 2026",
        finalScore: 85,
        nonCriticalScore: 90,
        criticalScore: 70,
        sessionCount: 2,
        totalPenaltyWeight: 0.15,
        isSamplingQa: false,
      },
    ],
    selectedPeriod: null,
    temuan: row
      ? [
          {
            id: row.id,
            peserta_id: AGENT_ID,
            period_id: PERIOD_ID,
            indicator_id: INDICATOR_ID,
            service_type: "call",
            no_tiket: "TKT-DETAIL-1",
            nilai: 1,
            ketidaksesuaian: "Telat respon",
            sebaiknya: "Tnale timely",
            tanggal_layanan: row.tanggal_layanan,
            tanggal_sampel: row.tanggal_sampel,
            is_phantom_padding: false,
          },
        ]
      : [],
    phantomSessions: [],
    weights: {
      call: {
        service_type: "call",
        critical_weight: 0.6,
        non_critical_weight: 0.4,
        scoring_mode: "weighted",
      },
    },
    personalTrend: { labels: ["Jan"], datasets: [] },
    availableYears: [2026],
    scoreHistory: [],
    initialService: "call",
    initialTrendRange: { start: 1, end: 12 },
    // Header halaman membaca `peserta.nama`; tanpa field ini halaman crash
    // sebelum tab apa pun bisa dibuka.
    peserta: {
      id: AGENT_ID,
      nama: "Agen Uji Tanggal",
      tim: "Tim Uji",
      batch_name: "Batch Uji",
      jabatan: "Agent",
      foto_url: null,
      bergabung_date: null,
    },
    comparisonTable: undefined,
  };
}

export type OpenAgentOptions = {
  role?: string;
  /** Bila true, PUT temuan membalas 500 supaya error bisa diuji. */
  failUpdate?: boolean;
  /** Status modul SIDAK untuk leader pada `/me/access-status`. */
  sidakAccess?: "none" | "approved";
  /** Hitungan heatmap per tanggal yang dibalas endpoint heatmap. */
  heatmapCounts?: Record<string, number>;
  /**
   * Ganti payload `AgentDetailData` default. Dipakai spec tata letak yang
   * butuh beberapa bulan, tiket, dan akar masalah sekaligus.
   */
  detailPayload?: () => unknown;
  /** Ganti payload quickview default (ranking + forecast). */
  quickviewPayload?: unknown;
  /** Daftar agen yang dibalas endpoint folder agents. */
  folderAgents?: Array<{ id: string; nama: string }>;
  /** Daftar folder yang dibalas endpoint folders. */
  folders?: Array<{ id: string; name: string }>;
  /** Bila diisi, quickview membalas status error ini. */
  quickviewFailStatus?: number;
  /** Quickview baru dibalas setelah promise ini selesai (uji state loading). */
  quickviewGate?: Promise<void>;
  /** Agen yang dibalas direktori `GET /sidak/agents` (pemilih agen). */
  directoryAgents?: unknown[];
};

export async function openAgentDetail(
  page: Page,
  audit: AgentAudit,
  opts: OpenAgentOptions = {},
): Promise<void> {
  const {
    role = "trainer",
    failUpdate = false,
    sidakAccess = "none",
    heatmapCounts = {},
    detailPayload = agentDetailPayload,
    quickviewPayload,
    folderAgents = [],
    folders = [],
    quickviewFailStatus,
    quickviewGate,
    directoryAgents = [],
  } = opts;

  await mockSupabaseAuth(page, { role });

  await page.route(`${APP_ORIGIN}/api/v1/me/access-status*`, async (route) => {
    audit.mockedApi.push("access-status");
    await route.fulfill(
      toJson({
        success: true,
        data: {
          sidak: { status: sidakAccess, module: "sidak", created_at: null },
          ktp: { status: "none", module: "ktp", created_at: null },
        },
      }),
    );
  });

  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/folders/*/agents*`,
    async (route) => {
      audit.mockedApi.push("folder-agents");
      await route.fulfill(toJson({ success: true, data: folderAgents }));
    },
  );

  await page.route(`${APP_ORIGIN}/api/v1/sidak/folders*`, async (route) => {
    audit.mockedApi.push("folders");
    await route.fulfill(toJson({ success: true, data: folders }));
  });

  // Direktori agen untuk pemilih agen. Predikat path persis supaya tidak
  // menangkap `/sidak/agents/:id`.
  await page.route(
    (url) => url.origin === APP_ORIGIN && url.pathname === "/api/v1/sidak/agents",
    async (route) => {
      audit.mockedApi.push("agent-directory");
      (audit.directoryQueries ??= []).push(new URL(route.request().url()).search);
      await route.fulfill(
        toJson({ success: true, data: { agents: directoryAgents, batches: [] } }),
      );
    },
  );

  // Detail agent: satu payload besar.
  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/agents/${AGENT_ID}?*`,
    async (route) => {
      audit.mockedApi.push("agent-detail");
      (audit.detailQueries ??= []).push(new URL(route.request().url()).search);
      await route.fulfill(toJson({ success: true, data: detailPayload() }));
    },
  );

  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/agents/${AGENT_ID}/quickview*`,
    async (route) => {
      audit.mockedApi.push("agent-quickview");
      if (quickviewGate) await quickviewGate;
      if (quickviewFailStatus) {
        await route.fulfill(
          toJson(
            { success: false, error: { code: "QUICKVIEW_ERROR", message: "Network failure" } },
            quickviewFailStatus,
          ),
        );
        return;
      }
      await route.fulfill(
        toJson({
          success: true,
          // Bentuk WAJIB mengikuti `SidakAgentQuickviewResponse`. Versi awal
          // memakai `{rank, totalAgents, ...}` sehingga komponen membaca
          // `data.context.agentId` dari undefined dan halaman crash total.
          data: quickviewPayload ?? {
            context: {
              agentId: AGENT_ID,
              year: 2026,
              serviceType: "call",
              periodMode: "ytd",
            },
            combinedTeam: null,
            leaderTeam: null,
            forecast: null,
          },
        }),
      );
    },
  );

  // Heatmap per-agent (tab Heatmap). Kalender penuh satu tahun.
  await page.route(`${APP_ORIGIN}/api/v1/sidak/heatmap?*`, async (route) => {
    audit.mockedApi.push("heatmap");
    const url = new URL(route.request().url());
    (audit.heatmapQueries ??= []).push(url.search);
    const year = Number(url.searchParams.get("year") ?? "2026");
    const days: Array<{ date: string; count: number }> = [];
    for (let month = 1; month <= 12; month++) {
      const perMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let day = 1; day <= perMonth; day++) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        days.push({ date: iso, count: heatmapCounts[iso] ?? 0 });
      }
    }
    await route.fulfill(
      toJson({
        success: true,
        data: {
          mode: url.searchParams.get("mode") ?? "agent",
          year,
          serviceType: url.searchParams.get("service_type"),
          dateBasis: "tanggal_layanan",
          countBy: url.searchParams.get("count_by") ?? "parameter",
          agentId: url.searchParams.get("agent_id"),
          days,
          totalFindings: days.reduce((sum, d) => sum + d.count, 0),
          missingDateFindingsAllPeriods: 0,
        },
      }),
    );
  });

  // PUT/DELETE temuan pada baris yang spesifik (lihat catatan urutan di bawah).
  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/temuan/*`,
    async (route) => {
      const method = route.request().method();
      const id = new URL(route.request().url()).pathname.split("/").pop()!;

      if (method !== "PUT" && method !== "DELETE") {
        await route.fallback();
        return;
      }
      audit.mockedApi.push(`temuan:${method}`);

      if (method === "DELETE") {
        row = null;
        await route.fulfill(toJson({ success: true, data: null }));
        return;
      }

      if (failUpdate) {
        await route.fulfill(
          toJson(
            { success: false, error: { code: "UPDATE_ERROR", message: "Gagal update" } },
            500,
          ),
        );
        return;
      }

      const body = route.request().postDataJSON();
      updates.push(body);
      if (row && row.id === id) {
        // Hanya key yang terkirim yang berubah — persis kontrak backend.
        for (const key of ["tanggal_layanan", "tanggal_sampel"] as const) {
          if (key in body) row[key] = body[key];
        }
      }
      await route.fulfill(toJson({ success: true, data: { id } }));
    },
  );

  await installGuard(page, audit);

  // `domcontentloaded`, bukan default `load`: halaman punya koneksi
  // HMR yang membuat event `load` tidak pernah sampai, sehingga setiap
  // aksi Playwright ikut menggantung menunggu navigasi.
  await page.goto(`/sidak/agents/${AGENT_ID}`, { waitUntil: "domcontentloaded" });
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isAppDevServer(url: URL): boolean {
  return url.hostname === APP_URL.hostname && url.port === APP_URL.port;
}

async function installGuard(page: Page, audit: AgentAudit) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const origin = route.request().url();

    if (origin.startsWith(SUPABASE_ORIGIN)) {
      await route.fallback();
      return;
    }

    const isHttp =
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "ws:" ||
      url.protocol === "wss:";
    if (!isHttp) {
      await route.fallback();
      return;
    }

    if (isAppDevServer(url)) {
      // `/api` hanya boleh lewat kalau polanya ada di allowlist. Tanpa ini,
      // endpoint yang tidak di-mock akan diteruskan ke API sungguhan yang
      // menunjuk ke project remote.
      if (isApiPath(url.pathname) && !MOCKED_API.some((re) => re.test(url.pathname))) {
        audit.blockedApi.push(origin);
        await route.abort("blockedbyclient");
        return;
      }
      await route.fallback();
      return;
    }
    if (EXTERNAL_FONT_HOSTS.includes(url.hostname)) {
      await route.fallback();
      return;
    }
    if (isApiPath(url.pathname)) audit.blockedApi.push(origin);
    else audit.blockedExternal.push(origin);
    await route.abort("blockedbyclient");
  });
}