import type {
  JadwalShiftingActivity,
  JadwalShiftingErrorCode,
  JadwalShiftingMonthResponse,
  JadwalShiftingMonthRow,
  JadwalShiftingResponse,
  JadwalShiftingRow,
} from "@trainers/types";

/**
 * Adapter read-only server-side untuk jadwal shifting WFM Dash Pro.
 * Key Supabase hanya dibaca dari env backend, dikirim dalam header TLS, dan
 * tidak pernah masuk URL, log, respons, atau bundle frontend. Query dibatasi
 * satu tanggal ATAU satu bulan (maksimal 31 hari per permintaan), satu tabel,
 * proyeksi kolom minimum, serta GET saja.
 * Tanpa konfigurasi valid atau jika upstream gagal, endpoint gagal tertutup;
 * kegagalan tidak pernah disamarkan sebagai jadwal kosong.
 */

/** Grid slot aktivitas WFM: 15 menit, 96 slot per hari. */
const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

/** Proyeksi kolom ke `wfm_schedules`. Tidak ada kolom lain yang boleh ikut. */
const SCHEDULE_COLUMNS = [
  "nama",
  "tl",
  "shift",
  "shift_prev",
  "activities",
  "date",
  "channel",
] as const;

/**
 * Proyeksi untuk query bulanan. `activities` dan `shift_prev` ditiadakan
 * karena kalender tidak pernah menampilkannya — memilihnya hanya akan membawa
 * grid 96 slot per baris untuk data yang tidak dipakai.
 */
const MONTH_COLUMNS = ["nama", "tl", "channel", "shift", "date"] as const;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ROWS = 500;
/**
 * Batas baris bulanan. Satu hari nyata memuat ±78 baris, jadi satu bulan
 * berkisar 2.400 baris; default 3.000 memberi ruang tanpa membiarkan satu
 * permintaan menarik tabel tanpa batas.
 */
const DEFAULT_MAX_MONTH_ROWS = 3_000;
const DEFAULT_MAX_DATE_OFFSET_DAYS = 31;
/**
 * Zona waktu HANYA dipakai untuk memilih tanggal default saat parameter
 * `date` tidak dikirim.
 *
 * SENGAJA TIDAK ADA DEFAULT. Zona waktu resmi WFM belum dikonfirmasi, jadi
 * menyematkan satu tebakan di sini akan diam-diam menentukan tanggal yang
 * di-query untuk seluruh pengguna, dan salah satu hari = satu hari jadwal yang
 * salah ditampilkan sebagai data yang benar. Kalau `date` tidak dikirim dan
 * `WFM_SCHEDULE_TIMEZONE` kosong/tidak dikenal, adapter gagal tertutup dengan
 * `WFM_NOT_CONFIGURED`.
 */
const UTC_TIMEZONE = "UTC";

export type WfmScheduleErrorCode = Extract<
  JadwalShiftingErrorCode,
  | "WFM_NOT_CONFIGURED"
  | "WFM_UNAVAILABLE"
  | "WFM_UNAUTHORIZED"
  | "WFM_INVALID_RESPONSE"
>;

/**
 * Error upstream yang sudah dipetakan ke kode publik. Route Hono yang
 * memetakan `code` ke status HTTP; constructor file ini tidak tahu apa pun
 * tentang HTTP.
 */
export class WfmScheduleError extends Error {
  readonly code: WfmScheduleErrorCode;
  /** `true` kalau konfigurasi runtime yang bermasalah, bukan WFM yang menolak. */
  readonly configuration: boolean;

  constructor(
    code: WfmScheduleErrorCode,
    message: string,
    options: { configuration?: boolean; cause?: unknown } = {},
  ) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "WfmScheduleError";
    this.code = code;
    this.configuration = options.configuration ?? false;
  }
}

