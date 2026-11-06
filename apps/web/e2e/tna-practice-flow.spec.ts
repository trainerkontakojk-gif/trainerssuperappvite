import { expect, test, type Page } from "@playwright/test";
import type { TnaPlanDetail, TnaPlanPractice } from "@trainers/types";
import { waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna, planDetail, program } from "./helpers/tnaHarness";

// TNA phase 3 T4 (plans/markdown/tna-phase-3.md D19, P-4, Q-1, Q-2): practice
// targets in the plan form and the practice progress section. Hermetic: every
// API call is mocked.
const path = `/api/v1/tna/plans/${ids.plan}`;
const url = `/tna/rencana/${ids.plan}`;
test.beforeAll(() => assertLocalDevOnlyTarget());

const live: TnaPlanPractice = {
  state: "live",
  participants: [
    {
      participant_id: ids.ana,
      peserta_id: ids.ana,
      modules: {
        ketik: { sessions: 2, avg_score: 85.5, status: "memenuhi" },
        telefun: { sessions: 0, avg_score: null, status: "belum_mulai" },
      },
    },
  ],
  summary: [
    { module: "ketik", min_sessions: 2, met: 1, total: 1 },
    { module: "telefun", min_sessions: 1, met: 0, total: 1 },
  ],
};

function withPractice(
  status: "draft" | "aktif" | "selesai",
  practice: TnaPlanPractice | null,
  targets = [
    { module: "ketik" as const, min_sessions: 2 },
    { module: "telefun" as const, min_sessions: 1 },
  ],
): TnaPlanDetail {
  const base = planDetail(status === "selesai" ? "aktif" : status);
  return {
    ...base,
    plan: { ...base.plan, status },
    practice_targets: targets,
    practice,
  };
}

// useThemeMode reads localStorage "theme" on load, so switch and reload.
async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Latihan simulasi" })
      .or(page.getByRole("region", { name: "Progres latihan simulasi" })),
  ).toBeVisible({ timeout: 20000 });
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("rencana baru: target latihan dari saran program, bisa diubah, terkirim ke API", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const audit = await openTna(page, `/tna/kebutuhan/${ids.need}`, [
    {
      method: "GET",
      path: "/api/v1/tna/programs",
      body: {
        success: true,
        data: [{ ...program, suggested_modules: ["telefun", "ketik"] }],
      },
    },
  ]);
  const practice = page.getByRole("group", { name: "Latihan simulasi" });
  await expect(practice.getByLabel("KETIK", { exact: true })).toBeChecked();
  await expect(practice.getByLabel("Telefun", { exact: true })).toBeChecked();
  await expect(practice.getByLabel("PDKT", { exact: true })).not.toBeChecked();
  await expect(practice.getByLabel("Sesi minimal KETIK")).toHaveValue("3");
  await expect(practice.getByLabel("Sesi minimal PDKT")).toBeDisabled();
  await expect(
    practice.getByText("Sesi Telefun dijalankan trainer atas nama peserta", {
      exact: false,
    }),
  ).toBeVisible();

  await setTheme(page, "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await practice.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("tna-phase-3-mobile-form-gelap.png"),
  });
  await setTheme(page, "light");
  await practice.getByLabel("Sesi minimal KETIK").fill("2");
  await practice.getByLabel("Telefun", { exact: true }).uncheck();
  await expect(
    practice.getByText("Sesi Telefun dijalankan trainer atas nama peserta", {
      exact: false,
    }),
  ).toHaveCount(0);
  await practice.getByLabel("PDKT", { exact: true }).check();
  await practice.getByLabel("Sesi minimal PDKT").fill("4");
  await practice.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("tna-phase-3-mobile-form.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.getByLabel("Judul rencana").fill("Latihan verifikasi data");
  await page.getByLabel("Tanggal mulai").fill("2026-10-10");
  await page.getByLabel("Tanggal selesai").fill("2026-10-11");
  await page.getByLabel("Tanggal evaluasi").fill("2026-11-11");
  await page
    .getByLabel("Target tingkat maksimal (per 100 sesi sampel)")
    .fill("2");
  await page.getByLabel("Target sebaran maksimal (%)").fill("10");
  const create = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/tna/plans"),
  );
  await page.getByRole("button", { name: "Buat rencana" }).click();
  expect((await create).postDataJSON().practice_targets).toEqual([
    { module: "ketik", min_sessions: 2 },
    { module: "pdkt", min_sessions: 4 },
  ]);
  await waitForMockedApi(audit, ["POST /api/v1/tna/plans"]);
});

