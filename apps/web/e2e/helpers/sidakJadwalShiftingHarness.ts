/**
 * Harness E2E bersama untuk workspace `/sidak/jadwal-shifting`.
 *
 * Dipakai dua spec yang mengukur dua lapisan berbeda dari fixture yang SAMA:
 *   - `sidak-jadwal-shifting.spec.ts`     — apa yang dilihat pengguna di browser.
 *   - `sidak-jadwal-shifting-api.spec.ts` — role gate + kontrak respons pada
 *     router Hono yang SESUNGGUHNYA, dengan upstream WFM diganti stub lokal.
 *
 * Yang TIDAK ada di sini dan tidak boleh ditambahkan: kredensial WFM, isi baris
 * jadwal nyata, atau stub yang menyentuh host di luar loopback. Fixture jadwal
 * di bawah adalah data SINTETIS. Aturan "jangan fetch/print baris nyata" berasal
 * dari plans/markdown/sidak-jadwal-shifting.md (gate checkpoint 2026-09-28).
 *
 * Isolasi dijaga di level modul ini, bukan di level test:
 *   1. `assertLocalDevOnlyTarget()` membuktikan target adalah dev-server Vite repo
 *      ini (bukan hasil build produksi) dan proxy `/api`-nya hanya loopback.
 *   2. `installNetworkGuard()` adalah allowlist fail-closed: satu-satunya host
 *      yang boleh tersentuh adalah dev-server app, endpoint auth/profile yang
 *      dimock, dan endpoint jadwal yang PERSIS dimock. Apa pun yang lain —
 *      termasuk `script.google.com` / host WFM mana pun — di-`abort`.
 *   3. `startWfmStub()` adalah upstream SINTETIS di 127.0.0.1 dengan port
 *      ephemeral, jadi router asli bisa diuji tanpa WFM nyata.
 */

import { expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mockSupabaseAuth } from "./mockAuth";

/**
 * Akar repo. Helper ini berada di `apps/web/e2e/helpers/`, jadi satu level lebih
 * dalam daripada spec — empat level ke atas, bukan tiga.
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

export const APP_ORIGIN = "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";

/** Label UI yang jadi tempat kueri diuji lewat teks, bukan lewat selector rapuh. */
export const PAGE_TITLE = "Jadwal Shifting";
export const NAV_LABEL = "Jadwal Shifting";

type MockedEndpoint = {
  id: string;
  method: string;
  path?: string;
  pathPattern?: RegExp;
};

/**
 * Satu-satunya endpoint API yang boleh menerima mock. Method + path adalah
 * allowlist milik guard DAN kunci dispatch mock, jadi tidak bisa berbeda.
 * `fetchApi` memakai `API_BASE = /api/v1`, jadi path lain akan di-`abort`.
 */
const MOCKED_API: ReadonlyArray<MockedEndpoint> = [
  {
    id: "jadwalShifting",
    method: "GET",
    pathPattern: /^\/api\/v1\/sidak\/jadwal-shifting$/,
  },
  {
    // Kalender bulanan: path-nya lebih panjang, jadi pattern hari di atas
    // (di-anchor dengan `$`) sengaja TIDAK menangkapnya. Tanpa entri ini guard
    // fail-closed akan memblokir request kalender.
    id: "jadwalShiftingMonth",
    method: "GET",
    pathPattern: /^\/api\/v1\/sidak\/jadwal-shifting\/month$/,
  },
  {
    // Bootstrap aplikasi, bukan bagian dari fitur ini: `/sidak` membungkus
    // halamannya dengan `LeaderAccessGate`, yang memanggil `useAccessStatus`
    // → `GET /me/access-status` saat halaman beranda SIDAK dibuka. Endpoints ini
    // dimock supaya guard tetap fail-closed, dan jawabannya data uji lokal.
    id: "accessStatus",
    method: "GET",
    path: "/api/v1/me/access-status",
  },
];

const MOCKED_SUPABASE = [
  { id: "authUser", path: "/auth/v1/user" },
  { id: "profiles", path: "/rest/v1/profiles" },
] as const;

/** Host pihak ketiga yang memang dipanggil index.html; tetap diblokir, hanya dicatat. */
export const EXTERNAL_FONT_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// ── Fixture jadwal SINTETIS ────────────────────────────────────────────────

export const FIXTURE_DATE = "2026-09-28";

/**
 * Baris-baris di bawah dibuat-buat untuk E2E. `nama`/`tl` sengaja memakai nama
 * fiktif dan TIDAK pernah diambil dari probe WFM nyata.
 *
 * Bentuk `activities` meniru yang terverifikasi di gate checkpoint: object dengan
 * key numerik. `overnight` sengaja memakai slot yang membungkus (88..95 lalu
 * 0..3) supaya shift lintas tengah malam benar-benar teruji, bukan diasumsikan.
 */
export const OVERNIGHT_AGENT = {
  nama: "Bagas Prakoso",
  tl: "Rina Salim",
  channel: "Call",
  shift: "23:00 - 07:00",
  shift_prev: "15:00 - 23:00",
  date: FIXTURE_DATE,
  activities: {
    "0": "Briefing shift",
    "1": "Briefing shift",
    "88": "Closing recap",
    "89": "Closing recap",
    "90": "Closing recap",
    "91": "Closing recap",
  },
} as const;