/**
 * Parameter permintaan yang tidak valid (mis. `date` di luar rentang).
 *
 * Dipisah dari `WfmScheduleError` supaya route tidak perlu menebak dari teks
 * pesan. Tanpa kelas ini, "tanggal salah" dan "WFM membalas struktur aneh"
 * akan sama-sama muncul sebagai `WFM_INVALID_RESPONSE` dan pemetaan ke 400/502
 * jadi rapuh.
 */
export class WfmScheduleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WfmScheduleInputError";
  }
}

// ── Konfigurasi server-only ────────────────────────────────────────────────

type WfmConfig = {
  apiUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRows: number;
  maxMonthRows: number;
  timezone: string;
  maxDateOffsetDays: number;
};

function readEnv(key: string): string {
  const raw = process.env[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function readPositiveInt(
  key: string,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const raw = readEnv(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Hanya `http:`/`https:` yang diterima, dan `https:` WAJIB di production.
 * URL upstream berasal dari env dan tetap diperlakukan sebagai input tak
 * tepercaya.
 */
function assertUsableHttpUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      `Konfigurasi ${label} bukan URL yang valid.`,
      { configuration: true },
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      `Konfigurasi ${label} harus memakai http atau https.`,
      { configuration: true },
    );
  }
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      `Konfigurasi ${label} wajib memakai https di production.`,
      { configuration: true },
    );
  }
  return value;
}

/**
 * Daftar origin PostgREST yang boleh menerima `apiKey`. Origin harus spesifik;
 * HTTP hanya diizinkan untuk loopback non-production agar E2E tetap lokal.
 */
function readAllowedApiOrigins(value: string): string[] {
  const invalid = () =>
    new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      "WFM_SCHEDULE_API_ALLOWED_ORIGINS harus berisi origin HTTPS; HTTP hanya diizinkan untuk loopback non-production.",
      { configuration: true },
    );
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => !entry)) throw invalid();

  const origins = entries.map((entry) => {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw invalid();
    }
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          process.env.NODE_ENV !== "production" &&
          loopback
        )) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw invalid();
    }
    return url.origin;
  });

  return [...new Set(origins)];
}

/** Validasi URL konfigurasi sebelum apiKey dipasang pada request. */
function assertAllowedApiOrigin(
  value: string,
  allowedOrigins: string[],
): string {
  const usableUrl = assertUsableHttpUrl(value, "WFM_SCHEDULE_SUPABASE_URL");
  let url: URL;
  try {
    url = new URL(usableUrl);
  } catch {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      "WFM_SCHEDULE_SUPABASE_URL bukan origin API yang disetujui.",
      { configuration: true },
    );
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !allowedOrigins.includes(url.origin)
  ) {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      "WFM_SCHEDULE_SUPABASE_URL tidak cocok dengan origin yang diizinkan.",
      { configuration: true },
    );
  }
  return url.origin;
}

/**
 * Env WFM yang wajib ada. Kosong di produksi = `WFM_NOT_CONFIGURED`, bukan
 * "jadwal kosong": halaman akan menampilkan state gagal dengan jelas.
 */
