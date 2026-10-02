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

const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";

/** Endpoint `/api` yang boleh menyentuh proxy dev. Selain ini → abort. */
const MOCKED_API: RegExp[] = [
  /^\/api\/v1\/me\/access-status$/,
  /^\/api\/v1\/sidak\/heatmap$/,
];

type Behavior =
  | { kind: "data"; counts?: Record<string, number>; missing?: number }
  | { kind: "empty" }
  | { kind: "error"; status: number }
  | { kind: "slow"; delayMs: number }
  | { kind: "stale" };

type Captured = { mode: string; year: string; service_type: string | null };

const captured: Captured[] = [];
let behaviour: Behavior = { kind: "data" };

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
          sidak: { status: "none", module: "sidak", created_at: null },
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
      if (mode === "agent") await new Promise((r) => setTimeout(r, 1500));
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
    if (behaviour.kind === "slow") {
      const { delayMs } = behaviour;
      await new Promise((r) => setTimeout(r, delayMs));
    }
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
    const missingCard = page.getByText("Tanggal belum diisi").locator("..");
    await expect(missingCard).toContainText("7");
    await expect(missingCard).toContainText(/Seluruh periode/);
  });

  test("filter mode, tahun, dan layanan benar-benar dikirim", async ({ page }) => {
    await open(page, "trainer");
    await page.getByRole("button", { name: "QA — Tanggal sampel" }).click();
    await expect.poll(() => captured.at(-1)?.mode).toBe("qa");

    await page.locator("#heatmap-year").selectOption("2025");
    await expect.poll(() => captured.at(-1)?.year).toBe("2025");

    await page.locator("#heatmap-service").selectOption("slik");
    await expect.poll(() => captured.at(-1)?.service_type).toBe("slik");
  });

  test("tahun tanpa temuan menampilkan kondisi kosong, bukan error", async ({ page }) => {
    behaviour = { kind: "empty" };
    await open(page, "trainer");

    await expect(page.getByText(/Tidak ada temuan tercatat pada tahun 2026/)).toBeVisible();
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
    behaviour = { kind: "slow", delayMs: 1200 };
    await open(page, "trainer");

    await expect(page.getByTestId("heatmap-loading")).toBeVisible();
    await expect(page.getByLabel(/Kalender Januari 2026/)).toBeVisible();
  });

  test("tanggal bisa dipilih lewat keyboard dan menampilkan jumlahnya", async ({ page }) => {
    behaviour = { kind: "data", counts: { "2026-01-09": 12 } };
    await open(page, "trainer");

    const day = page.getByRole("button", { name: "09/01/2026: 12 temuan" });
    await day.focus();
    await expect(day).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("heatmap-selected-day")).toContainText("9 Januari 2026");
    await expect(page.getByText("12 temuan")).toBeVisible();
  });

  test("legenda selalu berpasangan dengan warna", async ({ page }) => {
    await open(page, "trainer");
    const legend = page.getByText("Intensitas temuan");
    await expect(legend).toBeVisible();
    for (const label of ["0", "1–2", "3–5", "6–10", "11+"]) {
      await expect(page.getByRole("list").getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("role leader tidak bisa membuka halaman heatmap", async ({ page }) => {
    await open(page, "leader");
    await expect(page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ })).toHaveCount(0);
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
    behaviour = { kind: "stale" };
    await open(page, "trainer");

    // Filter `qa` selesai lebih dulu; respons `agent` yang lambat tiba setelahnya.
    await page.getByRole("button", { name: "QA — Tanggal sampel" }).click();
    await expect(
      page.getByRole("button", { name: "04/04/2026: 9 temuan" }),
    ).toBeVisible();

    // Tunggu lebih lama dari delay respons basi, lalu pastikan ia tidak menimpa.
    await page.waitForTimeout(2000);
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