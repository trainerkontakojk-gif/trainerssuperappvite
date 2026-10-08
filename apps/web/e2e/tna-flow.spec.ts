import { expect, test } from "@playwright/test";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  detail,
  ids,
  metrics,
  openTna,
  parameterUrl,
  planDetail,
} from "./helpers/tnaHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

test("trainer: semua parameter → validasi → rencana → edit peserta → aktivasi dan pembatalan", async ({
  page,
}) => {
  const current = { success: true, data: planDetail() };
  const audit = await openTna(page, "/tna", [
    {
      method: "GET",
      path: /\/tna\/parameters\?.*scope=all/,
      body: {
        success: true,
        data: {
          items: [metrics],
          compare_period_ids: [],
          selected_audit_status: "audited",
          insufficientData: true,
        },
      },
    },
    { method: "GET", path: `/api/v1/tna/plans/${ids.plan}`, body: current },
  ]);
  await expect(
    page.getByRole("link", { name: "TNA", exact: true }),
  ).toHaveAttribute("data-active", "true", { timeout: 20000 });
  await expect(
    page.getByLabel("Layanan").locator("option[value='call']"),
  ).toHaveText("Call");
  await page.getByLabel("Tampilkan semua parameter").click();
  await expect(page.getByLabel("Tampilkan semua parameter")).toBeChecked();
  await page
    .getByRole("link", { name: "Ketelitian verifikasi", exact: true })
    .click();
  await expect(
    page.getByText("Detail parameter", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Parameter ini bukan kandidat otomatis"),
  ).toBeVisible();
  await expect(page.getByText(/Dugaan otomatis/)).toBeVisible();
  await expect(page.getByText("TIKET-CONTOH-01")).toBeVisible();
  await page
    .getByLabel("Catatan penyebab")
    .fill("Perlu latihan verifikasi ulang data");
  await page.getByRole("button", { name: "Simpan validasi" }).click();
  await expect(page).toHaveURL(new RegExp(`/tna/kebutuhan/${ids.need}`));
  await expect(page.getByLabel("Ana Contoh")).toBeChecked();
  await expect(page.getByLabel("Budi Contoh")).toBeChecked();
  await page.getByLabel("Judul rencana").fill("Latihan verifikasi data");
  await page.getByLabel("Tanggal mulai").fill("2026-10-10");
  await page.getByLabel("Tanggal selesai").fill("2026-10-11");
  await page.getByLabel("Tanggal evaluasi").fill("2026-11-11");
  const create = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/tna/plans"),
  );
  await page.getByRole("button", { name: "Buat rencana" }).click();
  expect((await create).postDataJSON().participant_peserta_ids).toEqual([
    ids.ana,
    ids.budi,
  ]);
  await expect(page.getByText("Pratinjau — belum dibekukan")).toBeVisible();
  await expect(page.getByText("Status: Draf", { exact: true })).toBeVisible();
  await page.getByLabel("Cari peserta").fill("Budi");
  await page.getByRole("button", { name: "Tambah Budi Contoh" }).click();
  const patch = page.waitForRequest((r) => r.method() === "PATCH");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  expect((await patch).postDataJSON()).toMatchObject({
    participant_peserta_ids: [ids.ana, ids.budi],
    expected_updated_at: current.data.plan.updated_at,
  });
  await page.getByRole("button", { name: "Aktifkan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Baseline dan peserta akan dibekukan");
  await dialog.getByRole("button", { name: "Kembali" }).click();
  current.data = planDetail("aktif");
  await page.getByRole("button", { name: "Aktifkan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ya, aktifkan" })
    .click();
  await expect(page.getByText("Baseline beku", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Cari peserta")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Ringkasan TNA" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kembali" })
    .click();
  current.data = planDetail("dibatalkan");
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ya, batalkan" })
    .click();
  await expect(page.getByText("Status: Dibatalkan")).toBeVisible();
  await waitForMockedApi(audit, [
    "scope=all",
    "POST /api/v1/tna/needs",
    "POST /api/v1/tna/plans",
    "PATCH",
    "/activate",
    "/cancel",
  ]);
  expectHermetic(audit);
});

test("409 mengunci aksi hingga muat ulang", async ({ page }) => {
  const audit = await openTna(page, `/tna/rencana/${ids.plan}`, [
    {
      method: "PATCH",
      path: `/api/v1/tna/plans/${ids.plan}`,
      status: 409,
      body: {
        success: false,
        error: {
          code: "TNA_PLAN_STALE",
          message: "Rencana sudah berubah, muat ulang sebelum melanjutkan.",
        },
      },
    },
  ]);
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Rencana sudah berubah, muat ulang",
  );
  await expect(
    page.getByRole("button", { name: "Aktifkan", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Aktifkan", exact: true }),
  ).toBeEnabled();
  await waitForMockedApi(audit, ["PATCH", `GET /api/v1/tna/plans/${ids.plan}`]);
  expectHermetic(audit);
});

test("no_audit tampil sebagai banner, bukan angka nol; nol temuan tidak bisa divalidasi", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna", [
    {
      method: "GET",
      path: /\/tna\/parameters\?/,
      body: {
        success: true,
        data: {
          items: [
            {
              ...metrics,
              auditStatus: "no_audit",
              ratePer100: null,
              spreadPct: null,
              trendStatus: "no_current_audit",
            },
          ],
          selected_audit_status: "no_audit",
          compare_period_ids: [],
          insufficientData: true,
        },
      },
    },
  ]);
  await expect(
    page.getByText("Belum ada audit untuk layanan dan periode ini", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("0 per 100 sesi sampel")).toHaveCount(0);
  await waitForMockedApi(audit, ["/tna/parameters?"]);
  expectHermetic(audit);
  await page.unrouteAll();
  const second = await openTna(page, parameterUrl, [
    {
      method: "GET",
      path: "/api/v1/tna/parameters/detail",
      body: {
        success: true,
        data: { ...detail, metrics: { ...metrics, findings: 0 } },
      },
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Simpan validasi" }),
  ).toBeDisabled();
  await waitForMockedApi(second, ["/tna/parameters/detail"]);
  expectHermetic(second);
});

test("kosong dan gagal dapat dicoba lagi", async ({ page }) => {
  const response = {
    success: false,
    error: { message: "Gagal memuat parameter" },
    data: undefined as unknown,
  };
  const audit = await openTna(page, "/tna", [
    { method: "GET", path: /\/tna\/parameters\?/, body: response },
  ]);
  await expect(page.getByRole("alert")).toContainText("Gagal memuat parameter");
  response.success = true;
  response.data = {
    items: [],
    selected_audit_status: "audited",
    compare_period_ids: [],
    insufficientData: true,
  };
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(
    page.getByText("Tidak ada parameter untuk filter ini"),
  ).toBeVisible();
  await expect(
    page.getByText("Data belum cukup untuk kesimpulan kuat."),
  ).toHaveCount(0);
  await waitForMockedApi(audit, ["/tna/parameters?"]);
  expectHermetic(audit);
});

for (const width of [1440, 390]) {
  test(`responsif ${width}: navigasi dan screenshot`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const audit = await openTna(page, parameterUrl);
    await expect(
      page.getByRole("heading", { name: "Ketelitian verifikasi" }),
    ).toBeVisible({ timeout: 20000 });
    if (width < 1024) {
      await page.getByRole("button", { name: "Lainnya" }).click();
      await expect(
        page.getByRole("link", { name: "TNA", exact: true }).last(),
      ).toHaveAttribute("aria-current", "page");
      await page.getByRole("link", { name: "TNA", exact: true }).last().click();
      await page.goto(parameterUrl);
      await expect(
        page.getByRole("heading", {
          name: "Ketelitian verifikasi",
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const device = width === 390 ? "mobile" : "desktop";
    await page.screenshot({
      path: `../../plans/markdown/tna-phase-1-t5-${device}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Simpan validasi" })
      .scrollIntoViewIfNeeded();
    expect(
      await page
        .getByRole("button", { name: "Simpan validasi" })
        .evaluate((el) => (el as HTMLElement).offsetHeight),
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `../../plans/markdown/tna-phase-1-t5-${device}-validasi.png`,
    });
    for (const [path, heading, artifact] of [
      ["/tna", "TNA", "daftar"],
      [`/tna/kebutuhan/${ids.need}`, "Kebutuhan pelatihan", "kebutuhan"],
      [`/tna/rencana/${ids.plan}`, "Latihan verifikasi data", "rencana"],
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      if (artifact === "kebutuhan")
        await expect(page.getByLabel("Judul rencana")).toBeVisible();
      if (artifact === "rencana")
        await expect(
          page.getByRole("button", { name: "Simpan perubahan" }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `../../plans/markdown/tna-phase-1-t5-${device}-${artifact}.png`,
      });
    }
    await testInfo.attach(`tna-${width}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await waitForMockedApi(audit, ["/tna/parameters/detail"]);
    expectHermetic(audit);
  });
}

test("memuat tetap eksplisit sebelum respons parameter tersedia", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as typeof window & { releaseTna: () => void }).releaseTna = () =>
      release();
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (String(args[0]).includes("/tna/parameters?")) await gate;
      return response;
    };
  });
  const audit = await openTna(page);
  await expect(page.getByText("Memuat data TNA…").first()).toBeVisible();
  await page.evaluate(() =>
    (window as typeof window & { releaseTna: () => void }).releaseTna(),
  );
  await expect(
    page.getByText("Tidak ada parameter untuk filter ini"),
  ).toBeVisible();
  await waitForMockedApi(audit, ["/tna/parameters?"]);
  expectHermetic(audit);
});

for (const width of [1440, 390]) {
  test(`leader ${width}: tanpa navigasi TNA dan route ditolak`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const audit = await openTna(page, "/tna", [], "leader", /\/unauthorized$/);
    await expect(page).toHaveURL(/\/unauthorized$/);
    await page.goto("/sidak");
    if (width < 1024)
      await page.getByRole("button", { name: "Lainnya" }).click();
    await expect(
      page.getByRole("link", { name: "TNA", exact: true }),
    ).toHaveCount(0);
    await waitForMockedApi(audit, ["/me/access-status"]);
    expectHermetic(audit);
  });
}
