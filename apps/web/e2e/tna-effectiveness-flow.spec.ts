import { expect, test, type Page } from "@playwright/test";
import type { TnaEffectiveness } from "@trainers/types";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { openTna } from "./helpers/tnaHarness";

// TNA phase 6 T3 (plans/markdown/tna-phase-6.md D30, K39, K41, K42, P-2-P-5):
// the "Hasil rencana" dashboard and the due badge in navigation. Hermetic:
// every API response is mocked.
test.beforeAll(() => assertLocalDevOnlyTarget());

const ok = (data: unknown) => ({ success: true, data });
const planIds = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
];
const verdicts = (tercapai: number, sebagian: number, tidak: number) => ({
  tercapai,
  tercapai_sebagian: sebagian,
  tidak_tercapai: tidak,
});

function effectiveness(
  groupBy: TnaEffectiveness["group_by"] = "program",
  from: string | null = null,
  to: string | null = null,
): TnaEffectiveness {
  const plan = (i: number, verdict: keyof ReturnType<typeof verdicts>) => ({
    id: planIds[i]!,
    title: `Rencana uji ${i + 1}`,
    verdict,
    completed_at: `2026-11-0${i + 1}T03:00:00.000Z`,
  });
  const programGroups = [
    {
      key: "verifikasi",
      label: "Ketelitian dan Verifikasi Data",
      completed: 3,
      verdicts: verdicts(1, 1, 1),
      fully_achieved_pct: 100 / 3,
      median_rate_drop: 140,
      median_duration_days: 12.5,
      follow_ups: {
        selesai_tuntas: 1,
        perlu_rencana_lanjutan: 1,
        eskalasi_non_training: 1,
      },
      thin: false,
      plans: [
        plan(2, "tidak_tercapai"),
        plan(1, "tercapai_sebagian"),
        plan(0, "tercapai"),
      ],
    },
    {
      key: "probing",
      label: "Probing Efektif",
      completed: 1,
      verdicts: verdicts(1, 0, 0),
      fully_achieved_pct: 100,
      median_rate_drop: -20,
      median_duration_days: 30,
      follow_ups: {
        selesai_tuntas: 1,
        perlu_rencana_lanjutan: 0,
        eskalasi_non_training: 0,
      },
      thin: true,
      plans: [plan(3, "tercapai")],
    },
  ];
  const groups =
    groupBy === "program"
      ? programGroups
      : groupBy === "gap_type"
        ? [
            { ...programGroups[0]!, key: "skill", label: null },
            { ...programGroups[1]!, key: "proses", label: null },
          ]
        : [{ ...programGroups[0]!, key: "call", label: null, completed: 4 }];
  return {
    group_by: groupBy,
    from,
    to,
    summary: {
      completed: 4,
      verdicts: verdicts(2, 1, 1),
      fully_achieved_pct: 50,
      median_rate_drop: 150,
      median_duration_days: 12.5,
    },
    groups,
  };
}

const emptySummary: TnaEffectiveness = {
  group_by: "program",
  from: null,
  to: null,
  summary: {
    completed: 0,
    verdicts: verdicts(0, 0, 0),
    fully_achieved_pct: null,
    median_rate_drop: null,
    median_duration_days: null,
  },
  groups: [],
};

const dueCount = (count: number, status = 200) => ({
  method: "GET" as const,
  path: "/api/v1/tna/plans/due-count",
  status,
  body:
    status === 200
      ? ok({ count })
      : { success: false, error: { code: "TNA_UNAVAILABLE", message: "x" } },
});
const effectivenessMock = (body: unknown, status = 200) => ({
  method: "GET" as const,
  path: /^\/api\/v1\/tna\/effectiveness(\?.*)?$/,
  status,
  body,
});

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

// useThemeMode reads localStorage "theme" on load, so switch and reload.
async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await page.reload();
}

const summary = (page: Page) =>
  page.getByRole("region", { name: "Ringkasan rencana selesai" });
const groupList = (page: Page) =>
  page.getByRole("list", { name: "Hasil per kelompok" });

