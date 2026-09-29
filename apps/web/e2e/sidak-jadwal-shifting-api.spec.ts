import { expect, test } from "@playwright/test";
import { Hono } from "hono";
import {
  applyWfmStubEnv,
  FORBIDDEN_RESPONSE_KEYS,
  startWfmStub,
  UPSTREAM_ERROR_SENTINEL,
  type StubWfm,
} from "./helpers/sidakJadwalShiftingHarness";
import { sidakJadwalShifting } from "../../api/src/routes/sidak/jadwal-shifting";

/**
 * E2E kontrak BACKEND untuk `GET /api/v1/sidak/jadwal-shifting`.
 *
 * Yang diuji di sini adalah router Hono yang SESUNGGUHNYA akan melayani
 * production, termasuk `requireRole` sungguhan — bukan tiruan. Yang diganti
 * hanya dua hal, dan keduanya harus tetap lokal/test-only:
 *   1. Identitas. `authMiddleware` produksi butuh JWT Supabase asli, jadi di sini
 *      role disuntikkan lewat middleware test. Role-lah satu-satunya variabel
 *      yang diuji, jadi menyuntikkannya tidak melemahkan apa pun.
 *   2. Upstream WFM. `startWfmStub()` adalah server HTTP sintetis di 127.0.0.1
 *      dengan port ephemeral, jadi tidak ada kredensial WFM dan tidak ada host
 *      non-test yang tersentuh.
 *
 * Yang TIDAK dibuktikan di spec ini dan sengaja ditahan: konfigurasi secret
 * runtime produksi. `test("belum dikonfigurasi ...")` justru membuktikannya
 * fail-closed.
 */

type Envelope = {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};

/**
 * Menjalankan router jadwal di atas Hono dengan identitas suntikan. Timeout
 * sengaja longgar supaya timeout upstream (yang diuji terpisah) tetap punya
 * ruang; kegagalan konfigurasi lokal akan muncul jauh lebih cepat dari itu.
 */
type TestEnv = { Variables: { user: unknown; profile: unknown } };

function mountRouter(role: string | undefined) {
  const app = new Hono<TestEnv>()
    .use("*", async (c, next) => {
      c.set("user", { id: "user-test" });
      c.set("profile", { role, full_name: "Uji Role" });
      await next();
    })
    .route("/", sidakJadwalShifting as never);

  return async (
    path: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: Envelope }> => {
    const res = await app.request(`http://local.test${path}`, init);
    let body: Envelope;
    try {
      body = (await res.json()) as Envelope;
    } catch {
      body = {
        success: false,
        error: {
          code: "NON_JSON",
          message: `status ${res.status} tanpa body JSON`,
        },
      };
    }
    return { status: res.status, body };
  };
}

let stub: StubWfm;
let restoreEnv: () => void;

/**
 * Menangkap apa yang benar-benar ditulis route ke log proses.
 *
 * Ini yang membedakan "pesan upstream tidak sampai ke browser" dari "pesan
 * upstream tidak pernah dicatat di mana pun". Yang diuji adalah teks yang
 * benar-benar keluar dari `console`, bukan yang seharusnya keluar menurut
 * komentar di kode.
 */
function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" "),
    );
  };
  const warn = console.warn;
  const error = console.error;
  console.warn = record;
  console.error = record;
  return {
    lines,
    restore: () => {
      console.warn = warn;
      console.error = error;
    },
  };
}

test.beforeEach(async () => {
  stub = await startWfmStub();
  restoreEnv = applyWfmStubEnv(stub.baseUrl);
});