function readConfig(): WfmConfig {
  const apiUrl = readEnv("WFM_SCHEDULE_SUPABASE_URL");
  const apiKey = process.env.WFM_SCHEDULE_SUPABASE_KEY ?? "";
  const apiAllowedOriginsRaw = readEnv("WFM_SCHEDULE_API_ALLOWED_ORIGINS");

  const missing: string[] = [];
  if (!apiUrl) missing.push("WFM_SCHEDULE_SUPABASE_URL");
  if (!apiKey.trim()) missing.push("WFM_SCHEDULE_SUPABASE_KEY");
  if (!apiAllowedOriginsRaw) missing.push("WFM_SCHEDULE_API_ALLOWED_ORIGINS");
  if (missing.length > 0) {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      `Integrasi jadwal WFM belum dikonfigurasi pada backend (${missing.join(", ")}).`,
      { configuration: true },
    );
  }

  const apiAllowedOrigins = readAllowedApiOrigins(apiAllowedOriginsRaw);

  return {
    apiUrl: assertAllowedApiOrigin(apiUrl, apiAllowedOrigins),
    apiKey: apiKey.trim(),
    timeoutMs: readPositiveInt("WFM_SCHEDULE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, {
      min: 500,
      max: 60_000,
    }),
    maxRows: readPositiveInt("WFM_SCHEDULE_MAX_ROWS", DEFAULT_MAX_ROWS, {
      min: 1,
      max: 5_000,
    }),
    maxMonthRows: readPositiveInt(
      "WFM_SCHEDULE_MAX_MONTH_ROWS",
      DEFAULT_MAX_MONTH_ROWS,
      {
        min: 1,
        max: 5_000,
      },
    ),
    // Kosong = "tidak dikonfigurasi", bukan "pakai default". `readEnv` sudah
    // trims, jadi spasi excess tidak akan lolos sebagai zona waktu.
    timezone: readEnv("WFM_SCHEDULE_TIMEZONE"),
    maxDateOffsetDays: readPositiveInt(
      "WFM_SCHEDULE_MAX_DATE_OFFSET_DAYS",
      DEFAULT_MAX_DATE_OFFSET_DAYS,
      { min: 0, max: 366 },
    ),
  };
}

// ── Tanggal ────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Menolak `2026-02-30`, `2026-13-01`, dan bentuk tanggal non-padded. */
function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/**
 * "Hari ini" menurut zona waktu yang sudah divalidasi. `en-CA` sengaja dipilih
 * karena format outputnya sudah `YYYY-MM-DD`, jadi tidak ada perakitan manual
 * yang bisa salah soal digit.
 *
 * Tidak ada fallback diam-diam ke UTC di sini: pemanggil wajib memvalidasi zona
 * lebih dulu, jadi kegagalan constructor adalah kondisi yang tidak diharapkan —
 * dan diklasifikasikan sebagai masalah konfigurasi, bukan kegagalan jaringan.
 */
function todayInTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (cause) {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      `WFM_SCHEDULE_TIMEZONE (${timeZone}) tidak dapat dipakai di runtime ini.`,
      { configuration: true, cause },
    );
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Tanggal efektif yang akan di-query.
 *
 * Dua jalur, dan pemisahan itu disengaja:
 *
 * 1. **`date` eksplisit** → dipakai apa adanya. Zona waktu TIDAK dibutuhkan, dan
 *    tidak dikonfigurasi pun tetap aman: tanggal yang di-query adalah persis yang
 *    dikirim pengguna. Zona waktu hanya menjadi jangkar untuk jendela rentang
 *    `±maxDateOffsetDays` yang kasar; tanpa jangkar terkonfigurasi, UTC dipakai
 *    untuk jendela itu saja (selisihnya hitungan jam, jauh di bawah jendela
 *    puluhan hari) dan tidak pernah mengubah tanggal yang dikueri.
 * 2. **`date` tidak dikirim** → backend harus memilih "hari ini", dan itu tidak
 *    punya dasar tanpa zona waktu. Tidak dikonfigurasi/tidak dikenal berarti gagal
 *    tertutup dengan `WFM_NOT_CONFIGURED` — bukan diam-diam memakai zona tebakan.
 *
 * Bentuk input yang salah tetap jadi `WfmScheduleInputError` (400) dan diperiksa
 * lebih dulu, supaya permintaan dengan `date` rusak tidak dilaporkan sebagai
 * masalah konfigurasi server.
 */
