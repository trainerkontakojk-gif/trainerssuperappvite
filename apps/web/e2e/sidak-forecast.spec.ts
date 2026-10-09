/**
 * E2E halaman Forecast SIDAK (`/sidak/forecast`) setelah disusun ulang.
 *
 * Hermetic: semua `/api` dijawab `helpers/hermeticShell` (fail-closed) dengan
 * fixture `helpers/sidakForecastFixture`; target dibuktikan dev-server lokal.
 * Kontrak: `plans/markdown/sidak-forecast-redesign.md`.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
  type ShellAudit,
} from "./helpers/hermeticShell";
import {
  AGENT_FORECAST_PATH,
  SERVICE_FORECAST_PATH,
  agentForecast,
  dashboardData,
  forecastMocks,
} from "./helpers/sidakForecastFixture";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { findTextBelowFloor } from "./helpers/typographyFloor";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

type PostBody = Record<string, any>;

async function open(
  page: Page,
  mocks: readonly ApiMock[] = forecastMocks(),
  expectLanes = true,
): Promise<{ audit: ShellAudit; service: PostBody[]; agents: PostBody[] }> {
  const service: PostBody[] = [];
  const agents: PostBody[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const { pathname } = new URL(request.url());
    if (pathname === SERVICE_FORECAST_PATH) service.push(request.postDataJSON());
    if (pathname === AGENT_FORECAST_PATH) agents.push(request.postDataJSON());
  });
  const audit = await openHermeticShell(page, {
    path: "/sidak/forecast",
    apiMocks: mocks,
  });
  await expect(
    page.getByRole("heading", { level: 1, name: "Forecast" }),
  ).toBeVisible({ timeout: 20000 });
  if (expectLanes) {
    // Penanda netral (nama agen dari fixture), bukan kontrak baru, supaya tiap
    // test gagal pada asersinya sendiri.
    await expect(page.getByText("Rina Nama 1", { exact: true })).toBeVisible({
      timeout: 15000,
    });
  }
  return { audit, service, agents };
}

const trendSection = (page: Page) =>
  page.getByRole("region", { name: "Tren layanan", exact: true });
const prioritySection = (page: Page) =>
  page.getByRole("region", { name: "Prioritas agen", exact: true });
const lane = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const LANES = ["Membaik", "Memburuk", "Stabil/stagnan", "Pantauan"] as const;

async function top(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("elemen tidak punya bounding box");
  return box.y;
}

test.describe("Forecast SIDAK (hermetic)", () => {
  test("a urutan: judul, filter, Tren layanan, lalu Prioritas agen; tanpa blok lama dan header sticky", async ({
    page,
  }) => {
    const { audit } = await open(page);

    await expect(
      page.getByRole("heading", { level: 2, name: "Tren layanan", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Prioritas agen", exact: true }),
    ).toBeVisible();

    const ys = [
      await top(page.getByRole("heading", { level: 1, name: "Forecast" })),
      await top(page.getByRole("combobox", { name: "Periode proyeksi" })),
      await top(page.getByRole("heading", { level: 2, name: "Tren layanan", exact: true })),
      await top(page.getByRole("heading", { level: 2, name: "Prioritas agen", exact: true })),
    ];
    expect(ys).toEqual([...ys].sort((a, b) => a - b));

    for (const gone of ["Proyeksi temuan", "Kecukupan data", "Filter forecast"]) {
      await expect(page.getByRole("heading", { name: gone })).toHaveCount(0);
    }

    const stickyAncestors = await page
      .getByRole("heading", { level: 1, name: "Forecast" })
      .evaluate((h1) => {
        const found: string[] = [];
        for (let el: Element | null = h1; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          if (style.position === "sticky" || style.position === "fixed") {
            found.push(el.tagName);
          }
          if (style.backdropFilter && style.backdropFilter !== "none") {
            found.push(`${el.tagName}:backdrop`);
          }
        }
        return found;
      });
    // Layout aplikasi boleh punya sidebar fixed; header halaman tidak boleh.
    expect(stickyAncestors.filter((tag) => tag.includes("backdrop"))).toEqual([]);
    const headerSticky = await page
      .getByRole("heading", { level: 1, name: "Forecast" })
      .evaluate((h1) => {
        const header = h1.closest("header");
        return header ? getComputedStyle(header).position : "none";
      });
    expect(headerSticky).not.toBe("sticky");
    expectHermetic(audit);
  });

  test("b ringkasan proyeksi (arah, status data, metode) ada di dalam Tren layanan", async ({
    page,
  }) => {
    await open(page);
    const section = trendSection(page);

    await expect(section).toBeVisible();
    await expect(section.getByText("Membaik", { exact: true })).toBeVisible();
    await expect(section.getByText("Data terbaru siap dipakai.")).toBeVisible();
    const summary = section.getByTestId("forecast-summary");
    await expect(summary.getByText(/Regresi Linear/)).toBeVisible();
    await expect(summary.getByText(/3 titik data/)).toBeVisible();
    await expect(section).not.toContainText("linear-regression");
    await expect(section.getByTestId("forecast-insight-panel")).toBeVisible();
  });

  test("c jumlah status hanya di header lane; ada satu baris ringkas agen siap", async ({
    page,
  }) => {
    await open(page);

    await expect(
      prioritySection(page).getByText("7 agen siap diproyeksikan · periode 3 bulan"),
    ).toBeVisible();
    const counts = { Membaik: 2, Memburuk: 1, "Stabil/stagnan": 3, Pantauan: 1 };
    for (const name of LANES) {
      await expect(lane(page, name).getByText(`${counts[name]} agen`, { exact: true })).toBeVisible();
    }
    // Tidak ada metrik ringkasan ganda: "N agen" persis empat kali di halaman.
    await expect(page.getByText(/^\d+ agen$/)).toHaveCount(4);
    await expect(page.getByText(/agen siap diproyeksikan/i)).toHaveCount(1);
  });

  test("d istilah: Pantauan (bukan Watchlist), agen (bukan agent), satu ejaan Stabil/stagnan", async ({
    page,
  }) => {
    await open(page);

    const content = page.locator("main");
    await expect(content).not.toContainText(/watchlist/i);
    await expect(content).not.toContainText(/\bagents?\b/i);
    await expect(content).not.toContainText("Stabil/Stagnan");
    await expect(
      page.getByRole("heading", { level: 3, name: "Pantauan", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Stabil/stagnan", exact: true }),
    ).toBeVisible();

    const labels = await content.evaluate((root) =>
      Array.from(root.querySelectorAll("[aria-label]")).map(
        (el) => el.getAttribute("aria-label") ?? "",
      ),
    );
    expect(labels.filter((label) => /\bagents?\b|watchlist/i.test(label))).toEqual([]);
    await expect(
      page.getByRole("region", { name: "Daftar agen membaik" }),
    ).toBeVisible();
  });

  test("e kontrol seri: Total temuan toggle on/off, total + 1 parameter, batas 2 seri, grafik tidak pernah kosong", async ({
    page,
  }) => {
    await open(page);
    const section = trendSection(page);
    const total = section.getByRole("button", { name: "Total temuan" });
    const greeting = section.getByRole("button", { name: "Greeting" });
    const critical = section.getByRole("button", { name: "Critical" });
    const empati = section.getByRole("button", { name: "Empati" });
    const limitText = section.getByText(/Maksimal 2 data/);

    // Awal: hanya total; chip parameter selalu terlihat; batas belum tercapai.
    await expect(total).toHaveAttribute("aria-pressed", "true");
    for (const chip of [greeting, critical, empati]) {
      await expect(chip).toHaveAttribute("aria-pressed", "false");
      await expect(chip).toBeEnabled();
    }
    await expect(section.getByRole("tab")).toHaveCount(0);
    await expect(limitText).toHaveCount(0);

    // Total + 1 parameter bisa dipilih; seri ke-3 diblokir dengan teks batas.
    await greeting.click();
    await expect(greeting).toHaveAttribute("aria-pressed", "true");
    await expect(total).toHaveAttribute("aria-pressed", "true");
    await expect(critical).toBeDisabled();
    await expect(empati).toBeDisabled();
    await expect(limitText).toBeVisible();
    await expect(section.getByTestId("forecast-insight-panel")).toBeVisible();

    // Total dimatikan: 2 parameter diperbolehkan, total tidak bisa dinyalakan
    // lagi saat batas tercapai.
    await total.click();
    await expect(total).toHaveAttribute("aria-pressed", "false");
    await expect(limitText).toHaveCount(0);
    await expect(critical).toBeEnabled();
    await critical.click();
    await expect(critical).toHaveAttribute("aria-pressed", "true");
    await expect(limitText).toBeVisible();
    await expect(empati).toBeDisabled();
    await expect(total).toBeDisabled();
    await expect(section.getByTestId("forecast-insight-panel")).toHaveCount(0);

    // Melepas satu parameter membuka kembali total dan chip lain.
    await greeting.click();
    await expect(limitText).toHaveCount(0);
    await expect(total).toBeEnabled();
    await expect(empati).toBeEnabled();
  });

  test("e2 grafik tidak pernah kosong: mematikan total tanpa parameter menyalakan parameter pertama", async ({
    page,
  }) => {
    await open(page);
    const section = trendSection(page);
    const total = section.getByRole("button", { name: "Total temuan" });

    await total.click();
    await expect(total).toHaveAttribute("aria-pressed", "false");
    await expect(
      section.getByRole("button", { name: "Greeting" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(section.getByText(/Maksimal 2 data/)).toHaveCount(0);
  });

  test("f empat titik lane berwarna berbeda", async ({ page }) => {
    await open(page);

    const dots = page.getByTestId("forecast-lane-dot");
    await expect(dots).toHaveCount(4);
    const colors = await dots.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).backgroundColor),
    );
    expect(new Set(colors).size).toBe(4);
    const classes = await dots.evaluateAll((nodes) =>
      nodes.map((node) => node.className),
    );
    expect(new Set(classes).size).toBe(4);
  });

  test("g1 tanpa overflow horizontal di 320/390/768/1440", async ({ page }) => {
    await open(page);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole("heading", { level: 1, name: "Forecast" }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflow di ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("g2 kontrol seri, bulan, dan aksi >= 44px, teks halaman >= 12px (di luar grafik/penjelasan)", async ({
    page,
  }) => {
    await open(page);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const controls: Locator[] = [
        page.getByRole("button", { name: "Perbarui" }),
        page.getByRole("combobox", { name: "Periode proyeksi" }),
        trendSection(page).getByRole("button", { name: "Total temuan" }),
        trendSection(page).getByRole("button", { name: "Greeting" }),
      ];
      for (const control of controls) {
        const box = await control.boundingBox();
        const name = (await control.textContent())?.trim();
        expect(box, `${name} @${width}`).not.toBeNull();
        expect(box!.height, `tinggi kontrol "${name}" @${width}`).toBeGreaterThanOrEqual(43.5);
      }
    }
    const small = await findTextBelowFloor(page.locator("main"), {
      minPx: 12,
      // Grafik dan penjelasan proyeksi dipakai bersama /dashboard. Bar filter
      // memakai DashboardFilters/MonthRangePicker bersama (label 11px, lantai
      // aplikasi), tidak diubah di redesain ini.
      exclude:
        ".recharts-wrapper, [data-testid='forecast-insight-panel'], [data-testid='forecast-filter-bar']",
    });
    expect(small).toEqual([]);
  });

  test("g3 lane: 4 berdampingan di 1440, 1 kolom di 390", async ({ page }) => {
    await open(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    const wide = await Promise.all(
      LANES.map((name) => lane(page, name).boundingBox()),
    );
    wide.forEach((box) => expect(box).not.toBeNull());
    expect(new Set(wide.map((box) => Math.round(box!.y))).size).toBe(1);
    expect(new Set(wide.map((box) => Math.round(box!.x))).size).toBe(4);

    await page.setViewportSize({ width: 390, height: 900 });
    const narrow = await Promise.all(
      LANES.map((name) => lane(page, name).boundingBox()),
    );
    expect(new Set(narrow.map((box) => Math.round(box!.x))).size).toBe(1);
    narrow.forEach((box) => expect(box!.x + box!.width).toBeLessThanOrEqual(390));
  });

  test("h warna status terbaca (kontras >= 4.5) di mode terang dan gelap", async ({
    page,
  }) => {
    await open(page);
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const low = await findLowContrastText(prioritySection(page), {
        selector: "h3, h4, span, p",
        leafOnly: true,
      });
      expect(low, `kontras ${theme}`).toEqual([]);
      await expect(
        page.getByRole("heading", { level: 3, name: "Pantauan", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("article").filter({ hasText: "Rina Nama 1" }).getByText("Membaik"),
      ).toBeVisible();
    }
  });

  test("i state: data historis kurang dari 2 periode memakai teks baru", async ({
    page,
  }) => {
    await open(
      page,
      forecastMocks({
        dashboard: dashboardData({
          paramTrend: {
            labels: ["Jan 26"],
            datasets: [{ label: "Total Temuan", data: [3], isTotal: true }],
          },
        }),
      }),
    );
    await expect(
      trendSection(page).getByText("Data historis minimal 2 periode diperlukan."),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/service forecast/i);
  });

  test("j state: dashboard gagal memuat menampilkan Coba lagi yang memuat ulang", async ({
    page,
  }) => {
    let calls = 0;
    await open(
      page,
      forecastMocks({
        dashboardStatus: 500,
        dashboardBody: { success: false, error: { message: "boom" } },
      }),
      false,
    );
    page.on("request", (r) => {
      if (r.url().includes("/sidak/dashboard?")) calls += 1;
    });
    await expect(
      trendSection(page).getByText("Data dashboard gagal dimuat"),
    ).toBeVisible();
    await trendSection(page).getByRole("button", { name: "Coba lagi" }).click();
    await expect.poll(() => calls).toBeGreaterThan(0);
  });

  test("k state: semua agen Pantauan dan lane kosong memakai istilah baru", async ({
    page,
  }) => {
    await open(
      page,
      forecastMocks({
        agents: agentForecast({ improving: 0, declining: 0, stable: 0, watchlist: 2 }),
      }),
      false,
    );
    await expect(
      prioritySection(page).getByText(
        "Belum cukup periode audit untuk memproyeksikan agen.",
      ),
    ).toBeVisible();
    await expect(prioritySection(page)).toContainText("Pantauan");
    await expect(page.locator("main")).not.toContainText(/watchlist/i);
  });

  test("l state: lane kosong menampilkan pesan agen", async ({ page }) => {
    await open(
      page,
      forecastMocks({ agents: agentForecast({ declining: 0 }) }),
    );
    await expect(
      lane(page, "Memburuk").getByText("Belum ada agen yang diproyeksikan memburuk."),
    ).toBeVisible();
    await expect(lane(page, "Memburuk").getByText("0 agen", { exact: true })).toBeVisible();
  });

  test("m kontrak data: lookup cache, horizon, Perbarui memaksa refresh", async ({
    page,
  }) => {
    const { audit, service, agents } = await open(page);
    await waitForMockedApi(audit, [SERVICE_FORECAST_PATH, AGENT_FORECAST_PATH]);

    // Folder default (Tim Call) terpasang setelah dashboard pertama dimuat,
    // jadi request terakhir yang dipakai sebagai acuan.
    await expect
      .poll(() => service.at(-1)?.filters?.folderIds?.[0])
      .toBe("folder-call");
    expect(service.at(-1)).toMatchObject({
      horizonMonths: 3,
      cacheOnly: true,
      forceRefresh: false,
      filters: { serviceType: "call", folderIds: ["folder-call"] },
    });
    expect(agents.at(-1)).toMatchObject({ horizonMonths: 3, serviceType: "call" });

    const before = { service: service.length, agents: agents.length };
    await page.getByRole("button", { name: "Perbarui" }).click();
    await expect
      .poll(() => service.some((body) => body.forceRefresh === true))
      .toBe(true);
    await expect.poll(() => agents.length).toBeGreaterThan(before.agents);

    await page.getByRole("combobox", { name: "Periode proyeksi" }).click();
    await page.getByRole("option", { name: "6 bulan" }).click();
    await expect
      .poll(() => agents.some((body) => body.horizonMonths === 6))
      .toBe(true);
    await expect(
      prioritySection(page).getByText("7 agen siap diproyeksikan · periode 6 bulan"),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("n layanan Call ke Chat mereset folder dan request; pemimpin chat terkunci", async ({
    page,
  }) => {
    const { service, agents } = await open(page);
    await page.getByRole("combobox", { name: "Layanan" }).click();
    await page.getByRole("option", { name: "Chat", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Tim" })).toContainText(
      "Tim Whatsapp",
    );
    await expect
      .poll(() =>
        service.some(
          (body) =>
            body.filters?.serviceType === "chat" &&
            body.filters?.folderIds?.[0] === "folder-chat",
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        agents.some(
          (body) =>
            body.serviceType === "chat" && body.folderIds?.[0] === "folder-chat",
        ),
      )
      .toBe(true);
  });

  test("o pemimpin chat: layanan terkunci ke Chat", async ({ page }) => {
    const { service, agents } = await open(
      page,
      forecastMocks({ dashboard: dashboardData({ availableServices: ["chat"] }) }),
    );
    const select = page.getByRole("combobox", { name: "Layanan" });
    await expect(select).toBeDisabled();
    await expect(select).toContainText("Chat");
    await expect.poll(() => service.at(-1)?.filters?.serviceType).toBe("chat");
    await expect.poll(() => agents.at(-1)?.serviceType).toBe("chat");
  });

  // ---- Port kontrak dari test unit lama `src/__tests__/sidak-forecast.test.tsx`
  // (dihapus). Semuanya guard regresi untuk perilaku yang dipertahankan: lulus
  // sejak ditulis, bukan RED.

  test("p data forecast tetap tampil dan tidak ada request baru saat idle (rerender)", async ({
    page,
  }) => {
    const { service, agents } = await open(page);
    await expect.poll(() => service.length).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    const before = { service: service.length, agents: agents.length };

    await page.waitForTimeout(2000);
    await expect(page.getByText("Rina Nama 1")).toBeVisible();
    await expect(trendSection(page).getByTestId("forecast-insight-panel")).toBeVisible();
    expect({ service: service.length, agents: agents.length }).toEqual(before);
  });

  test("q opsi folder anak tetap tampil setelah dashboard dimuat ulang dengan folder terbatas", async ({
    page,
  }) => {
    await open(page);
    const folder = page.getByRole("combobox", { name: "Tim", exact: true });
    const child = page.getByRole("option", { name: "↳ Tim Call - QA" });

    await folder.click();
    await expect(child).toBeVisible();
    await page.keyboard.press("Escape");

    let scopedLoads = 0;
    await page.route(/\/api\/v1\/sidak\/dashboard\?/, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      scopedLoads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: dashboardData({
            folders: [{ id: "folder-call", name: "Tim Call", parent_id: null }],
          }),
        }),
      });
    });
    await page.getByRole("button", { name: "Reset rentang bulan" }).click();
    await expect.poll(() => scopedLoads).toBeGreaterThan(0);
    await expect(page.getByText("Rina Nama 1")).toBeVisible();

    await folder.click();
    await expect(child).toBeVisible();
  });

  test("r combobox Tim bisa dicari berdasarkan tim dan batch", async ({ page }) => {
    await open(page);
    const folder = page.getByRole("combobox", { name: "Tim", exact: true });
    await folder.click();
    await page.getByRole("combobox", { name: "Cari tim" }).fill("qa");

    const child = page.getByRole("option", { name: "↳ Tim Call - QA" });
    await expect(child).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Tim Call — Semua batch" }),
    ).toHaveCount(0);
    await child.click();
    await expect(folder).toContainText("↳ Tim Call - QA");
  });

  test("s alias layanan Chat dideduplikasi dengan nilai kanonik", async ({ page }) => {
    await open(
      page,
      forecastMocks({
        dashboard: dashboardData({
          availableServices: ["call", "Chat", "Digital Chat", "email"],
        }),
      }),
    );
    await page.getByRole("combobox", { name: "Layanan" }).click();
    await expect(page.getByRole("option")).toHaveText(["Call", "Chat", "Email"]);
  });

  test("t kontrol filter >= 44px dan rentang bulan berlabel (Dari/Sampai di mobile)", async ({
    page,
  }) => {
    await open(page);
    for (const control of [
      page.getByRole("button", { name: "Perbarui" }),
      page.getByRole("combobox", { name: "Periode proyeksi" }),
      page.getByRole("combobox", { name: "Bulan awal" }),
      page.getByRole("combobox", { name: "Bulan akhir" }),
      page.getByRole("button", { name: "Reset rentang bulan" }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
    const reset = await page.getByRole("button", { name: "Reset rentang bulan" }).boundingBox();
    expect(reset!.width).toBeGreaterThanOrEqual(43.5);

    await page.setViewportSize({ width: 390, height: 900 });
    await expect(page.getByText("Dari", { exact: true })).toBeVisible();
    await expect(page.getByText("Sampai", { exact: true })).toBeVisible();
  });

  test("u scroll lane hanya di desktop, tanpa badge peringkat lokal", async ({
    page,
  }) => {
    await open(
      page,
      forecastMocks({ agents: agentForecast({ improving: 12 }) }),
    );
    const areas = page.locator("main [data-slot='scroll-area']");
    await expect(areas).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      await expect(areas.nth(i)).toHaveAttribute("role", "region");
      await expect(areas.nth(i)).toHaveAttribute("aria-label", /^Daftar agen /);
    }

    const improving = page.getByRole("region", { name: "Daftar agen membaik" });
    await page.setViewportSize({ width: 1440, height: 900 });
    const wide = await improving.boundingBox();
    expect(wide!.height).toBeLessThanOrEqual(23 * 14 + 2);
    await page.setViewportSize({ width: 390, height: 900 });
    const narrow = await improving.boundingBox();
    expect(narrow!.height).toBeGreaterThan(23 * 14 + 2);

    const row = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Rina Nama 1", exact: true }) });
    await expect(row.getByText("Membaik")).toBeVisible();
    await expect(row.getByText("#1")).toHaveCount(0);
  });

  test("v permukaan datar: tanpa kartu atau ikon sparkles, penjelasan proyeksi tampil", async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator("main [data-slot='card']")).toHaveCount(0);
    await expect(page.locator("main .lucide-sparkles")).toHaveCount(0);
    await expect(page.getByText("Penjelasan proyeksi")).toBeVisible();
  });
});
