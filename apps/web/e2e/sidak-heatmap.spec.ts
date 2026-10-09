/**
 * E2E halaman Heatmap Ketidaksesuaian (`/sidak/heatmap`).
 *
 * Backend `/api` di-mock lewat allowlist fail-closed, jadi spec ini tidak
 * menyentuh database mana pun. Yang diuji adalah perilaku HALAMAN: navigasi,
 * filter yang benar-benar terkirim, state loading/error/kosong, keterlihatan
 * informasi tanggal tanpa bergantung pada warna, dan penolakan role.
 */

import { expect, test, type Page } from "@playwright/test";
import { mockSupabaseAuth } from "./helpers/mockAuth";
import { createResponseGate } from "./helpers/responseGate";
import { pickSelect } from "./helpers/pickSelect";
import { E2E_SUPABASE_URL } from "./helpers/e2eTargets";

const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = E2E_SUPABASE_URL;

/** Endpoint `/api` yang boleh menyentuh proxy dev. Selain ini → abort. */
const MOCKED_API: RegExp[] = [
  /^\/api\/v1\/me\/access-status$/,
  /^\/api\/v1\/sidak\/heatmap$/,
];

type Behavior =
  | { kind: "data"; counts?: Record<string, number>; missing?: number }
  | { kind: "empty" }
  | { kind: "error"; status: number }
  /** Respons ditahan sampai `until` resolve, supaya state loading bisa diamati. */
  | { kind: "held"; until: Promise<void> }
  /** Respons `agent` ditahan sampai `agentUntil` resolve; `qa` langsung dijawab. */
  | { kind: "stale"; agentUntil: Promise<void> };

type Captured = {
  mode: string;
  year: string;
  service_type: string | null;
  count_by: string | null;
};

const captured: Captured[] = [];
let behaviour: Behavior = { kind: "data" };
/** Status modul SIDAK untuk leader pada `/me/access-status`. */
let sidakAccess: "none" | "approved" = "none";

/**
 * Kalender penuh satu tahun, dengan hitungan sesuai `counts`.
 *
 * TIDAK boleh berisi assertion: helper ini dipanggil di dalam route handler, dan
 * assertion yang gagal di sana membuat route tidak pernah fulfilled sehingga
 * halaman hang di status loading — gejalanya jauh dari penyebabnya.
 */
function buildYear(year: number, counts: Record<string, number>) {
  const days: Array<{ date: string; count: number }> = [];
  for (let month = 1; month <= 12; month++) {
    const perMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= perMonth; day++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({ date: iso, count: counts[iso] ?? 0 });
    }
  }
  return days;
}

function payload() {
  const year = Number(captured[captured.length - 1]?.year ?? "2026");
  const mode = (captured[captured.length - 1]?.mode ?? "agent") as
    | "agent"
    | "qa";
  if (behaviour.kind === "empty") {
    return { days: buildYear(year, {}), totalFindings: 0, missingDateFindingsAllPeriods: 0, mode, year, serviceType: null, dateBasis: mode === "agent" ? "tanggal_layanan" : "tanggal_sampel" };
  }
  const b = behaviour as Extract<Behavior, { kind: "data" }>;
  const days = buildYear(year, b.counts ?? {});
  return {
    days,
    totalFindings: days.reduce((s, d) => s + d.count, 0),
    missingDateFindingsAllPeriods: b.missing ?? 0,
    mode,
    year,
    serviceType: captured[captured.length - 1]?.service_type ?? null,
    dateBasis: mode === "agent" ? "tanggal_layanan" : "tanggal_sampel",
  };
}