test.afterEach(async () => {
  restoreEnv();
  await stub.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Otorisasi role — WAJIB selesai sebelum ada kontak ke upstream
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Otorisasi role", () => {
  for (const role of ["admin", "trainer"]) {
    test(`role ${role} diizinkan dan boleh membaca jadwal`, async () => {
      const call = mountRouter(role);
      const res = await call("/jadwal-shifting?date=2026-09-28");

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.success).toBe(true);
      expect(
        stub.calls.schedules.length,
        "query read-only harus terjadi",
      ).toBeGreaterThan(0);
      for (const query of stub.calls.schedules) {
        expect(query.apiKey).toBe("stub-only-key-not-a-secret");
        expect(query.authorization).toBe("Bearer stub-only-key-not-a-secret");
      }
    });
  }

  for (const role of ["leader", "agent", "operator"]) {
    test(`role ${role} ditolak 403 sebelum upstream disentuh`, async () => {
      const call = mountRouter(role);
      const res = await call("/jadwal-shifting?date=2026-09-28");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe("FORBIDDEN");
      // Ini inti dari fail-closed: penolakan tidak boleh menyisakan jejak upstream.
      expect(
        stub.calls,
        `role ${role} tidak boleh memicu panggilan upstream sama sekali`,
      ).toEqual({ schedules: [] });
    });
  }

  test("role yang tidak dikenal, kosong, dan whitespace ditolak", async () => {
    for (const role of [undefined, "", "   "]) {
      const call = mountRouter(role);
      const res = await call("/jadwal-shifting?date=2026-09-28");
      expect(res.status, `role ${JSON.stringify(role)}`).toBe(403);
    }
    expect(stub.calls).toEqual({ schedules: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kontrak respons — allowlist ketat
// ═══════════════════════════════════════════════════════════════════════════

test("respons hanya berisi field yang disetujui", async () => {
  const call = mountRouter("trainer");
  const res = await call("/jadwal-shifting?date=2026-09-28");

  expect(res.status).toBe(200);
  const data = res.body.data as Record<string, unknown>;
  expect(Object.keys(data).sort()).toEqual([
    "asOf",
    "channels",
    "date",
    "rows",
    "total",
    "truncated",
  ]);
  expect(data.date).toBe("2026-09-28");

  const rows = data.rows as Array<Record<string, unknown>>;
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual([
      "activities",
      "channel",
      "date",
      "nama",
      "shift",
      "shiftPrev",
      "tl",
    ]);
    for (const key of Object.keys(row)) {
      expect(
        FORBIDDEN_RESPONSE_KEYS.map((k) => k.toLowerCase()),
        `field terlarang ${key} ikut di respons`,
      ).not.toContain(key.toLowerCase());
    }
  }

  // Seluruh payload diserialisasi lalu diperiksa ulang: ini yang menangkap
  // kebocoran di field yang tidak disebut di atas.
  const serialized = JSON.stringify(res.body).toLowerCase();
  for (const forbidden of ["sb_publishable", "apikey", "api_key", "password"]) {
    expect(serialized, `payload membocorkan ${forbidden}`).not.toContain(
      forbidden,
    );
  }
});

test("query ke upstream dibatasi satu tanggal, satu tabel, dan kolom allowlist", async () => {
  const call = mountRouter("admin");
  await call("/jadwal-shifting?date=2026-09-28");

  expect(stub.calls.schedules.length).toBeGreaterThan(0);
  for (const q of stub.calls.schedules) {
    // `date=eq.<tanggal>` — persis satu tanggal, tidak ada rentang liar.
    expect(q.date).toMatch(/^eq\.\d{4}-\d{2}-\d{2}$/);
    const select = (q.select ?? "").split(",").sort();
    expect(select).toEqual(
      [
        "activities",
        "channel",
        "date",
        "nama",
        "shift",
        "shift_prev",
        "tl",
      ].sort(),
    );
    // Tidak ada tabel lain yang boleh disentuh.
    expect(q.search).not.toMatch(/users|reasons|swaps|lightweight/i);
  }
});

test("redirect upstream tidak diikuti", async () => {
  stub.setMode("schedule-redirect");
  const call = mountRouter("trainer");
  const res = await call("/jadwal-shifting?date=2026-09-28");

  expect(res.status).toBe(502);
  expect(res.body.error?.code).toBe("WFM_UNAVAILABLE");
  expect(
    stub.redirects(),
    "request tidak boleh mengikuti Location dari PostgREST",
  ).toBe(0);
});

test("Supabase URL di luar allowlist ditolak sebelum query dan sebelum key dikirim", async () => {
  restoreEnv();
  restoreEnv = applyWfmStubEnv(stub.baseUrl, {
    WFM_SCHEDULE_SUPABASE_URL: "https://untrusted.invalid",
  });
  const call = mountRouter("trainer");
  const res = await call("/jadwal-shifting?date=2026-09-28");

  expect(res.status).toBe(503);
  expect(res.body.error?.code).toBe("WFM_NOT_CONFIGURED");
  expect(
    stub.calls.schedules,
    "key tidak boleh dikirim ke origin yang tidak diizinkan",
  ).toEqual([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// Kegagalan upstream HARUS menjadi error, bukan jadwal kosong
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Kegagalan upstream", () => {
  const cases: Array<{
    mode: Parameters<StubWfm["setMode"]>[0];
    code: string;
    status: number;
  }> = [
    { mode: "unauthorized", code: "WFM_UNAUTHORIZED", status: 502 },
    { mode: "server-error", code: "WFM_UNAVAILABLE", status: 502 },
    { mode: "not-json", code: "WFM_INVALID_RESPONSE", status: 502 },
    { mode: "malformed", code: "WFM_INVALID_RESPONSE", status: 502 },
  ];

  for (const { mode, code, status } of cases) {
    test(`upstream ${mode} menghasilkan error ${code}, bukan jadwal kosong`, async () => {
      stub.setMode(mode);
      const call = mountRouter("trainer");
      const res = await call("/jadwal-shifting?date=2026-09-28");

      expect(res.status).toBe(status);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code).toBe(code);
      // Tidak boleh ada `rows: []` yang menyamar sebagai "tidak ada jadwal".
      expect(res.body.data).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('"rows"');
    });
  }

  test("upstream yang tidak menjawab menghasilkan timeout, bukan data basi", async () => {
    restoreEnv();
    // `readPositiveInt` menolak nilai di bawah 500 ms, jadi angka yang lebih
    // kecil dari itu akan DIABAIKAN dan deadline efektifnya jadi default 10
    // detik — test tetap hijau, tapi tidak lagi menguji deadline pendek. 600 ms
    // dipakai supaya ini benar-benar deadline singkat yang bisa dibedakan dari
    // default. Jangan diturunkan ke bawah 500.
    restoreEnv = applyWfmStubEnv(stub.baseUrl, {
      WFM_SCHEDULE_TIMEOUT_MS: "600",
    });
    stub.setMode("hang");

    const call = mountRouter("trainer");
    const res = await call("/jadwal-shifting?date=2026-09-28");

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe("WFM_UNAVAILABLE");
    expect(res.body.data).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Deadline harus mencakup BODY upstream, bukan hanya header
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Batas keras untuk membuktikan "tidak menggantung", bukan untuk menguji
 * timeout. Nilainya jauh di atas deadline yang dikonfigurasi, jadi test hanya
 * gagal di sini kalau router benar-benar tidak pernah menjawab — kondisi yang
 * tanpa batas keras ini hanya muncul sebagai `test timeout` 30 detik tanpa
 * informasi apa pun.
 */
const HANG_GUARD_MS = 8_000;

type ScheduleCall = (
  path: string,
  init?: RequestInit,
) => Promise<{ status: number; body: Envelope }>;

/**
 * Menjalankan router dengan batas keras, sambil mencatat berapa lama dia menjawab.
 *
 * Batas keras ini penting justru untuk mode stall: kalau deadline bocor,
 * `call` TIDAK PERNAH resolve, jadi `await` biasa hanya akan menggantung sampai
 * Playwright memotong test. `Promise.race` mengubahnya jadi kegagalan yang
 * menyebut penyebabnya. Promise yang kalah tetap punya handler (dari `race`),
 * jadi abort yang terjadi belakangan tidak jadi unhandled rejection.
 */
async function callWithoutHanging(
  call: ScheduleCall,
  path: string,
  guardMs = HANG_GUARD_MS,
): Promise<{ status: number; body: Envelope; elapsedMs: number }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `router tidak menjawab dalam ${guardMs} ms: deadline upstream bocor, tidak ada respons sama sekali`,
          ),
        ),
      guardMs,
    );
  });

  const startedAt = Date.now();
  try {
    const res = await Promise.race([call(path), guard]);
    return { ...res, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

test.describe("Deadline mencakup body upstream", () => {
  /**
   * `readPositiveInt` menolak nilai di bawah 500 ms, jadi 300 ms akan diabaikan
   * dan deadline sebenarnya jadi default 10 detik. 600 ms dipakai supaya test
   * benar-benar memakai deadline yang pendek dan bisa dibedakan dari default.
   */
  const DEADLINE_ENV = { WFM_SCHEDULE_TIMEOUT_MS: "600" };
  /**
   * Batas bawah waktu tunggu. Tanpa ini, test juga akan hijau kalau adapter
   * gagal karena alasan lain yang lebih cepat — yang harus dibuktikan di sini
   * adalah "deadline yang memotong", bukan "kegagalan apa pun yang terjadi".
   */
  const MIN_WAIT_MS = 250;

  test("endpoint jadwal yang membalas header tapi tidak mengakhiri body tidak menggantung API", async () => {
    restoreEnv();
    restoreEnv = applyWfmStubEnv(stub.baseUrl, DEADLINE_ENV);
    stub.setMode("stall-body-schedule");

    const call = mountRouter("trainer");
    const res = await callWithoutHanging(
      call,
      "/jadwal-shifting?date=2026-09-28",
    );

    expect(
      stub.stalls.schedule,
      "stub tidak sempat membalas header /rest/v1/wfm_schedules",
    ).toBeGreaterThan(0);
    expect(
      res.elapsedMs,
      "adapter gagal sebelum deadline, jadi ini bukan bukti deadline body",
    ).toBeGreaterThanOrEqual(MIN_WAIT_MS);

    expect(res.status, JSON.stringify(res.body)).toBe(502);
    expect(res.body.error?.code).toBe("WFM_UNAVAILABLE");
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('"rows"');

    await stub.close();
    expect(
      stub.openSocketCount(),
      "socket yang menggantung tidak ditutup di teardown",
    ).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Log bebas rahasia — teks upstream TIDAK BOLEH masuk log, hanya kode + host
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Log bebas rahasia", () => {
  test("teks error upstream tidak bocor ke respons maupun ke log yang tertangkap", async () => {
    // `error-sentinel` membalas body PostgREST sintetis yang memantulkan key
    // palsu dan host; adapter tidak boleh meneruskan atau mencatat body itu.
    stub.setMode("error-sentinel");
    const call = mountRouter("trainer");
    const logs = captureConsole();

    let res: { status: number; body: Envelope } | undefined;
    try {
      res = await call("/jadwal-shifting?date=2026-09-28");
    } finally {
      logs.restore();
    }

    // 1. Respons browser: sudah dijamin `PUBLIC_MESSAGES`, tapi dibuktikan lagi
    //    bersama sentinel supaya ini bukan asumsi.
    const serializedResponse = JSON.stringify(res.body);
    expect(
      serializedResponse,
      "sentinel bocor ke respons browser",
    ).not.toContain(UPSTREAM_ERROR_SENTINEL);
    expect(res.body.error?.code).toBe("WFM_UNAVAILABLE");

    // 2. Log server: ini bagian yang bocor sebelum gate ini. Teks upstream
    //    adalah input tak tepercaya, jadi tidak boleh dicatat sama sekali —
    //    memotong 300 karakter tetap membocorkan.
    const logged = logs.lines.join("\n");
    expect(logged, "sentinel bocor ke log server").not.toContain(
      UPSTREAM_ERROR_SENTINEL,
    );
    for (const fragment of ["stub-only-secret", "sentinel.invalid"]) {
      expect(logged, `log membocorkan ${fragment}`).not.toContain(fragment);
    }

    // 3. Yang WAJIB tetap ada: kode dan host yang sudah direduksi. Redaksi
    //    yang menghapus semua konteks membuat kegagalan tidak bisa
    //    diinvestigasi, jadi ini bukan "hapus detail lalu selesai".
    expect(logged, "kode kegagalan tidak lagi tercatat").toContain(
      "WFM_UNAVAILABLE",
    );
    expect(logged, "host yang direduksi tidak lagi tercatat").toContain(
      "127.0.0.1",
    );
    expect(logged, "penanda konfigurasi tidak lagi tercatat").toContain(
      "config=",
    );
  });

  test("kegagalan tiap fase tetap mencatat kode dan host yang direduksi", async () => {
    for (const [mode, code] of [
      ["unauthorized", "WFM_UNAUTHORIZED"],
      ["server-error", "WFM_UNAVAILABLE"],
      ["error-sentinel", "WFM_UNAVAILABLE"],
      ["not-json", "WFM_INVALID_RESPONSE"],
      ["malformed", "WFM_INVALID_RESPONSE"],
    ] as const) {
      stub.setMode(mode);
      const call = mountRouter("trainer");
      const logs = captureConsole();
      try {
        await call("/jadwal-shifting?date=2026-09-28");
      } finally {
        logs.restore();
      }
      const logged = logs.lines.join("\n");
      expect(logged, `mode ${mode} tidak mencatat kode`).toContain(code);
      expect(logged, `mode ${mode} tidak mencatat host`).toContain("127.0.0.1");
      expect(
        logged,
        `mode ${mode} mencatat query string upstream`,
      ).not.toContain("select=");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Validasi tanggal dan batas
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Validasi tanggal", () => {
  const rejected = [
    "bukan-tanggal",
    "2026-9-8",
    "28-09-2026",
    "2026-13-01",
    "2026-02-30",
    "2026-09-28T00:00:00Z",
    "2026-09-28; DROP TABLE",
  ];

  for (const value of rejected) {
    test(`tanggal ${JSON.stringify(value)} ditolak 400 tanpa menyentuh upstream`, async () => {
      const call = mountRouter("trainer");
      const res = await call(
        `/jadwal-shifting?date=${encodeURIComponent(value)}`,
      );

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
      expect(stub.calls.schedules, "validasi harus sebelum query").toEqual([]);
    });
  }

  test("tanggal di luar rentang yang diizinkan ditolak", async () => {
    restoreEnv();
    restoreEnv = applyWfmStubEnv(stub.baseUrl, {
      WFM_SCHEDULE_MAX_DATE_OFFSET_DAYS: "7",
    });
    const call = mountRouter("trainer");

    // 400 hari ke depan jauh di luar jendela ±7 hari dari "hari ini".
    const far = new Date();
    far.setUTCDate(far.getUTCDate() + 400);
    const res = await call(
      `/jadwal-shifting?date=${far.toISOString().slice(0, 10)}`,
    );

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(stub.calls.schedules).toEqual([]);
  });

  test("tanpa parameter tanggal DAN tanpa zona waktu, gagal tertutup tanpa menyentuh upstream", async () => {
    // Tidak ada zona waktu resmi WFM yang terkonfirmasi, jadi backend tidak boleh
    // menebak "hari ini" dari asumsi sendiri. Tanpa `WFM_SCHEDULE_TIMEZONE` dan
    // tanpa `date` eksplisit, pilihan tanggal tidak punya dasar.
    const call = mountRouter("trainer");
    const res = await call("/jadwal-shifting");

    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("WFM_NOT_CONFIGURED");
    expect(res.body.data).toBeUndefined();
    expect(
      stub.calls,
      "kegagalan konfigurasi harus sebelum ada kontak upstream",
    ).toEqual({ schedules: [] });
  });

  test("zona waktu yang tidak dikenal juga gagal tertutup, tidak diganti default", async () => {
    // Hanya nilai yang benar-benar tidak dikenal. Spasi excess DITOLOL karena
    // semua env WFM di-trim, dan `utc` lowercase valid (IANA case-insensitive).
    for (const invalid of [
      "Not/AZone",
      "GMT+25",
      "Mars/Phobos",
      "2026-09-28",
      "Asia/Jakarta extra",
    ]) {
      restoreEnv();
      restoreEnv = applyWfmStubEnv(stub.baseUrl, {
        WFM_SCHEDULE_TIMEZONE: invalid,
      });

      const call = mountRouter("trainer");
      const res = await call("/jadwal-shifting");

      expect(res.status, `timezone ${JSON.stringify(invalid)}`).toBe(503);
      expect(res.body.error?.code).toBe("WFM_NOT_CONFIGURED");
      expect(res.body.data).toBeUndefined();
      expect(
        stub.calls,
        `timezone ${JSON.stringify(invalid)} menyentuh upstream`,
      ).toEqual({ schedules: [] });
    }
  });

  test("tanggal eksplisit tidak memerlukan zona waktu sama sekali", async () => {
    // Harness sengaja MENGHAPUS `WFM_SCHEDULE_TIMEZONE`, jadi test ini memakai
    // kondisi "zona waktu tidak dikonfigurasi" yang sesungguhnya.
    for (const timezone of [undefined, "Not/AZone"]) {
      restoreEnv();
      restoreEnv = applyWfmStubEnv(stub.baseUrl, {
        ...(timezone ? { WFM_SCHEDULE_TIMEZONE: timezone } : {}),
      });

      const call = mountRouter("trainer");
      const res = await call("/jadwal-shifting?date=2026-09-28");
      const data = res.body.data as Record<string, unknown> | undefined;

      expect(res.status, `timezone ${JSON.stringify(timezone)}`).toBe(200);
      expect(data?.date).toBe("2026-09-28");
      expect(stub.calls.schedules.at(-1)?.date).toBe("eq.2026-09-28");
    }
  });

  test("tanpa parameter tanggal, backend memakai zona waktu yang dikonfigurasi", async () => {
    // Data uji arbitrer untuk membuktikan timezone dipakai; bukan klaim zona
    // resmi WFM. Lihat gate di `docs/deployment.md`.
    restoreEnv();
    restoreEnv = applyWfmStubEnv(stub.baseUrl, {
      WFM_SCHEDULE_TIMEZONE: "UTC",
    });
    const call = mountRouter("trainer");
    const res = await call("/jadwal-shifting");

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    // Tanggal efektif yang DIQUERY harus dikembalikan supaya UI tidak pernah
    // menampilkan tanggal berbeda dari yang benar-benar diambil.
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stub.calls.schedules.at(-1)?.date).toBe(`eq.${data.date}`);
  });

  test("hasil yang melebihi batas ditandai terpotong, bukan dipotong diam-diam", async () => {
    restoreEnv();
    restoreEnv = applyWfmStubEnv(stub.baseUrl, { WFM_SCHEDULE_MAX_ROWS: "2" });
    const call = mountRouter("trainer");

    const res = await call("/jadwal-shifting?date=2026-09-28");
    const data = res.body.data as { rows: unknown[]; truncated: boolean };

    expect(data.rows.length).toBe(2);
    expect(data.truncated).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gate konfigurasi runtime produksi
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Konfigurasi runtime", () => {
  test("tanpa env WFM, endpoint gagal tertutup dan tidak pernah diam-diam kosong", async () => {
    for (const key of [
      "WFM_SCHEDULE_SUPABASE_URL",
      "WFM_SCHEDULE_SUPABASE_KEY",
      "WFM_SCHEDULE_API_ALLOWED_ORIGINS",
    ]) {
      restoreEnv();
      restoreEnv = applyWfmStubEnv(stub.baseUrl, { [key]: "" });

      const call = mountRouter("trainer");
      const res = await call("/jadwal-shifting?date=2026-09-28");

      expect(res.status, `env ${key} kosong`).toBe(503);
      expect(res.body.error?.code).toBe("WFM_NOT_CONFIGURED");
      expect(res.body.data).toBeUndefined();
      expect(stub.calls.schedules).toEqual([]);
    }
  });

  test("API key tidak pernah muncul di respons maupun pesan error", async () => {
    stub.setMode("unauthorized");
    const call = mountRouter("trainer");
    const res = await call("/jadwal-shifting?date=2026-09-28");

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("stub-only-key-not-a-secret");
    expect(serialized).not.toContain("Bearer ");
  });

  test("teks error upstream tidak diteruskan ke browser", async () => {
    // Body error PostgREST adalah input pihak ketiga. Hanya kode + kalimat
    // publik yang boleh sampai ke browser.
    stub.setMode("error-sentinel");
    const call = mountRouter("trainer");
    const res = await call("/jadwal-shifting?date=2026-09-28");

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe("WFM_UNAVAILABLE");
    const message = res.body.error?.message ?? "";
    expect(message, "pesan upstream mentah bocor ke respons").not.toContain(
      "Error:",
    );
    expect(message).not.toContain("stub");
    // Kalimat publik harus benar-benar berguna, bukan sekadar placeholder.
    expect(message.length).toBeGreaterThan(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sifat read-only
// ═══════════════════════════════════════════════════════════════════════════

test("endpoint ini read-only: tidak ada operasi tulis", async () => {
  const call = mountRouter("admin");

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await call("/jadwal-shifting", { method });
    expect(
      res.status,
      `${method} seharusnya tidak dilayani (dapat ${res.status})`,
    ).toBe(404);
  }

  // Dan adapter sendiri hanya pernah issued GET ke upstream.
  await call("/jadwal-shifting?date=2026-09-28");
  for (const q of stub.calls.schedules) {
    expect(q.method, `upstream/query dipanggil dengan ${q.method}`).toBe("GET");
    expect(q.path).toBe("/rest/v1/wfm_schedules");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Kalender bulan — rentang baca-saja maksimal 31 hari per permintaan
// ═══════════════════════════════════════════════════════════════════════════

/** Bulan berjalan menurut jam runtime test; selalu berada di dalam jendela. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Batas hari pertama/terakhir sebuah bulan, dihitung dari `YYYY-MM`. */
function monthBounds(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

test.describe("Kalender bulan", () => {
  for (const role of ["admin", "trainer"]) {
    test(`role ${role} boleh membaca jadwal satu bulan`, async () => {
      const month = currentMonth();
      const call = mountRouter(role);
      const res = await call(`/jadwal-shifting/month?month=${month}`);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.success).toBe(true);
      expect(
        stub.calls.schedules.length,
        "query read-only harus terjadi",
      ).toBeGreaterThan(0);
      const last = stub.calls.schedules.at(-1)!;
      expect(last.apiKey).toBe("stub-only-key-not-a-secret");
      expect(last.authorization).toBe("Bearer stub-only-key-not-a-secret");
    });
  }

  for (const role of ["leader", "agent", "operator"]) {
    test(`role ${role} ditolak 403 sebelum upstream disentuh`, async () => {
      const call = mountRouter(role);
      const res = await call(`/jadwal-shifting/month?month=${currentMonth()}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("FORBIDDEN");
      expect(stub.calls, "kalender tidak boleh menyentuh upstream").toEqual({
        schedules: [],
      });
    });
  }

  test("query upstream dibatasi tepat satu bulan, satu tabel, kolom minimum", async () => {
    restoreEnv();
    restoreEnv = applyWfmStubEnv(stub.baseUrl, {
      WFM_SCHEDULE_MAX_MONTH_ROWS: "400",
    });
    const month = currentMonth();
    const { from, to } = monthBounds(month);
    const call = mountRouter("admin");
    const res = await call(`/jadwal-shifting/month?month=${month}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const q = stub.calls.schedules.at(-1)!;

    expect(q.method, "kalender harus GET").toBe("GET");
    expect(q.path).toBe("/rest/v1/wfm_schedules");
    // Dua operator pada kolom yang sama = rentang; tidak ada filter lain.
    expect(q.dates).toEqual([`gte.${from}`, `lte.${to}`]);
    expect((q.select ?? "").split(",").sort()).toEqual(
      ["channel", "date", "nama", "shift", "tl"].sort(),
    );
    expect(q.limit).toBe("401");
    expect(q.search).not.toMatch(/users|reasons|swaps|lightweight/i);

    const data = res.body.data as Record<string, unknown>;
    expect(data.month).toBe(month);
    expect(data.from).toBe(from);
    expect(data.to).toBe(to);
  });

  test("respons bulan hanya berisi field yang disetujui", async () => {
    const month = currentMonth();
    const call = mountRouter("trainer");
    const res = await call(`/jadwal-shifting/month?month=${month}`);

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual([
      "asOf",
      "channels",
      "from",
      "month",
      "rows",
      "to",
      "total",
      "truncated",
    ]);

    const rows = data.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Tanpa `activities` dan `shiftPrev`: kalender tidak membutuhkannya,
      // jadi keduanya tidak boleh ikut terkirim ke browser sama sekali.
      expect(Object.keys(row).sort()).toEqual([
        "channel",
        "date",
        "nama",
        "shift",
        "tl",
      ]);
      for (const key of Object.keys(row)) {
        expect(
          FORBIDDEN_RESPONSE_KEYS.map((k) => k.toLowerCase()),
          `field terlarang ${key} ikut di respons`,
        ).not.toContain(key.toLowerCase());
      }
    }

    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of [
      "sb_publishable",
      "apikey",
      "api_key",
      "password",
    ]) {
      expect(serialized, `payload membocorkan ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  const rejectedMonths = [
    "bukan-bulan",
    "2026-13",
    "2026-00",
    "2026-9",
    "09-2026",
    "2026-09-28",
    "2026/09",
    "2026-09-28T00:00:00Z",
    "2026-09; DROP TABLE",
  ];

  for (const value of rejectedMonths) {
    test(`bulan ${JSON.stringify(value)} ditolak 400 tanpa menyentuh upstream`, async () => {
      const call = mountRouter("trainer");
      const res = await call(
        `/jadwal-shifting/month?month=${encodeURIComponent(value)}`,
      );

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
      expect(stub.calls.schedules, "validasi harus sebelum query").toEqual([]);
    });
  }

  test("bulan di luar rentang yang diizinkan ditolak", async () => {
    restoreEnv();
    restoreEnv = applyWfmStubEnv(stub.baseUrl, {
      WFM_SCHEDULE_MAX_DATE_OFFSET_DAYS: "1",
    });
    const call = mountRouter("trainer");
    // Enam bulan ke depan jauh di luar jendela ±1 hari dari "hari ini".
    const now = new Date();
    const far = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 1),
    );
    const res = await call(
      `/jadwal-shifting/month?month=${far.toISOString().slice(0, 7)}`,
    );

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(stub.calls.schedules).toEqual([]);
  });

  test("hasil bulan yang melebihi batas ditandai terpotong", async () => {
    restoreEnv();
    restoreEnv = applyWfmStubEnv(stub.baseUrl, {
      WFM_SCHEDULE_MAX_MONTH_ROWS: "2",
    });
    const call = mountRouter("trainer");
    const res = await call(`/jadwal-shifting/month?month=${currentMonth()}`);
    const data = res.body.data as { rows: unknown[]; truncated: boolean };

    expect(data.rows.length).toBe(2);
    expect(data.truncated).toBe(true);
  });

  test("upstream gagal tidak pernah menjadi kalender kosong", async () => {
    stub.setMode("unauthorized");
    const call = mountRouter("trainer");
    const res = await call(`/jadwal-shifting/month?month=${currentMonth()}`);

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe("WFM_UNAUTHORIZED");
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('"rows"');
  });

  test("tanpa parameter bulan DAN tanpa zona waktu, gagal tertutup tanpa menyentuh upstream", async () => {
    const call = mountRouter("trainer");
    const res = await call("/jadwal-shifting/month");

    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("WFM_NOT_CONFIGURED");
    expect(
      stub.calls,
      "kegagalan konfigurasi harus sebelum kontak upstream",
    ).toEqual({ schedules: [] });
  });

  test("kalender juga hanya-baca: tidak ada operasi tulis", async () => {
    const call = mountRouter("admin");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await call("/jadwal-shifting/month", { method });
      expect(
        res.status,
        `${method} seharusnya tidak dilayani (dapat ${res.status})`,
      ).toBe(404);
    }
  });
});