test("draft: target tersimpan terisi dan perubahan terkirim lewat PATCH", async ({
  page,
}) => {
  const current = {
    success: true,
    data: withPractice("draft", null, [{ module: "ketik", min_sessions: 3 }]),
  };
  await openTna(page, url, [{ method: "GET", path, body: current }]);
  const practice = page.getByRole("group", { name: "Latihan simulasi" });
  await expect(practice.getByLabel("KETIK", { exact: true })).toBeChecked();
  await expect(
    practice.getByLabel("Telefun", { exact: true }),
  ).not.toBeChecked();
  await practice.getByLabel("Sesi minimal KETIK").fill("5");
  const patch = page.waitForRequest((r) => r.method() === "PATCH");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  expect((await patch).postDataJSON()).toMatchObject({
    practice_targets: [{ module: "ketik", min_sessions: 5 }],
    expected_updated_at: current.data.plan.updated_at,
  });
});

for (const width of [1440, 390]) {
  test(`aktif ${width}: progres latihan live per modul dan per peserta`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openTna(page, url, [
      {
        method: "GET",
        path,
        body: { success: true, data: withPractice("aktif", live) },
      },
    ]);
    const section = page.getByRole("region", {
      name: "Progres latihan simulasi",
    });
    await expect(section).toBeVisible();
    await expect(
      section.getByText("Target: KETIK 2 sesi, Telefun 1 sesi", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      section.getByText("KETIK: 1 dari 1 peserta memenuhi target", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      section.getByText("Telefun: 0 dari 1 peserta memenuhi target", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      section.getByText(
        "Dihitung dari riwayat saat ini; sesi yang dihapus tidak terhitung.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      section.getByText("Data latihan mendukung, bukan pengganti hasil QA.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      section.getByText("Sesi Telefun dijalankan trainer atas nama peserta", {
        exact: false,
      }),
    ).toBeVisible();
    const ana = section.getByRole("listitem").filter({ hasText: "Ana Contoh" });
    await expect(ana).toContainText("KETIK");
    await expect(ana).toContainText("2 sesi · rata-rata 85,5 / 100 · Memenuhi");
    await expect(ana).toContainText("Telefun");
    await expect(ana).toContainText("0 sesi · Belum mulai");
    // Locked plan details list the targets too.
    await expect(
      page.getByText("KETIK 2 sesi, Telefun 1 sesi", { exact: true }).first(),
    ).toBeVisible();
    await noHorizontalScroll(page);
    await section.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: testInfo.outputPath(
        `tna-phase-3-${width === 390 ? "mobile" : "desktop"}-progres.png`,
      ),
    });
    await setTheme(page, "dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await section.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: testInfo.outputPath(
        `tna-phase-3-${width === 390 ? "mobile" : "desktop"}-progres-gelap.png`,
      ),
    });
  });
}

test("progres tidak bisa dimuat: pesan jelas dan Coba lagi memuat ulang", async ({
  page,
}) => {
  const current = {
    success: true,
    data: withPractice("aktif", {
      state: "unavailable",
      participants: [],
      summary: [],
    }),
  };
  let loads = 0;
  page.on("request", (r) => {
    if (r.method() === "GET" && new URL(r.url()).pathname === path) loads += 1;
  });
  await openTna(page, url, [{ method: "GET", path, body: current }]);
  const section = page.getByRole("region", {
    name: "Progres latihan simulasi",
  });
  await expect(section.getByRole("alert")).toHaveText(
    "Progres latihan simulasi belum bisa dimuat.",
  );
  const before = loads;
  current.data = withPractice("aktif", live);
  await section.getByRole("button", { name: "Coba lagi" }).click();
  await expect(
    section.getByText("KETIK: 1 dari 1 peserta memenuhi target", {
      exact: true,
    }),
  ).toBeVisible();
  expect(loads).toBeGreaterThan(before);
});

test("selesai: progres beku diberi keterangan, rencana tanpa target tanpa bagian progres", async ({
  page,
}) => {
  const current = {
    success: true,
    data: withPractice("selesai", { ...live, state: "frozen" }),
  };
  await openTna(page, url, [{ method: "GET", path, body: current }]);
  const section = page.getByRole("region", {
    name: "Progres latihan simulasi",
  });
  await expect(
    section.getByText("Dibekukan saat rencana diselesaikan.", { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByText("Dihitung dari riwayat saat ini", { exact: false }),
  ).toHaveCount(0);

  current.data = withPractice("aktif", null, []);
  await page.reload();
  await expect(page.getByText("Status: Aktif", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Progres latihan simulasi" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Tanpa target latihan", { exact: true }),
  ).toBeVisible();
});