function toJson(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function installMocks(page: Page, role: string) {
  await mockSupabaseAuth(page, { role });

  await page.route(`${APP_ORIGIN}/api/v1/me/access-status*`, (route) =>
    route.fulfill(
      toJson({
        success: true,
        data: {
          sidak: { status: sidakAccess, module: "sidak", created_at: null },
          ktp: { status: "none", module: "ktp", created_at: null },
        },
      }),
    ),
  );

  await page.route(`${APP_ORIGIN}/api/v1/sidak/heatmap?*`, async (route) => {
    const url = new URL(route.request().url());
    captured.push({
      mode: url.searchParams.get("mode") ?? "",
      year: url.searchParams.get("year") ?? "",
      service_type: url.searchParams.get("service_type"),
      count_by: url.searchParams.get("count_by"),
    });

    if (behaviour.kind === "error") {
      await route.fulfill(
        toJson(
          {
            success: false,
            error: { code: "HEATMAP_ERROR", message: "Gagal memuat data heatmap." },
          },
          behaviour.status,
        ),
      );
      return;
    }
    if (behaviour.kind === "stale") {
      // Respons `agent` sengaja lambat; `qa` cepat. Halaman tidak boleh
      // membiarkan respons `agent` yang basi menimpa filter `qa` yang aktif.
      const mode = (url.searchParams.get("mode") ?? "agent") as "agent" | "qa";
      const year = Number(url.searchParams.get("year") ?? "2026");
      if (mode === "agent") await behaviour.agentUntil;
      const counts: Record<string, number> =
        mode === "agent" ? { "2026-03-03": 5 } : { "2026-04-04": 9 };
      const days = buildYear(year, counts);
      await route.fulfill(
        toJson({
          success: true,
          data: {
            days,
            totalFindings: days.reduce((s, d) => s + d.count, 0),
            missingDateFindingsAllPeriods: 0,
            mode,
            year,
            serviceType: null,
            dateBasis: mode === "agent" ? "tanggal_layanan" : "tanggal_sampel",
          },
        }),
      );
      return;
    }
    if (behaviour.kind === "held") await behaviour.until;
    await route.fulfill(toJson({ success: true, data: payload() }));
  });

  // Guard fail-closed: hanya host dev + endpoint yang di-mock.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const origin = route.request().url();
    if (origin.startsWith(SUPABASE_ORIGIN)) return route.fallback();
    const isHttp = ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
    if (!isHttp) return route.fallback();
    if (url.hostname === APP_URL.hostname && url.port === APP_URL.port) {
      if (
        url.pathname.startsWith("/api") &&
        !MOCKED_API.some((re) => re.test(url.pathname))
      ) {
        await route.abort("blockedbyclient");
        return;
      }
      return route.fallback();
    }
    if (["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
      return route.fallback();
    }
    await route.abort("blockedbyclient");
  });
}

async function open(page: Page, role = "trainer") {
  await installMocks(page, role);
  await page.goto("/sidak/heatmap");
}

test.beforeEach(() => {
  captured.length = 0;
  behaviour = { kind: "data", counts: {}, missing: 0 };
  sidakAccess = "none";
});