for (const width of [1440, 390]) {
  test(`hasil ${width}: tab, ringkasan, kelompok program, rencana di balik angka`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const audit = await openTna(page, "/tna", [
      dueCount(0),
      effectivenessMock(ok(effectiveness())),
    ]);
    await page.getByRole("link", { name: "Hasil rencana" }).click();
    await expect(page).toHaveURL(/\/tna\/hasil$/);
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("Hasil rencana");
    // K41: dashboard covers TNA plans only and points to EFEK.
    await expect(page.getByRole("link", { name: "EFEK" }).last()).toBeVisible();

    const tiles = summary(page);
    await expect(tiles).toContainText("Rencana selesai");
    await expect(tiles).toContainText("4");
    await expect(tiles).toContainText("Tercapai penuh");
    await expect(tiles).toContainText("50%");
    await expect(tiles).toContainText("Turun 150 per 100 sesi");
    await expect(tiles).toContainText("12,5 hari");

    const rows = groupList(page).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    const first = rows.first();
    await expect(first).toContainText("Ketelitian dan Verifikasi Data");
    await expect(first).toContainText("3 selesai");
    // Verdict mix is always text, never color alone.
    await expect(first).toContainText(
      "1 tercapai · 1 tercapai sebagian · 1 tidak tercapai",
    );
    await expect(first).toContainText("33,3%");
    await expect(first).toContainText("Turun 140 per 100 sesi");
    await expect(first).not.toContainText("Data sedikit");
    const second = rows.nth(1);
    await expect(second).toContainText("Probing Efektif");
    await expect(second).toContainText("Data sedikit");
    await expect(second).toContainText("Naik 20 per 100 sesi");
    await expect(second).toContainText("30 hari");

    // P-2: the plans behind the numbers.
    await first.getByText("Lihat 3 rencana").click();
    const link = first.getByRole("link", { name: /Rencana uji 3/ });
    await expect(link).toHaveAttribute("href", `/tna/rencana/${planIds[2]}`);
    await expect(first).toContainText("Tidak tercapai");

    await noHorizontalScroll(page);
    const tag = width === 390 ? "mobile" : "desktop";
    await page.screenshot({
      path: testInfo.outputPath(`tna-phase-6-${tag}-hasil.png`),
      fullPage: true,
    });
    await setTheme(page, "dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(groupList(page).getByRole("listitem")).toHaveCount(2);
    await page.screenshot({
      path: testInfo.outputPath(`tna-phase-6-${tag}-hasil-gelap.png`),
      fullPage: true,
    });
    await setTheme(page, "light");
    await waitForMockedApi(audit, ["GET /api/v1/tna/effectiveness"]);
    expectHermetic(audit);
  });
}

test("filter kelompok dan tanggal masuk URL dan query", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/tna/effectiveness"))
      requests.push(new URL(request.url()).search);
  });
  await openTna(page, "/tna/hasil", [
    dueCount(0),
    effectivenessMock(ok(effectiveness())),
  ]);
  await expect(groupList(page).getByRole("listitem")).toHaveCount(2);
  expect(requests[0]).toBe("");

  await page.getByLabel("Kelompokkan menurut").selectOption("gap_type");
  await expect(page).toHaveURL(/group=gap_type/);
  await expect.poll(() => requests.at(-1)).toBe("?group_by=gap_type");

  await page.getByLabel("Selesai dari").fill("2026-11-01");
  await page.getByLabel("Selesai sampai").fill("2026-11-30");
  await expect
    .poll(() => requests.at(-1))
    .toBe("?group_by=gap_type&from=2026-11-01&to=2026-11-30");
  await expect(page).toHaveURL(/from=2026-11-01/);
  await expect(page).toHaveURL(/to=2026-11-30/);
});

test("label kelompok gap dan layanan memakai label manusiawi", async ({
  page,
}) => {
  await openTna(page, "/tna/hasil?group=gap_type", [
    dueCount(0),
    effectivenessMock(ok(effectiveness("gap_type"))),
  ]);
  const rows = groupList(page).getByRole("listitem");
  await expect(rows.first()).toContainText("Keterampilan");
  await expect(rows.nth(1)).toContainText("Proses");
  await expect(page.getByLabel("Kelompokkan menurut")).toHaveValue("gap_type");
});