export const DAYTIME_AGENT = {
  nama: "Alya Pranoto",
  tl: "Rina Salim",
  channel: "Digital Chat",
  shift: "08:00 - 16:00",
  shift_prev: "00:00 - 08:00",
  date: FIXTURE_DATE,
  activities: {
    "32": "Handling chat",
    "33": "Handling chat",
    "34": "Escalation",
  },
} as const;

export const NO_ACTIVITY_AGENT = {
  nama: "Citra Wulandari",
  tl: "Doni Kurnia",
  channel: "Email",
  shift: "H",
  shift_prev: "",
  date: FIXTURE_DATE,
  activities: {},
} as const;

export const SCHEDULE_FIXTURE_ROWS = [
  OVERNIGHT_AGENT,
  DAYTIME_AGENT,
  NO_ACTIVITY_AGENT,
];

export const FIXTURE_CHANNELS = ["Call", "Digital Chat", "Email"];

/**
 * Key yang TIDAK boleh muncul di respons API. Disalin dari probe terverifikasi
 * (`nik`, identitas WFM) plus asumsi aman, supaya allowlist benar-benar
 * dibuktikan dan bukan sekadar "tidak sengaja ikut".
 */
export const FORBIDDEN_RESPONSE_KEYS = [
  "nik",
  "NIK",
  "user_wfm",
  "password",
  "apiKey",
  "api_key",
  "apiUrl",
  "api_url",
  "alasan",
  "reason",
  "swap",
] as const;

/** Slot 15 menit yang dipakai label. Indeks 0 = 00:00. */
export const SLOT_MINUTES = 15;
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;

/** `23:00` dari baris overnight, dipakai E2E untuk membuktikan render utuh. */
export const OVERNIGHT_SHIFT_LABEL = OVERNIGHT_AGENT.shift;

// ── Bukti jaringan per test ────────────────────────────────────────────────

export type NetworkAudit = {
  mockedApi: string[];
  mockedAuth: string[];
  localDev: string[];
  /** `/api/*` yang TIDAK dimock → di-abort, tidak pernah masuk proxy Vite. */
  blockedApi: string[];
  /** Host eksternal apa pun (termasuk WFM/GAS) → di-abort. */
  blockedExternal: string[];
  /**
   * Host font publik yang memang dipanggil `index.html` dan diizinkan lewat.
   *
   * Berbeda dari fixture laporan sibling yang memblokirnya, spec ini mengukur
   * layout (lebar dokumen saat viewport sempit), dan metrik itu berubah kalau
   * font tidak termuat. Jadi font dibiarkan lewat, tapi di bucket sendiri: jika
   * ada host lain yang sneak ke sini, assertion gagal.
   */
  allowedFonts: string[];
  /** Origin lokal di luar allowlist → di-abort. */
  blockedLocal: string[];
  /**
   * Semua request non-GET ke endpoint jadwal. MVP read-only, jadi angka ini
   * harus selalu 0 — bukan "dibiarkan".
   */
  writes: string[];
};

export type RequestShape = { label: string; method: string; url: URL | null };

const activeAudits: NetworkAudit[] = [];

export function startAudit(): NetworkAudit {
  const audit: NetworkAudit = {
    mockedApi: [],
    mockedAuth: [],
    localDev: [],
    blockedApi: [],
    blockedExternal: [],
    allowedFonts: [],
    blockedLocal: [],
    writes: [],
  };
  activeAudits.push(audit);
  return audit;
}

export function toJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return {
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  };
}

function shapeRequest(request: {
  method(): string;
  url(): string;
}): RequestShape {
  const raw = request.url();
  let url: URL | null;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  return { label: `${request.method()} ${raw}`, method: request.method(), url };
}

/** `server.proxy` Vite hanya mem-forward `/api`; path lain dilayani dev server. */
function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isAppDevServer(url: URL): boolean {
  return url.hostname === APP_URL.hostname && url.port === APP_URL.port;
}

/** Hanya CSS/font statis Google Fonts; host lain dengan nama serupa tidak lolos. */
function isExternalFontRequest(url: URL): boolean {
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    EXTERNAL_FONT_HOSTS.includes(url.hostname)
  );
}

function endpointMatches(endpoint: MockedEndpoint, url: URL): boolean {
  if (endpoint.path !== undefined) return url.pathname === endpoint.path;
  return endpoint.pathPattern?.test(url.pathname) ?? false;
}

/**
 * Mock API hanya sah pada `APP_ORIGIN`. Tanpa gerbang origin, request dengan
 * method + path yang sama dari origin lain akan lolos `fallback`.
 */
function isMockedApiRequest(request: RequestShape): boolean {
  if (!request.url || request.url.origin !== APP_ORIGIN) return false;
  return MOCKED_API.some(
    (endpoint) =>
      endpoint.method === request.method &&
      endpointMatches(endpoint, request.url!),
  );
}