test.describe("Halaman Heatmap", () => {
  test("trainer melihat kalender penuh untuk tahun default", async ({ page }) => {
    behaviour = { kind: "data", counts: { "2026-01-05": 3 }, missing: 7 };
    await open(page, "trainer");

    await expect(page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ })).toBeVisible();
    await expect(page.getByLabel(/Kalender Januari 2026/)).toBeVisible();
    await expect(page.getByLabel(/Kalender Desember 2026/)).toBeVisible();

    // Jumlah pada hari terbaca sebagai TEKS, bukan hanya warna.
    await expect(page.getByRole("button", { name: "05/01/2026: 3 temuan" })).toBeVisible();
    await expect(page.getByRole("button", { name: "01/01/2026: 0 temuan" })).toBeVisible();

    // Metadata tanggal belum diisi menyebut lingkupnya. Angka diskop ke kartu
    // itu — `getByText("7")` di seluruh halaman ikut cocok nomor tanggal.
    const missingCard = page.getByText("Temuan tanpa tanggal").locator("..");
    await expect(missingCard).toContainText("7");
    await expect(missingCard).toContainText(/Dari semua tahun/);
    await expect(missingCard).toContainText("tidak tampil di kalender");
  });

  test("filter mode, tahun, dan layanan benar-benar dikirim", async ({ page }) => {
    await open(page, "trainer");
    await page.getByRole("button", { name: "QA — Tanggal sampel" }).click();
    await expect.poll(() => captured.at(-1)?.mode).toBe("qa");

    await pickSelect(page, "Tahun", "2025");
    await expect.poll(() => captured.at(-1)?.year).toBe("2025");

    await pickSelect(page, "Layanan", "slik");
    await expect.poll(() => captured.at(-1)?.service_type).toBe("slik");
  });

  test("toggle satuan mengirim count_by", async ({ page }) => {
    await open(page, "trainer");
    await expect.poll(() => captured.at(-1)?.count_by).toBe("parameter");

    await page.getByRole("button", { name: "Tiket", exact: true }).click();
    await expect.poll(() => captured.at(-1)?.count_by).toBe("tiket");

    await page.getByRole("button", { name: "Parameter", exact: true }).click();
    await expect.poll(() => captured.at(-1)?.count_by).toBe("parameter");
  });

  test("tahun tanpa temuan menampilkan kondisi kosong, bukan error", async ({ page }) => {
    behaviour = { kind: "empty" };
    await open(page, "trainer");

    await expect(page.getByText("Belum ada temuan bertanggal di 2026 untuk filter ini.")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("error ditampilkan dan ada tombol coba lagi", async ({ page }) => {
    behaviour = { kind: "error", status: 500 };
    await open(page, "trainer");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Gagal memuat heatmap/);
    // Kalender TIDAK boleh tampil seolah-olah tidak ada temuan.
    await expect(page.getByLabel(/Kalender Januari/)).toHaveCount(0);

    behaviour = { kind: "data", counts: {} };
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.getByLabel(/Kalender Januari 2026/)).toBeVisible();
  });

  test("loading terlihat sebelum data arrives", async ({ page }) => {
    const gate = createResponseGate();
    behaviour = { kind: "held", until: gate.promise };
    await open(page, "trainer");

    // Respons ditahan, jadi loading pasti terlihat dan kalender belum ada.
    await expect(page.getByTestId("heatmap-loading")).toBeVisible();
    await expect(page.getByLabel(/Kalender Januari 2026/)).toHaveCount(0);

    gate.release();
    await expect(page.getByLabel(/Kalender Januari 2026/)).toBeVisible();
    await expect(page.getByTestId("heatmap-loading")).toHaveCount(0);
  });

  test("tanggal bisa dipilih lewat keyboard dan menampilkan jumlahnya", async ({ page }) => {
    behaviour = { kind: "data", counts: { "2026-01-09": 12 } };
    await open(page, "trainer");

    const day = page.getByRole("button", { name: "09/01/2026: 12 temuan" });
    await day.focus();
    await expect(day).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("heatmap-selected-day")).toContainText("9 Januari 2026");
    // Scope ke kartu "Tanggal dipilih": kartu Insight kini juga memuat teks
    // "N temuan", jadi pencarian global menjadi ambigu.
    await expect(
      page
        .getByTestId("heatmap-selected-day")
        .locator("..")
        .getByText("12 temuan"),
    ).toBeVisible();
  });

  test("legenda intensitas mengikuti sebaran data, bukan ambang tetap", async ({ page }) => {
    // Volume rendah. Ambang lama akan menampilkan bucket "6–10" dan "11+"
    // yang kosong, sehingga warna tidak lagi menjelaskan perbedaan antar hari.
    behaviour = {
      kind: "data",
      counts: {
        "2026-01-01": 1,
        "2026-01-02": 1,
        "2026-01-03": 2,
        "2026-01-04": 3,
        "2026-01-05": 3,
      },
      missing: 0,
    };
    await open(page, "trainer");

    await expect(page.getByText("Intensitas temuan")).toBeVisible();
    const legendList = page
      .getByText("Intensitas temuan")
      .locator("..")
      .getByRole("list");
    await expect(legendList.getByText("0", { exact: true })).toBeVisible();

    // Hari bernilai maksimum (3) harus punya bucket positif, dan label itu ada
    // di legenda — legenda diturunkan dari data, bukan dari ambang tetap.
    const maxDay = page.getByRole("button", { name: "05/01/2026: 3 temuan" });
    await expect(maxDay).toBeVisible();
    const maxBucket = await maxDay.getAttribute("data-intensity");
    expect(maxBucket).not.toBe("0");
    await expect(
      legendList.getByText(maxBucket ?? "", { exact: true }),
    ).toBeVisible();

    // Tidak ada bucket di atas nilai maksimum data (3) — itu bucket mati.
    await expect(legendList.getByText("6–10", { exact: true })).toHaveCount(0);
    await expect(legendList.getByText("11+", { exact: true })).toHaveCount(0);
  });

  test("setiap bucket legenda terisi dan mencakup rentang data", async ({ page }) => {
    // 12 hari aktif berjumlah 1..12: kuantil harus menyebar, bukan menumpuk.
    const counts: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) {
      counts[`2026-01-${String(i).padStart(2, "0")}`] = i;
    }
    behaviour = { kind: "data", counts, missing: 0 };
    await open(page, "trainer");
    // Tunggu data benar-benar ter-render sebelum membaca bucket hari.
    await expect(page.getByLabel(/Kalender Januari 2026/)).toBeVisible();

    const labels = await page
      .locator("[data-intensity]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-intensity") ?? ""),
      );
    const positive = labels.filter((label) => label !== "0");
    const distinct = [...new Set(positive)].sort();

    // Variasi 1..12 harus menghasilkan lebih dari satu bucket positif.
    expect(distinct.length).toBeGreaterThanOrEqual(4);
    // Tidak ada bucket positif yang kosong: itu tanda ambang tidak representatif.
    for (const label of distinct) {
      expect(positive.filter((item) => item === label).length).toBeGreaterThan(0);
    }

    // Legenda dan hari memakai bucket yang sama (satu sumber kebenaran).
    const legendList = page
      .getByText("Intensitas temuan")
      .locator("..")
      .getByRole("list");
    await expect(legendList.locator("li")).toHaveCount(distinct.length + 1); // + bucket 0

    // Hari dengan nilai maksimum harus berada di bucket teratas, bukan tengah.
    const maxDay = await page
      .getByRole("button", { name: "12/01/2026: 12 temuan" })
      .getAttribute("data-intensity");
    expect(maxDay).toMatch(/\+$/);
  });

  test("insight menjelaskan pola volume temuan dengan narasi yang kontekstual", async ({ page }) => {
    behaviour = {
      kind: "data",
      counts: {
        "2026-01-05": 3, // Senin
        "2026-01-06": 1, // Selasa
        "2026-01-12": 5, // Senin
        "2026-02-03": 2, // Selasa
      },
      missing: 0,
    };
    await open(page, "trainer");

    const insights = page.getByTestId("heatmap-insights");
    await expect(insights).toBeVisible();
    await expect(
      insights.getByRole("heading", { name: "Pola temuan ketidaksesuaian" }),
    ).toBeVisible();
    // Narasi merangkum, bukan mengulang kartu pertama.
    await expect(insights).toContainText(
      "Sepanjang 2026 tercatat 11 temuan pada 4 hari. Puncaknya 12 Januari 2026 dengan 5 temuan. Temuan paling banyak jatuh pada hari Senin dan bulan Januari.",
    );
    await expect(insights).toContainText(
      "Angka ini jumlah temuan, bukan tingkat kesalahan, karena belum dibandingkan dengan jumlah layanan atau audit. Hari atau bulan dengan audit lebih banyak wajar mencatat temuan lebih banyak.",
    );

    const busiestDay = page.getByTestId("insight-busiest-day");
    await expect(busiestDay).toContainText("Tanggal temuan terbanyak");
    await expect(busiestDay).toContainText("12 Januari 2026");
    await expect(busiestDay).toContainText("5 temuan");

    const quietestDay = page.getByTestId("insight-quietest-active-day");
    await expect(quietestDay).toContainText("Tanggal temuan paling sedikit");
    await expect(quietestDay).toContainText("6 Januari 2026");
    await expect(quietestDay).toContainText("1 temuan");
    await expect(quietestDay).toContainText("dihitung dari hari yang ada temuannya");

    const busiestWeekday = page.getByTestId("insight-busiest-weekday");
    await expect(busiestWeekday).toContainText("Hari terbanyak dalam sepekan");
    await expect(busiestWeekday).toContainText("Senin");
    await expect(busiestWeekday).toContainText("8 temuan dari semua hari Senin");

    const busiestMonth = page.getByTestId("insight-busiest-month");
    await expect(busiestMonth).toContainText("Bulan terbanyak");
    await expect(busiestMonth).toContainText("Januari");
    await expect(busiestMonth).toContainText("9 temuan");

    await expect(page.getByTestId("insight-active-days")).toContainText("Hari dengan temuan");
    await expect(page.getByTestId("insight-active-days")).toContainText("4 hari");
    await expect(page.getByTestId("insight-active-days")).toContainText("365");
    await expect(page.getByTestId("insight-average")).toContainText("Rata-rata harian");
    await expect(page.getByTestId("insight-average")).toContainText("2,8 temuan");
    await expect(page.getByTestId("insight-average")).toContainText("per hari yang ada temuannya");

    const range = page.getByTestId("insight-active-range");
    await expect(range).toContainText("Rentang temuan");
    await expect(range).toContainText("5 Jan");
    await expect(range).toContainText("3 Feb");
  });

  test("leader dengan modul SIDAK disetujui bisa membuka halaman heatmap", async ({ page }) => {
    sidakAccess = "approved";
    await open(page, "leader");
    await expect(
      page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ }),
    ).toBeVisible();
  });

  test("leader tanpa persetujuan modul diarahkan keluar dari heatmap", async ({ page }) => {
    sidakAccess = "none";
    await open(page, "leader");
    await expect(
      page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ }),
    ).toHaveCount(0);
  });

  test("admin diizinkan membuka halaman heatmap", async ({ page }) => {
    await open(page, "admin");
    await expect(
      page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ }),
    ).toBeVisible();
  });

  test("role agent ditolak membuka halaman heatmap", async ({ page }) => {
    await open(page, "agent");
    await expect(
      page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ }),
    ).toHaveCount(0);
  });

  test("kartu landing SIDAK membuka halaman heatmap", async ({ page }) => {
    await installMocks(page, "trainer");
    await page.goto("/sidak");

    const card = page.getByRole("link", { name: /Heatmap Ketidaksesuaian/ });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/sidak\/heatmap$/);
    await expect(
      page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ }),
    ).toBeVisible();
  });

  test("respons basi tidak menimpa filter yang aktif", async ({ page }) => {
    const agentGate = createResponseGate();
    behaviour = { kind: "stale", agentUntil: agentGate.promise };
    await open(page, "trainer");

    // Pastikan request `agent` benar-benar sudah dikirim dan sedang ditahan,
    // supaya test tidak lolos tanpa menguji jalur respons basi.
    // (Halaman bisa mengirim lebih dari satu request awal; semuanya ditahan.)
    await expect.poll(() => captured.length).toBeGreaterThan(0);
    expect(captured.every((c) => c.mode === "agent")).toBe(true);

    // Filter `qa` selesai lebih dulu; respons `agent` yang ditahan dilepas setelahnya.
    await page.getByRole("button", { name: "QA — Tanggal sampel" }).click();
    await expect(
      page.getByRole("button", { name: "04/04/2026: 9 temuan" }),
    ).toBeVisible();

    // Hitung respons `agent` yang benar-benar sampai ke halaman setelah dilepas.
    const heldAgentRequests = captured.filter((c) => c.mode === "agent").length;
    let deliveredAgentResponses = 0;
    page.on("response", (res) => {
      const url = new URL(res.url());
      if (
        url.pathname === "/api/v1/sidak/heatmap" &&
        url.searchParams.get("mode") === "agent"
      ) {
        deliveredAgentResponses += 1;
      }
    });
    agentGate.release();
    await expect
      .poll(() => deliveredAgentResponses)
      .toBe(heldAgentRequests);
    // Beri halaman satu siklus render penuh untuk memproses respons basi.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    await expect(
      page.getByRole("button", { name: "03/03/2026: 5 temuan" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "04/04/2026: 9 temuan" }),
    ).toBeVisible();
  });

  test("copy menyatakan volume temuan, bukan tingkat kesalahan", async ({ page }) => {
    await open(page, "trainer");
    await expect(page.getByText(/volume temuan, bukan tingkat kesalahan/)).toBeVisible();
  });
});