export function resolveScheduleDate(
  requested: string | undefined,
  config: Pick<WfmConfig, "timezone" | "maxDateOffsetDays">,
): string {
  const value = requested?.trim();

  if (!value) {
    if (!isValidTimeZone(config.timezone)) {
      throw new WfmScheduleError(
        "WFM_NOT_CONFIGURED",
        "WFM_SCHEDULE_TIMEZONE harus diisi dengan zona waktu IANA yang dikenal saat parameter date tidak dikirim.",
        { configuration: true },
      );
    }
    return todayInTimeZone(config.timezone);
  }

  if (!isRealCalendarDate(value)) {
    throw new WfmScheduleInputError(
      "Parameter date harus berformat YYYY-MM-DD dan merupakan tanggal yang valid.",
    );
  }

  const rangeAnchor = isValidTimeZone(config.timezone)
    ? todayInTimeZone(config.timezone)
    : todayInTimeZone(UTC_TIMEZONE);
  if (Math.abs(daysBetween(rangeAnchor, value)) > config.maxDateOffsetDays) {
    throw new WfmScheduleInputError(
      `Tanggal di luar rentang ${config.maxDateOffsetDays} hari dari tanggal berjalan.`,
    );
  }
  return value;
}

// ── Bulan ─────────────────────────────────────────────────────────────────

/** Hanya `YYYY-MM` dengan bulan 01–12; `2026-13` dan `2026-9` ditolak. */
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `YYYY-MM-DD` ± N hari, dihitung pada tanggal saja (tanpa zona waktu). */
function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Jumlah hari dalam bulan; `Date.UTC(y, m, 0)` = hari terakhir bulan `m`. */
function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/**
 * Bulan berjalan pada zona waktu yang sudah divalidasi. Format `en-CA`
 * menghasilkan `YYYY-MM` apa adanya, sama seperti pilihan tanggal harian.
 */
function currentMonthInTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
  } catch (cause) {
    throw new WfmScheduleError(
      "WFM_NOT_CONFIGURED",
      `WFM_SCHEDULE_TIMEZONE (${timeZone}) tidak dapat dipakai di runtime ini.`,
      { configuration: true, cause },
    );
  }
}

/**
 * Bulan efektif beserta rentang hari yang akan di-query.
 *
 * Aturannya sengaja sama dengan pilihan tanggal, hanya hitungannya diganti
 * menjadi bulan:
 *
 * 1. **`month` eksplisit** → dipakai apa adanya; zona waktu tidak dibutuhkan.
 *    Bentuk salah tetap `WfmScheduleInputError` (400) dan diperiksa lebih
 *    dulu, supaya input rusak tidak dilaporkan sebagai masalah konfigurasi.
 * 2. **`month` tidak dikirim** → backend memilih bulan berjalan pada zona waktu
 *    yang dikonfigurasi; tanpa zona waktu yang valid, gagal tertutup dengan
 *    `WFM_NOT_CONFIGURED`, bukan menebak.
 *
 * Rentang `from..to` SELALU satu bulan penuh (28–31 hari), dan bulannya wajib
 * beririsan dengan jendela `±maxDateOffsetDays` dari tanggal berjalan — jadi
 * satu permintaan tidak pernah menarik data bulan yang jauh di luar jendela
 * yang sama yang membatasi query harian.
 */
export function resolveScheduleMonth(
  requested: string | undefined,
  config: Pick<WfmConfig, "timezone" | "maxDateOffsetDays">,
): { month: string; from: string; to: string } {
  const value = requested?.trim();

  let month: string;
  if (!value) {
    if (!isValidTimeZone(config.timezone)) {
      throw new WfmScheduleError(
        "WFM_NOT_CONFIGURED",
        "WFM_SCHEDULE_TIMEZONE harus diisi dengan zona waktu IANA yang dikenal saat parameter month tidak dikirim.",
        { configuration: true },
      );
    }
    month = currentMonthInTimeZone(config.timezone);
  } else {
    if (!ISO_MONTH.test(value)) {
      throw new WfmScheduleInputError(
        "Parameter month harus berformat YYYY-MM (contoh: 2026-09).",
      );
    }
    month = value;
  }

  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

  const rangeAnchor = isValidTimeZone(config.timezone)
    ? todayInTimeZone(config.timezone)
    : todayInTimeZone(UTC_TIMEZONE);
  const windowStart = shiftIsoDate(rangeAnchor, -config.maxDateOffsetDays);
  const windowEnd = shiftIsoDate(rangeAnchor, config.maxDateOffsetDays);
  if (to < windowStart || from > windowEnd) {
    throw new WfmScheduleInputError(
      `Bulan di luar rentang ${config.maxDateOffsetDays} hari dari tanggal berjalan.`,
    );
  }

  return { month, from, to };
}