function isMockedAuthRequest(request: RequestShape): boolean {
  if (!request.url || request.url.origin !== SUPABASE_ORIGIN) return false;
  return MOCKED_SUPABASE.some(
    (endpoint) =>
      request.url!.pathname === endpoint.path ||
      request.url!.pathname.startsWith(`${endpoint.path}/`),
  );
}

/**
 * Dev-server lokal: document SPA, modul/asset Vite, dan HMR websocket.
 * `/api` dikecualikan supaya tidak pernah menyentuh proxy `localhost:3001`.
 */
function isLocalDevRequest(request: RequestShape): boolean {
  const url = request.url;
  if (!url) return false;
  if (url.protocol === "blob:" || url.protocol === "data:") return true;
  if (url.protocol === "ws:" || url.protocol === "wss:")
    return isAppDevServer(url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!isAppDevServer(url)) return false;
  return !isApiPath(url.pathname);
}

/**
 * Preflight fail-closed untuk target E2E. Dijalankan sekali per worker SEBELUM
 * test apa pun, di luar browser, tanpa menyentuh `/api` sama sekali.
 *
 * Yang dibuktikan, atau test berhenti di sini:
 *   1. Listener `localhost:3005` menjawab, jadi target-nya benar-benar lokal.
 *   2. Yang menjawab adalah dev-server Vite repo ini: `/` memuat client
 *      `@vite/client` + `/src/main.tsx`, dan `/@vite/client` melayani JS.
 *      Server produksi (`serve dist` hasil `pnpm start`) tidak punya salah satu
 *      pun, jadi build produksi TIDAK bisa dipakai sebagai target diam-diam.
 *   3. Proxy `/api` di `apps/web/vite.config.ts` hanya menunjuk ke loopback,
 *      jadi tidak ada backend produksi yang bisa dilayani di belakang `/api`.
 */