test("kosong: tanpa filter dan dengan filter punya pesan berbeda", async ({
  page,
}) => {
  await openTna(page, "/tna/hasil", [
    dueCount(0),
    effectivenessMock(ok(emptySummary)),
  ]);
  await expect(
    page.getByText(
      "Belum ada rencana selesai. Dashboard terisi setelah evaluasi pertama diselesaikan.",
    ),
  ).toBeVisible({ timeout: 20000 });
  await expect(groupList(page)).toHaveCount(0);

  await page.getByLabel("Selesai dari").fill("2026-01-01");
  await expect(
    page.getByText("Tidak ada rencana selesai pada rentang tanggal ini."),
  ).toBeVisible();
});

test("gagal dimuat: pesan server dan Coba lagi memuat ulang", async ({
  page,
}) => {
  const failure = {
    success: false,
    error: {
      code: "TNA_UNAVAILABLE",
      message: "Data TNA belum dapat diproses.",
    },
  };
  const state = { body: failure as unknown, status: 503 };
  await openTna(page, "/tna/hasil", [dueCount(0)], "trainer");
  await page.route(/\/api\/v1\/tna\/effectiveness/, (route) =>
    route.fulfill({
      status: state.status,
      contentType: "application/json",
      body: JSON.stringify(state.body),
    }),
  );
  await page.reload();
  await expect(page.getByText("Data TNA belum dapat diproses.")).toBeVisible({
    timeout: 20000,
  });
  state.body = ok(effectiveness());
  state.status = 200;
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(groupList(page).getByRole("listitem")).toHaveCount(2);
});

test("badge: jumlah jatuh tempo di sidebar, dimuat ulang saat masuk TNA", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let count = 2;
  let calls = 0;
  await openTna(page, "/tna/hasil", [effectivenessMock(ok(effectiveness()))]);
  await page.route("**/api/v1/tna/plans/due-count", (route) => {
    calls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ok({ count })),
    });
  });
  await page.reload();
  const nav = page.getByRole("navigation", { name: "Navigasi utama" }).first();
  await expect(
    nav.getByRole("link", { name: /2 rencana perlu dievaluasi/ }),
  ).toBeVisible({ timeout: 20000 });
  await nav.screenshot({
    path: testInfo.outputPath("tna-phase-6-badge-sidebar.png"),
  });
  const before = calls;

  count = 1;
  await page.getByRole("link", { name: "Kebutuhan & rencana" }).click();
  await expect(page).toHaveURL(/\/tna(\?|$)/);
  await expect(
    nav.getByRole("link", { name: /1 rencana perlu dievaluasi/ }),
  ).toBeVisible();
  expect(calls).toBeGreaterThan(before);
  // A changed count re-renders the nav; route focus must stay on the page h1.
  await expect(page.locator("#konten-halaman h1").first()).toBeFocused();
});

test("badge: nol atau gagal tidak tampil dan tidak menampilkan error", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const mock of [dueCount(0), dueCount(0, 503)]) {
    const audit = await openTna(page, "/tna/hasil", [
      mock,
      effectivenessMock(ok(effectiveness())),
    ]);
    await expect(groupList(page).getByRole("listitem")).toHaveCount(2, {
      timeout: 20000,
    });
    await waitForMockedApi(audit, ["GET /api/v1/tna/plans/due-count"]);
    await expect(page.getByText(/rencana perlu dievaluasi/)).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});

test("badge mobile: tab TNA membawa jumlah", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTna(page, "/tna/hasil", [
    dueCount(3),
    effectivenessMock(ok(effectiveness())),
  ]);
  const tabs = page.getByRole("navigation", { name: "Navigasi utama" }).last();
  await expect(
    tabs.getByRole("link", { name: /3 rencana perlu dievaluasi/ }),
  ).toBeVisible({ timeout: 20000 });
  await noHorizontalScroll(page);
  await tabs.screenshot({
    path: testInfo.outputPath("tna-phase-6-badge-mobile.png"),
  });
});