// ── Transport ──────────────────────────────────────────────────────────────

/**
 * Apakah kegagalan ini berasal dari deadline milik kita sendiri?
 *
 * `AbortController` adalah sumber kebenaran: kalau signal-nya sudah ter-abort,
 * waktunya sudah habis, apa pun bentuk error yang dilemmas. Bentuk error
 * (`AbortError` langsung atau dibungkus `cause`) hanya dipakai sebagai bukti
 * tambahan, karena `fetch` dari Node bisa menolak dengan `DOMException
 * AbortError` maupun `TypeError: fetch failed` + `cause`, tergantung versi.
 */
function isAbortLike(cause: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (cause instanceof Error && cause.name === "AbortError") return true;
  const inner =
    cause instanceof Error ? (cause as { cause?: unknown }).cause : undefined;
  return inner instanceof Error && inner.name === "AbortError";
}

// ── Query jadwal ───────────────────────────────────────────────────────────

/**
 * Bentuk satu query ke `wfm_schedules`.
 *
 * Dipisah dari pelaksanaannya supaya query harian dan query bulanan tidak
 * bisa diam-diam berbagi filter: kolom, rentang tanggal, dan batas baris
 * ditentukan per jalur, dan keduanya tetap melewati `buildScheduleUrl` yang
 * sama (satu tabel, GET saja).
 */
type ScheduleQuery = {
  /** Kolom pada `select`. Tidak ada kolom lain yang boleh ikut. */
  columns: readonly string[];
  /**
   * Nilai `date` yang dikirim berurutan. Harian memakai satu `eq.`, bulanan
   * memakai pasangan `gte.` + `lte.`.
   */
  dateFilters: readonly string[];
  /**
   * `maxRows + 1` supaya "terpotong" bisa dibuktikan dari baris terakhir,
   * bukan dari tebakan.
   */
  limit: number;
};

function buildScheduleUrl(apiUrl: string, query: ScheduleQuery): string {
  const base = apiUrl.replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set("select", query.columns.join(","));
  // `append`, bukan `set`: PostgREST membaca rentang dari dua nilai pada
  // parameter yang sama (`date=gte.X` + `date=lte.Y`). `set` akan menimpa
  // salah satunya dan batas atas hilang diam-diam.
  for (const filter of query.dateFilters) params.append("date", filter);
  params.set("limit", String(query.limit));
  return `${base}/rest/v1/wfm_schedules?${params.toString()}`;
}

/**
 * Baca baris jadwal dari PostgREST.
 *
 * Deadline mencakup pengambilan header dan body: satu timer tetap
 * hidup sampai body selesai dibaca, karena PostgREST di belakang proxy bisa
 * mengirim header lebih dulu lalu menahan body. Kegagalan di tengah body tetap
 * `WFM_UNAVAILABLE` — bukan `rows: []`.
 */
