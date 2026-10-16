import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  HOME_AGENTS,
  LEADER_ACCESS_MOCK,
  homeMocks,
} from "./helpers/sidakHomeFixture";
import { findTextBelowFloor } from "./helpers/typographyFloor";

/**
 * Beranda SIDAK (`/sidak`) — hermetic.
 *
 * Kontrak dari `plans/markdown/sidak-redesign.md` requirement 1:
 * - kepala `h1 "SIDAK"` + baris cakupan + satu aksi utama sesuai peran;
 * - "Kondisi periode terbaru" dari `periodMetrics` (dua periode terakhir);
 * - "Perlu tindak lanjut" = agen `atRisk` dari `GET /sidak/agents`, skor
 *   terendah dulu;
 * - "Parameter teratas" = tiga teratas dari `paretoData`;
 * - "Halaman SIDAK" dari model navigasi (tersaring capability);
 * - tiap bagian punya state gagal + "Coba lagi" sendiri dan tidak menampilkan
 *   angka saat API gagal.
 */

function section(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

test.describe("Beranda SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("trainer: kepala, kondisi periode, tindak lanjut, parameter, dan daftar halaman", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      apiMocks: homeMocks(),
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", { level: 1, name: "SIDAK", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("sidak-home-scope")).toContainText("Call");

    // Satu aksi utama untuk admin/trainer.
    // Sidebar juga punya tautan "Input temuan"; aksi utama ada di konten.
    const primary = page
      .getByRole("region", { name: "Konten halaman" })
      .getByRole("link", { name: "Input temuan", exact: true });
    await expect(primary).toHaveAttribute("href", "/sidak/input");

    // Kondisi periode terbaru: periode terakhir vs sebelumnya.
    const strip = section(page, "Kondisi periode terbaru");
    await expect(strip).toContainText("Okt 26");
    await expect(strip.getByTestId("sidak-home-metric-score")).toContainText(
      "90.1",
    );
    await expect(strip.getByTestId("sidak-home-metric-score")).toContainText(
      "Naik 1.7 poin dari Sep 26",
    );
    await expect(strip.getByTestId("sidak-home-metric-audited")).toContainText(
      "44",
    );
    await expect(strip.getByTestId("sidak-home-metric-findings")).toContainText(
      "36",
    );
    await expect(strip.getByTestId("sidak-home-metric-findings")).toContainText(
      "Turun 4 dari Sep 26",
    );
    await expect(strip.getByTestId("sidak-home-metric-tickets")).toContainText(
      "27",
    );

    // Perlu tindak lanjut: hanya agen di bawah target, skor terendah dulu.
    const followUp = section(page, "Perlu tindak lanjut");
    const rows = followUp.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Rina Marlina");
    await expect(rows.nth(0)).toContainText("81.5");
    await expect(rows.nth(0)).toContainText("Perlu perhatian");
    await expect(rows.nth(1)).toContainText("Bima Saputra");
    await expect(rows.nth(2)).toContainText("Dodi Pratama");
    await expect(followUp).not.toContainText("Citra Lestari");
    await expect(
      followUp.getByRole("link", { name: /Rina Marlina/ }),
    ).toHaveAttribute("href", "/sidak/agents/a-rina");

    // Parameter teratas: tiga teratas Pareto dengan jumlah dan porsi.
    const params = section(page, "Parameter teratas");
    await expect(params.getByRole("listitem")).toHaveCount(3);
    // Baris bernomor: nomor, nama, jumlah, porsi (tanpa batang).
    await expect(params.getByRole("listitem").first()).toHaveText(
      /^1Verifikasi data konsumen.*1439%$/,
    );
    await expect(params).not.toContainText("Salam penutup");

    // Daftar halaman dari model navigasi.
    const directory = section(page, "Halaman SIDAK");
    await expect(
      directory.getByRole("link", { name: /Forecast/ }),
    ).toHaveAttribute("href", "/sidak/forecast");
    await expect(
      directory.getByRole("link", { name: /Parameter QA/ }),
    ).toHaveAttribute("href", "/sidak/settings");
    await expect(
      directory.getByRole("link", { name: /Ringkasan/ }),
    ).toHaveCount(0);

    // Tanpa label kapital (docs/design.md).
    const uppercase = await page
      .getByRole("region", { name: "Konten halaman" })
      .evaluate((root) =>
        Array.from(root.querySelectorAll("*"))
          .filter((el) => getComputedStyle(el).textTransform === "uppercase")
          .map((el) => el.textContent?.trim().slice(0, 30)),
      );
    expect(uppercase).toEqual([]);

    // Teks pemasaran lama hilang.
    await expect(page.getByText("Selamat Datang di SIDAK")).toHaveCount(0);

    expect(
      await findTextBelowFloor(
        page.getByRole("region", { name: "Konten halaman" }),
      ),
    ).toEqual([]);

    await waitForMockedApi(audit, [
      "/me/access-status",
      "/sidak/dashboard?",
      "/sidak/agents?",
    ]);
    expectHermetic(audit);
  });

  test("leader: aksi utama Lihat agen saya, tanpa halaman pengelola", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      auth: { role: "leader" },
      apiMocks: homeMocks({ access: LEADER_ACCESS_MOCK }),
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "SIDAK", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("link", { name: "Lihat agen saya", exact: true }),
    ).toHaveAttribute("href", "/sidak/agents");
    await expect(
      page
        .getByRole("region", { name: "Konten halaman" })
        .getByRole("link", { name: "Input temuan", exact: true }),
    ).toHaveCount(0);

    const directory = section(page, "Halaman SIDAK");
    await expect(
      directory.getByRole("link", { name: /Ranking/ }),
    ).toBeVisible();
    for (const forbidden of [
      /Input temuan/i,
      /Periode QA/,
      /Parameter QA/,
      /Laporan/,
      /Jadwal shifting/i,
    ]) {
      await expect(
        directory.getByRole("link", { name: forbidden }),
      ).toHaveCount(0);
    }
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/agents?"]);
    expectHermetic(audit);
  });

  test("API gagal: tiap bagian menampilkan Coba lagi tanpa angka", async ({
    page,
  }) => {
    const failure = {
      status: 500,
      body: { success: false, error: { code: "X", message: "gagal" } },
    };
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      apiMocks: homeMocks({ dashboard: failure, agents: failure }),
    });

    const strip = section(page, "Kondisi periode terbaru");
    await expect(strip.getByRole("alert")).toContainText(
      "Kondisi periode belum bisa dimuat",
      { timeout: 20000 },
    );
    await expect(
      strip.getByRole("button", { name: "Coba lagi" }),
    ).toBeVisible();
    await expect(strip).not.toContainText("90.1");

    const followUp = section(page, "Perlu tindak lanjut");
    await expect(followUp.getByRole("alert")).toContainText(
      "Daftar agen belum bisa dimuat",
    );
    await expect(
      followUp.getByRole("button", { name: "Coba lagi" }),
    ).toBeVisible();

    const params = section(page, "Parameter teratas");
    await expect(params.getByRole("alert")).toBeVisible();

    // Daftar halaman tidak bergantung API.
    await expect(
      section(page, "Halaman SIDAK").getByRole("link", { name: /Dashboard/ }),
    ).toBeVisible();
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/agents?"]);
    expectHermetic(audit);
  });

  test("kosong: semua agen memenuhi target dan belum ada periode", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      apiMocks: homeMocks({
        dashboard: {
          body: {
            success: true,
            data: {
              periods: [],
              folders: [],
              summary: null,
              serviceData: [],
              topAgents: [],
              paretoData: [],
              donutData: null,
              paramTrend: { labels: [], datasets: [] },
              periodMetrics: [],
              sparklines: {},
              availableYears: [],
              currentYear: 2026,
              availableServices: ["call"],
            },
          },
        },
        agents: {
          body: {
            success: true,
            data: {
              agents: HOME_AGENTS.filter((agent) => !agent.atRisk),
              batches: [],
            },
          },
        },
      }),
    });

    await expect(section(page, "Perlu tindak lanjut")).toContainText(
      "Semua agen memenuhi target 95",
      { timeout: 20000 },
    );
    await expect(section(page, "Kondisi periode terbaru")).toContainText(
      "Belum ada periode QA",
    );
    await expect(section(page, "Parameter teratas")).toContainText(
      "Belum ada temuan",
    );
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/agents?"]);
    expectHermetic(audit);
  });
});