export async function assertLocalDevOnlyTarget(): Promise<void> {
  const failures: string[] = [];

  let documentBody: string;
  try {
    const response = await fetch(`${APP_ORIGIN}/`);
    const client = await fetch(`${APP_ORIGIN}/@vite/client`);
    if (!response.ok) failures.push(`GET / = ${response.status}`);
    if (
      !client.ok ||
      !(client.headers.get("content-type") ?? "").includes("javascript")
    ) {
      failures.push(
        `GET /@vite/client = ${client.status} ${client.headers.get("content-type") ?? "-"}`,
      );
    }
    documentBody = await response.text();
  } catch (error) {
    throw new Error(
      `[preflight] tidak ada listener dev di ${APP_ORIGIN}: ${(error as Error).message}. ` +
        `Jalankan dev server lokal apps/web (port 3005) sebelum E2E.`,
      { cause: error },
    );
  }

  if (
    !documentBody.includes("/@vite/client") ||
    !documentBody.includes("/src/main.tsx")
  ) {
    failures.push(
      "dokumen tidak memuat marker dev-server Vite (/@vite/client, /src/main.tsx)",
    );
  }

  let viteConfig = "";
  try {
    viteConfig = readFileSync(
      path.join(REPO_ROOT, "apps/web/vite.config.ts"),
      "utf8",
    );
  } catch (error) {
    failures.push(`vite.config.ts tidak terbaca: ${(error as Error).message}`);
  }
  const proxyBlock = viteConfig.match(/proxy:\s*\{[\s\S]*?\}/)?.[0] ?? "";
  if (!/target:\s*"http:\/\/(localhost|127\.0\.0\.1):\d+"/.test(proxyBlock)) {
    failures.push(
      `proxy /api tidak terbukti menunjuk ke loopback: ${proxyBlock.trim() || "-"}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `[preflight] target E2E bukan dev-server lokal yang terbukti aman:\n- ${failures.join("\n- ")}`,
    );
  }
  console.log(
    `[preflight] OK: ${APP_ORIGIN} = Vite dev server repo ini; proxy /api = loopback; guard browser = fail-closed`,
  );
}

/**
 * Guard fail-closed. Daftarkan SETELAH semua route mock: Playwright memeriksa
 * handler dalam urutan terbalik pendaftaran, sehingga guard ini yang pertama kali
 * menangani setiap request dan hanya meneruskan (`fallback`) ke handler mock atau
 * ke dev-server loopback. Tidak ada `fallback` untuk `/api` yang tidak ada di
 * `MOCKED_API`, sehingga request tak dikenal tidak pernah keluar.
 */
export async function installNetworkGuard(page: Page, audit: NetworkAudit) {
  await page.route("**/*", async (route) => {
    const request = shapeRequest(route.request());

    if (isMockedApiRequest(request)) {
      audit.mockedApi.push(request.label);
      // MVP read-only: apa pun selain GET ke endpoint jadwal adalah bukti gagal.
      if (request.method !== "GET") audit.writes.push(request.label);
      await route.fallback();
      return;
    }

    if (isMockedAuthRequest(request)) {
      audit.mockedAuth.push(request.label);
      await route.fallback();
      return;
    }

    if (isLocalDevRequest(request)) {
      audit.localDev.push(request.label);
      await route.fallback();
      return;
    }

    // Font publik: izinkan lewat, tapi catat terpisah supaya bucket ini bisa
    // diaudit sendiri (lihat `NetworkAudit.allowedFonts`).
    if (request.url && isExternalFontRequest(request.url)) {
      audit.allowedFonts.push(request.label);
      await route.fallback();
      return;
    }

    if (request.url && !isAppDevServer(request.url)) {
      audit.blockedExternal.push(request.label);
    } else if (request.url && isApiPath(request.url.pathname)) {
      audit.blockedApi.push(request.label);
    } else {
      audit.blockedLocal.push(request.label);
    }

    await route.abort("blockedbyclient");
  });
}

export function formatAudit(audit: NetworkAudit): string {
  return JSON.stringify(
    {
      mockedApi: audit.mockedApi,
      mockedAuth: audit.mockedAuth,
      localDevCount: audit.localDev.length,
      blockedApi: audit.blockedApi,
      blockedExternal: audit.blockedExternal,
      allowedFonts: audit.allowedFonts,
      blockedLocal: audit.blockedLocal,
      writes: audit.writes,
    },
    null,
    2,
  );
}

/**
 * Bukti isolasi: browser tidak pernah menyentuh WFM/GAS/host luar, tidak ada
 * `/api` tak dikenal yang masuk proxy, dan tidak ada operasi tulis.
 *
 * `allowBlockedExternal` dipakai oleh test yang SENGAJA mencoba egress: entri
 * yang cocok diizinkan ADA di `blockedExternal` (justru bukti guard bekerja),
 * sementara host lain tetap harus nihil.
 */
export function expectIsolation(
  audit: NetworkAudit,
  opts: {
    allowBlockedExternal?: readonly string[];
    requireApiCall?: boolean;
  } = {},
) {
  const { allowBlockedExternal = [], requireApiCall = true } = opts;

  const unexpectedExternal = audit.blockedExternal.filter(
    (entry) => !allowBlockedExternal.some((allowed) => entry.includes(allowed)),
  );
  expect(
    unexpectedExternal,
    `browser menghubungi host tak terduga:\n${formatAudit(audit)}`,
  ).toEqual([]);
  expect(
    audit.blockedApi,
    `browser mengirim /api di luar allowlist:\n${formatAudit(audit)}`,
  ).toEqual([]);
  // Bucket font boleh berisi apa saja selama host-nya benar-benar font publik.
  for (const entry of audit.allowedFonts) {
    expect(
      entry,
      `host non-font masuk ke bucket font:\n${formatAudit(audit)}`,
    ).toMatch(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//);
  }
  expect(
    audit.writes,
    `MVP read-only tapi ada operasi tulis:\n${formatAudit(audit)}`,
  ).toEqual([]);

  if (requireApiCall) {
    expect(
      audit.mockedApi.length,
      `endpoint jadwal tidak pernah dipanggil:\n${formatAudit(audit)}`,
    ).toBeGreaterThan(0);
  }
}

/** Alias lama dipertahankan supaya spec bisa memakai nama yang lebih pendek. */
export const expectNoApplicationTraffic = expectIsolation;

// ── Mock endpoint jadwal di browser ─────────────────────────────────────────

/**
 * Perilaku yang bisa dipilih per test. Semua state UI yang disepakati harus punya
 * cara untuk dibuktikan tanpa upstream nyata.
 */
export type JadwalApiBehavior =
  /**
   * `monthRows` memberi fixture bulan eksplisit per test, dipakai spec matriks
   * yang butuh baris dengan kode shift tertentu. Tanpa ini semua test kalender
   * dipaksa memakai `monthRows()` yang sama, sehingga rekap hanya bisa terbukti
   * untuk satu kombinasi data.
   */
  | {
      kind: "data";
      rows?: unknown[];
      /** Baris bulan khusus test ini; `month` di dalam baris tetap dipakai. */
      monthRows?: unknown[];
      truncated?: boolean;
      asOf?: string;
      /** Delay a success response so loading states are observable in E2E. */
      delayMs?: number;
    }
  | { kind: "empty" }
  | { kind: "error"; code: string; message: string; status: number }
  /** Error jaringan: `fetchApi` melempar sebelum envelope terbaca. */
  | { kind: "network-error" };

/**
 * Request yang benar-benar sampai ke mock, supaya spec bisa memeriksa query
 * `date` yang dikirim dan tidak hanya DOM yang dirender.
 */
export type CapturedJadwalRequest = {
  method: string;
  /** Path API yang benar-benar dipanggil, membedakan hari dan bulan. */
  path: string;
  search: URLSearchParams;
  date: string | null;
  month: string | null;
};

const capturedRequests: CapturedJadwalRequest[] = [];

export function capturedJadwalRequests(): readonly CapturedJadwalRequest[] {
  return capturedRequests;
}

export function resetCapturedJadwalRequests(): void {
  capturedRequests.length = 0;
}

/** Envelope sukses dengan bentuk yang harus dipenuhi oleh halaman. */
export function jadwalSuccessBody(
  rows: unknown[],
  overrides: { truncated?: boolean; asOf?: string } = {},
) {
  // `channels` diturunkan dari baris, sama persis dengan cara backend
  // menghitungnya — supaya fixture tidak punya sumber kebenaran kedua yang
  // bisa berbeda dari data yang dirender.
  const channels = [
    ...new Set(
      rows
        .map((row) => (row as { channel?: string }).channel ?? "")
        .filter(Boolean),
    ),
  ].sort();
  return {
    success: true,
    data: {
      date: FIXTURE_DATE,
      rows,
      total: rows.length,
      truncated: overrides.truncated ?? false,
      channels,
      asOf: overrides.asOf ?? "2026-09-28T03:00:00.000Z",
    },
  };
}

/**
 * Bulan tetap untuk UI E2E. Mock browser tidak menjalankan validasi rentang
 * backend, jadi angka ini boleh statis dan membuat ekspektasi deterministik
 * apa pun kapan test dijalankan.
 */
export const FIXTURE_MONTH = "2026-09";

/**
 * Baris sintetis untuk format harian: campuran layanan dan satu kode Off agar
 * tabel tetap membuktikan bahwa baris non-kerja tidak disembunyikan.
 */
export function dailyRows() {
  return [
    ...normalizedRows(),
    {
      nama: "Guntur Saputra",
      tl: "Doni Kurnia",
      channel: "Leader",
      shift: "OFF",
      shiftPrev: "H",
      date: FIXTURE_DATE,
      activities: [],
    },
  ];
}

/**
 * Template baris kalender: satu tanggal punya campuran masuk dan libur, dan
 * empat bagian (Call, Digital Chat, Email, Leader) semuanya terwakili — itu
 * persis yang diminta tampilan kalender.
 */
const MONTH_TEMPLATE = [
  {
    day: 26,
    nama: "Bagas Prakoso",
    tl: "Rina Salim",
    channel: "Call",
    shift: "23:00 - 07:00",
  },
  {
    day: 26,
    nama: "Hendra Wijaya",
    tl: "Rina Salim",
    channel: "Call",
    shift: "OFF",
  },
  {
    day: 26,
    nama: "Alya Pranoto",
    tl: "Rina Salim",
    channel: "Digital Chat",
    shift: "H",
  },
  {
    day: 27,
    nama: "Citra Wulandari",
    tl: "Doni Kurnia",
    channel: "Email",
    shift: "H",
  },
  {
    day: 27,
    nama: "Bayu Nugroho",
    tl: "Doni Kurnia",
    channel: "Email",
    shift: "OFF",
  },
  {
    day: 28,
    nama: "Sari Melati",
    tl: "Yusuf Hakim",
    channel: "Leader",
    shift: "H",
  },
] as const;

/**
 * Baris bulanan yang TANGGALNYA mengikuti bulan yang diminta, bukan bulan
 * statis. Itu yang membuat test navigasi bulan tetap berarti: bulan berikutnya
 * benar-benar menampilkan data bulan berikutnya, bukan data lama yang
 * dibiarkan begitu saja.
 */
export function monthRows(month: string = FIXTURE_MONTH) {
  return MONTH_TEMPLATE.map((row) => ({
    nama: row.nama,
    tl: row.tl,
    channel: row.channel,
    shift: row.shift,
    date: `${month}-${String(row.day).padStart(2, "0")}`,
  }));
}

/** Respons bulan dengan `from`/`to` yang dihitung dari bulan yang diminta. */
/**
 * `rows` opsional membiarkan test menyediakan baris bulan sendiri. Kalau tidak
 * diberikan, `monthRows(month)` dipakai agar `from`/`to`/`total` tetap dihitung
 * dari baris yang benar-benar dikirim.
 */
export function monthSuccessBody(
  month: string,
  overrides: { truncated?: boolean; asOf?: string } = {},
  rowsOverride?: unknown[],
) {
  const rows = rowsOverride ?? monthRows(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const channels = [...new Set(rows.map((row) => row.channel))].sort();
  return {
    success: true,
    data: {
      month,
      from: `${month}-01`,
      to: `${month}-${String(lastDay).padStart(2, "0")}`,
      rows,
      total: rows.length,
      truncated: overrides.truncated ?? false,
      channels,
      asOf: overrides.asOf ?? "2026-09-28T03:00:00.000Z",
    },
  };
}

/**
 * Bentuk row yang sudah dinormalisasi backend. Disusun di sini (bukan dari
 * fixture mentah) supaya spec menguji KONTRAK respons, bukan bentuk upstream.
 */
export function normalizedRows() {
  return [
    {
      nama: OVERNIGHT_AGENT.nama,
      tl: OVERNIGHT_AGENT.tl,
      channel: OVERNIGHT_AGENT.channel,
      shift: OVERNIGHT_AGENT.shift,
      shiftPrev: OVERNIGHT_AGENT.shift_prev,
      date: OVERNIGHT_AGENT.date,
      activities: [
        { slot: 0, label: "00:00", value: "Briefing shift" },
        { slot: 1, label: "00:15", value: "Briefing shift" },
        { slot: 88, label: "22:00", value: "Closing recap" },
        { slot: 89, label: "22:15", value: "Closing recap" },
        { slot: 90, label: "22:30", value: "Closing recap" },
        { slot: 91, label: "22:45", value: "Closing recap" },
      ],
    },
    {
      nama: DAYTIME_AGENT.nama,
      tl: DAYTIME_AGENT.tl,
      channel: DAYTIME_AGENT.channel,
      shift: DAYTIME_AGENT.shift,
      shiftPrev: DAYTIME_AGENT.shift_prev,
      date: DAYTIME_AGENT.date,
      activities: [
        { slot: 32, label: "08:00", value: "Handling chat" },
        { slot: 33, label: "08:15", value: "Handling chat" },
        { slot: 34, label: "08:30", value: "Escalation" },
      ],
    },
    {
      nama: NO_ACTIVITY_AGENT.nama,
      tl: NO_ACTIVITY_AGENT.tl,
      channel: NO_ACTIVITY_AGENT.channel,
      shift: NO_ACTIVITY_AGENT.shift,
      shiftPrev: NO_ACTIVITY_AGENT.shift_prev,
      date: NO_ACTIVITY_AGENT.date,
      activities: [],
    },
  ];
}

export async function mockJadwalApi(
  page: Page,
  audit: NetworkAudit,
  behavior: JadwalApiBehavior,
) {
  // Bootstrap `LeaderAccessGate` — lihat catatan di `MOCKED_API`.
  await page.route(`${APP_ORIGIN}/api/v1/me/access-status*`, async (route) => {
    const request = route.request();
    audit.mockedApi.push(shapeRequest(request).label);
    await route.fulfill(
      toJson({
        success: true,
        data: {
          sidak: { status: "none", module: "sidak", created_at: null },
          ktp: { status: "none", module: "ktp", created_at: null },
        },
      }),
    );
  });

  const handleJadwalRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isMonth = url.pathname.endsWith("/jadwal-shifting/month");
    capturedRequests.push({
      method: request.method(),
      path: url.pathname,
      search: url.searchParams,
      date: url.searchParams.get("date"),
      month: url.searchParams.get("month"),
    });
    audit.mockedApi.push(shapeRequest(request).label);

    if (behavior.kind === "network-error") {
      await route.abort("failed");
      return;
    }
    if (behavior.kind === "data" && behavior.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
    }
    if (behavior.kind === "error") {
      await route.fulfill(
        toJson(
          {
            success: false,
            error: { code: behavior.code, message: behavior.message },
          },
          behavior.status,
        ),
      );
      return;
    }

    // Cabang kalender: path lebih panjang, jadi tanggalnya dihitung dari
    // bulan yang DIMINTA — bukan dari `FIXTURE_DATE` milik tampilan harian.
    if (isMonth) {
      const month = url.searchParams.get("month") || FIXTURE_MONTH;
      const body = monthSuccessBody(
        month,
        behavior.kind === "data"
          ? { truncated: behavior.truncated, asOf: behavior.asOf }
          : {},
        behavior.kind === "data" ? behavior.monthRows : undefined,
      );
      if (behavior.kind === "empty") {
        body.data.rows = [];
        body.data.total = 0;
        body.data.channels = [];
      }
      await route.fulfill(toJson(body));
      return;
    }

    if (behavior.kind === "empty") {
      await route.fulfill(
        toJson({
          success: true,
          data: {
            date: FIXTURE_DATE,
            rows: [],
            total: 0,
            truncated: false,
            channels: [],
            asOf: "2026-09-28T03:00:00.000Z",
          },
        }),
      );
      return;
    }
    await route.fulfill(
      toJson(
        jadwalSuccessBody(behavior.rows ?? normalizedRows(), {
          truncated: behavior.truncated ?? false,
          asOf: behavior.asOf,
        }),
      ),
    );
  };

  // Pola hari memakai `*`, dan dalam glob Playwright `*` TIDAK melewati `/`
  // — jadi path bulan (`.../jadwal-shifting/month`) tidak pernah tertangkap
  // pola itu dan harus didaftarkan sendiri. Tanpa ini request kalender lolos
  // dari mock, jatuh ke proxy dev, lalu dijawab 401 oleh API nyata: kegagalan
  // yang sama sekali bukan bagian dari kontrak yang diuji.
  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/jadwal-shifting*`,
    handleJadwalRoute,
  );
  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/jadwal-shifting/month*`,
    handleJadwalRoute,
  );
}

export type OpenOptions = {
  role?: string;
  behavior?: JadwalApiBehavior;
  /** Tanggal default di filter UI; default = `FIXTURE_DATE`. */
  date?: string;
  /** Tampilan yang dibuka: `today` (default) atau `calendar`. */
  view?: "today" | "calendar";
  /** Bulan kalender di URL; tanpa ini backend memilih bulan berjalan. */
  month?: string;
};

/**
 * Satu-satunya jalan masuk ke halaman: mock auth → mock API → guard fail-closed,
 * semuanya dalam satu urutan supaya tidak ada jendela request yang lolos.
 */
export async function openJadwalShifting(
  page: Page,
  opts: OpenOptions = {},
): Promise<NetworkAudit> {
  const { role = "trainer", behavior = { kind: "data" }, date } = opts;
  const audit = startAudit();

  await mockSupabaseAuth(page, { role });
  await mockJadwalApi(page, audit, behavior);
  await installNetworkGuard(page, audit);

  const search = new URLSearchParams();
  if (date) search.set("date", date);
  if (opts.view) search.set("view", opts.view);
  if (opts.month) search.set("month", opts.month);
  const query = search.toString();
  await page.goto(`/sidak/jadwal-shifting${query ? `?${query}` : ""}`);
  return audit;
}

// ── Stub upstream WFM (loopback, sintetis) ─────────────────────────────────

/**
 * How upstream harus berperilaku. `hang` sengaja ada supaya timeout adapter
 * bisa dibuktikan, bukan diasumsikan.
 *
 * `stall-body-*` adalah bentuk yang lebih licik dari `hang`: header sukses
 * sudah terkirim ke adapter, hanya body-nya yang tidak pernah diakhiri. Kalau
 * deadline adapter hanya melindungi `fetch()` saja, dua mode ini membuat
 * `await response.text()` menggantung tanpa batas — upstream seperti ini nyata
 * ada (proxy yang menahan chunk terakhir), jadi harus ditutup secara kontrak,
 * bukan dianggap mustahil.
 */
export type StubMode =
  | "ok"
  | "unauthorized"
  | "server-error"
  | "malformed"
  | "not-json"
  | "error-sentinel"
  | "schedule-redirect"
  | "hang"
  /** `/rest/v1/wfm_schedules`: header sukses ter-flush, body tidak diakhiri. */
  | "stall-body-schedule";

/**
 * Sentinel sintetis untuk membuktikan bahwa teks upstream tidak pernah bocor.
 *
 * Isinya sengaja meniru body error PostgREST yang memantulkan API key dan host.
 * Seluruh nilai dibuat-buat di file ini dan tidak pernah diambil dari WFM nyata.
 */
export const UPSTREAM_ERROR_SENTINEL = "WFM-SENTINEL-4f1c-7d0e-DO-NOT-SURFACE";

export const UPSTREAM_ERROR_SENTINEL_DETAIL =
  `apiKey=stub-only-key-not-a-secret ` +
  `databaseUrl=https://sentinel.invalid ${UPSTREAM_ERROR_SENTINEL}`;

export type StubWfm = {
  baseUrl: string;
  calls: {
    /** Query jadwal yang benar-benar sampai ke stub,beserta method HTTP-nya. */
    schedules: Array<{
      method: string;
      search: string;
      select: string | null;
      date: string | null;
      /**
       * SEMUA nilai `date` pada query. Query rentang mengulang parameter itu
       * (`date=gte.X` + `date=lte.Y`), sedangkan `get()` hanya mengembalikan
       * yang pertama — jadi tanpa daftar ini, pembatasan rentang tidak akan
       * pernah terbukti oleh test.
       */
      dates: string[];
      limit: string | null;
      path: string;
      apiKey: string | null;
      authorization: string | null;
    }>;
  };
  /** Berapa kali redirect test target menerima request. */
  redirects: () => number;
  /**
   * Berapa kali stub benar-benar mengirim header tanpa mengakhiri body.
   *
   * Wajib ada supaya test bisa membuktikan jalurnya: tanpa penghitung ini, test
   * "body menggantung" juga akan hijau kalau stub ternyata gagal sebelum
   * membalas apa pun, sehingga tidak membuktikan apa pun soal deadline body.
   */
  stalls: { schedule: number };
  setMode: (mode: StubMode) => void;
  setRows: (rows: unknown[]) => void;
  /** Socket yang masih hidup; harus 0 setelah `close()`. */
  openSocketCount: () => number;
  close: () => Promise<void>;
};

/**
 * Stub PostgREST. Menyediakan `/rest/v1/wfm_schedules` (yang dibaca adapter) dan
 * sengaja TIDAK menyediakan tabel lain, jadi `users`/`reasons`/`swaps` yang
 * dilarang plan akan langsung gagal.
 */
export async function startWfmStub(): Promise<StubWfm> {
  let mode: StubMode = "ok";
  let rows: unknown[] = SCHEDULE_FIXTURE_ROWS;
  let redirects = 0;
  let closed = false;

  const calls: StubWfm["calls"] = { schedules: [] };
  const stalls: StubWfm["stalls"] = { schedule: 0 };
  const openSockets = new Set<import("node:net").Socket>();

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    const send = (status: number, body: string, contentType = "text/plain") => {
      res.writeHead(status, { "content-type": contentType });
      res.end(body);
    };

    if (url.pathname === "/redirect-target") {
      redirects += 1;
      send(200, "[]", "application/json");
      return;
    }

    /**
     * Kirim header sukses, lalu JANGAN pernah mengakhiri body.
     *
     * Ini bukan `hang`: adapter sudahLegit mendapat status 200 dan
     * `content-type`, jadi satu-satunya yang bisa memotong keadaan ini adalah
     * deadline yang masih hidup sampai body selesai dibaca. Socket yang menggantung
     * ini akan ditutup oleh abort adapter atau oleh teardown, jadi error di
     * response harus diabaikan — kalau tidak, satu abort yang benar justru
     * menjatuhkan proses test.
     */
    const stallBody = (response: ServerResponse) => {
      response.on("error", () => {});
      response.writeHead(200, { "content-type": "application/json" });
      response.flushHeaders();
    };

    // ── PostgREST schedules ──
    if (url.pathname === "/rest/v1/wfm_schedules") {
      calls.schedules.push({
        method: req.method ?? "GET",
        path: url.pathname,
        search: url.search.replace(/^\?/, ""),
        select: url.searchParams.get("select"),
        date: url.searchParams.get("date"),
        dates: url.searchParams.getAll("date"),
        limit: url.searchParams.get("limit"),
        apiKey:
          typeof req.headers.apikey === "string" ? req.headers.apikey : null,
        authorization:
          typeof req.headers.authorization === "string"
            ? req.headers.authorization
            : null,
      });
      if (mode === "hang") return;
      if (mode === "stall-body-schedule") {
        stalls.schedule += 1;
        stallBody(res);
        return;
      }
      if (mode === "schedule-redirect") {
        res.writeHead(302, {
          location: "/redirect-target",
          "content-length": "0",
        });
        res.end();
        return;
      }
      if (mode === "unauthorized") {
        send(
          401,
          JSON.stringify({ message: "invalid API key" }),
          "application/json",
        );
        return;
      }
      if (mode === "server-error") {
        send(500, JSON.stringify({ message: "boom" }), "application/json");
        return;
      }
      if (mode === "error-sentinel") {
        send(
          500,
          JSON.stringify({ message: UPSTREAM_ERROR_SENTINEL_DETAIL }),
          "application/json",
        );
        return;
      }
      if (mode === "not-json") {
        send(200, "<html>gateway</html>", "text/html");
        return;
      }
      if (mode === "malformed") {
        send(
          200,
          JSON.stringify({ unexpected: "object-not-array" }),
          "application/json",
        );
        return;
      }
      const limitRaw = Number(url.searchParams.get("limit") ?? "");
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : rows.length;
      send(200, JSON.stringify(rows.slice(0, limit)), "application/json");
      return;
    }

    // Tabel lain sengaja 404 supaya radius query bisa dibuktikan.
    send(
      404,
      JSON.stringify({ message: `stub tidak menyediakan ${url.pathname}` }),
      "application/json",
    );
  });

  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.on("close", () => openSockets.delete(socket));
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    // Loopback + port 0: tidak mungkin menabrak host non-test.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("gagal menentukan port stub WFM"));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    redirects: () => redirects,
    stalls,
    setMode: (next) => {
      mode = next;
    },
    setRows: (next) => {
      rows = next;
    },
    openSocketCount: () => openSockets.size,
    /**
     * Menutup listener DAN semua socket yang masih menggantung.
     *
     * Socket wajib ditutup, bukan cuma listener: pada mode stall, respons
     * `writeHead` + `flushHeaders` tidak pernah diakhiri, jadi `server.close()`
     * saja akan menunggu selamanya dan membocorkannya sebagai handle yang
     * menggantung setelah test selesai. Idempoten supaya `afterEach` boleh
     * memanggilnya lagi setelah test menutup stub lebih dulu.
     */
    close: async () => {
      if (closed) return;
      closed = true;
      for (const socket of openSockets) socket.destroy();
      openSockets.clear();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Kunci env WFM ke stub lokal untuk duration test, lalu pulihkan. Nilai yang
 * dipakai adalah kredensial PALSU yang hanya valid di dalam stub.
 */
export const WFM_TEST_ENV_KEYS = [
  // Legacy variables are cleared to prove the new direct-REST path is independent.
  "WFM_SCHEDULE_APP_URL",
  "WFM_SCHEDULE_API_ALLOWED_ORIGINS",
  "WFM_SCHEDULE_SUPABASE_URL",
  "WFM_SCHEDULE_SUPABASE_KEY",
  "WFM_SCHEDULE_USERNAME",
  "WFM_SCHEDULE_PASSWORD",
  "WFM_SCHEDULE_TIMEOUT_MS",
  "WFM_SCHEDULE_MAX_ROWS",
  "WFM_SCHEDULE_MAX_MONTH_ROWS",
  "WFM_SCHEDULE_TIMEZONE",
  "WFM_SCHEDULE_MAX_DATE_OFFSET_DAYS",
] as const;

export function applyWfmStubEnv(
  baseUrl: string,
  overrides: Record<string, string> = {},
) {
  const previous = new Map<string, string | undefined>();
  const values: Record<string, string> = {
    WFM_SCHEDULE_SUPABASE_URL: baseUrl,
    WFM_SCHEDULE_SUPABASE_KEY: "stub-only-key-not-a-secret",
    WFM_SCHEDULE_API_ALLOWED_ORIGINS: new URL(baseUrl).origin,
    WFM_SCHEDULE_TIMEOUT_MS: "2000",
    ...overrides,
  };
  for (const key of WFM_TEST_ENV_KEYS) {
    previous.set(key, process.env[key]);
    const next = values[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}