async function queryScheduleRows(
  config: WfmConfig,
  query: ScheduleQuery,
): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(buildScheduleUrl(config.apiUrl, query), {
      method: "GET",
      headers: {
        apikey: config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new WfmScheduleError(
        "WFM_UNAUTHORIZED",
        `WFM menolak akses jadwal (HTTP ${response.status}).`,
      );
    }
    if (!response.ok) {
      throw new WfmScheduleError(
        "WFM_UNAVAILABLE",
        `WFM membalas HTTP ${response.status} untuk jadwal.`,
      );
    }

    // Kredensial harus dibuang SEBELUM body dibaca, supaya tidak pernah ikut
    // terbawa ke jalur error yang mungkin ikut dilog. Body dibaca di bawah
    // deadline yang masih hidup, jadi upstream yang menahan body tidak bisa
    // menggantung proses ini.
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new WfmScheduleError(
        "WFM_INVALID_RESPONSE",
        "Jadwal WFM membalas body yang bukan JSON.",
      );
    }

    if (!Array.isArray(parsed)) {
      throw new WfmScheduleError(
        "WFM_INVALID_RESPONSE",
        "Jadwal WFM membalas struktur yang tidak diharapkan (bukan array baris).",
      );
    }
    return parsed;
  } catch (cause) {
    // Klasifikasi yang sudah diputuskan di dalam `try` (kode HTTP, bentuk body)
    // tidak boleh ditimpa jadi "tidak dapat dihubungi".
    if (cause instanceof WfmScheduleError) throw cause;
    const aborted = isAbortLike(cause, controller.signal);
    throw new WfmScheduleError(
      "WFM_UNAVAILABLE",
      aborted
        ? `WFM jadwal melebihi batas waktu ${config.timeoutMs} ms.`
        : "Jadwal WFM tidak dapat dihubungi.",
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Normalisasi baris ──────────────────────────────────────────────────────

/** Label jam diturunkan dari indeks slot saja — tanpa konversi zona waktu. */
function slotLabel(slot: number): string {
  const minutesInDay = (slot % SLOTS_PER_DAY) * SLOT_MINUTES;
  const hours = String(Math.floor(minutesInDay / 60)).padStart(2, "0");
  const minutes = String(minutesInDay % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function invalidRow(detail: string): WfmScheduleError {
  return new WfmScheduleError(
    "WFM_INVALID_RESPONSE",
    `Baris jadwal WFM tidak valid: ${detail}.`,
  );
}

function readTextField(
  row: Record<string, unknown>,
  key: string,
  { required = false }: { required?: boolean } = {},
): string {
  const value = row[key];
  if (value === null || value === undefined) {
    if (required) throw invalidRow(`field wajib ${key} kosong`);
    return "";
  }
  if (typeof value !== "string") {
    throw invalidRow(`field ${key} bukan teks`);
  }
  return value;
}

/**
 * `activities` terverifikasi sebagai object dengan key numerik, dan sebagian
 * baris bernilai kosong atau array-like. Ketiga bentuk itu diterima; bentuk
 * lain dianggap data rusak agar tidak dirender sebagai "tanpa aktivitas" yang
 * bisa disalahartikan.
 */
function normalizeActivities(value: unknown): JadwalShiftingActivity[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return [];
  if (typeof value !== "object")
    throw invalidRow("field activities bukan object");

  const entries: Array<{ slot: number; value: string }> = [];
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue; // key non-numerik diabaikan, bukan error
    const slot = Number.parseInt(key, 10);
    if (!Number.isSafeInteger(slot) || slot < 0) continue;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) entries.push({ slot, value: trimmed });
      continue;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      entries.push({ slot, value: String(raw) });
      continue;
    }
    throw invalidRow(`activities[${key}] bukan teks`);
  }

  entries.sort((a, b) => a.slot - b.slot);
  return entries.map((entry) => ({
    slot: entry.slot,
    label: slotLabel(entry.slot),
    value: entry.value,
  }));
}

function normalizeRow(raw: unknown, requestedDate: string): JadwalShiftingRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalidRow("baris bukan object");
  }
  const row = raw as Record<string, unknown>;

  const rowDate = readTextField(row, "date");
  if (rowDate && !isRealCalendarDate(rowDate)) {
    throw invalidRow(`field date bukan tanggal yang valid (${rowDate})`);
  }
  const effectiveDate = rowDate || requestedDate;
  // Pada query rentang TIDAK ada tanggal cadangan yang bisa dipakai: baris
  // tanpa tanggal tidak bisa ditempatkan di kalender, dan mengarang satu
  // tanggal akan menampilkan jadwal pada hari yang salah.
  if (!effectiveDate) {
    throw invalidRow("field date kosong");
  }

  return {
    nama: readTextField(row, "nama", { required: true }),
    tl: readTextField(row, "tl"),
    channel: readTextField(row, "channel"),
    shift: readTextField(row, "shift"),
    shiftPrev: readTextField(row, "shift_prev"),
    date: effectiveDate,
    activities: normalizeActivities(row.activities),
  };
}

/**
 * Baris bulanan: normalisasi yang sama, lalu field yang tidak dipakai kalender
 * dibuang. `shiftPrev` dan `activities` tidak pernah ikut keluar dari sini.
 */
function normalizeMonthRow(raw: unknown): JadwalShiftingMonthRow {
  const row = normalizeRow(raw, "");
  return {
    nama: row.nama,
    tl: row.tl,
    channel: row.channel,
    shift: row.shift,
    date: row.date,
  };
}

// ── Entry point ────────────────────────────────────────────────────────────

export type FetchWfmScheduleResult = JadwalShiftingResponse;

/**
 * Membaca jadwal satu tanggal. Satu-satunya jalan dari route ke WFM.
 *
 * `requestedDate` kosong berarti "pakai tanggal berjalan pada zona waktu yang
 * dikonfigurasi"; tanggal efektifnya selalu dikembalikan di `data.date` supaya
 * UI tidak pernah menampilkan tanggal berbeda dari yang benar-benar di-query.
 */
export async function fetchWfmSchedule(
  requestedDate?: string,
): Promise<FetchWfmScheduleResult> {
  const config = readConfig();
  const date = resolveScheduleDate(requestedDate, config);

  const rawRows = await queryScheduleRows(config, {
    columns: SCHEDULE_COLUMNS,
    dateFilters: [`eq.${date}`],
    limit: config.maxRows + 1,
  });

  const truncated = rawRows.length > config.maxRows;
  const limited = truncated ? rawRows.slice(0, config.maxRows) : rawRows;
  const rows = limited.map((row) => normalizeRow(row, date));

  return {
    date,
    rows,
    total: rows.length,
    truncated,
    channels: [
      ...new Set(rows.map((row) => row.channel).filter(Boolean)),
    ].sort(),
    asOf: new Date().toISOString(),
  };
}

/**
 * Membaca jadwal satu bulan penuh (maksimal 31 hari) untuk kalender.
 *
 * `requestedMonth` kosong berarti "bulan berjalan pada zona waktu yang
 * dikonfigurasi"; bulan efektifnya selalu dikembalikan di `data.month`,
 * `data.from`, dan `data.to` supaya UI tidak pernah menghitung sendiri batas
 * yang berbeda dari yang benar-benar di-query.
 */
export async function fetchWfmScheduleMonth(
  requestedMonth?: string,
): Promise<JadwalShiftingMonthResponse> {
  const config = readConfig();
  const { month, from, to } = resolveScheduleMonth(requestedMonth, config);

  const rawRows = await queryScheduleRows(config, {
    columns: MONTH_COLUMNS,
    dateFilters: [`gte.${from}`, `lte.${to}`],
    limit: config.maxMonthRows + 1,
  });

  const truncated = rawRows.length > config.maxMonthRows;
  const limited = truncated ? rawRows.slice(0, config.maxMonthRows) : rawRows;
  const rows = limited.map((row) => normalizeMonthRow(row));

  return {
    month,
    from,
    to,
    rows,
    total: rows.length,
    truncated,
    channels: [
      ...new Set(rows.map((row) => row.channel).filter(Boolean)),
    ].sort(),
    asOf: new Date().toISOString(),
  };
}

/**
 * Redaksi untuk log: hanya nama host, tanpa path/query/key. Dipakai route saat
 * mencatat kegagalan supaya host WFM tidak ikut terekspos ke log aplikasi.
 */
export function redactUpstreamHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "[tidak-valid]";
  }
}
