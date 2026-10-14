import { expect, test } from "@playwright/test";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { evaluationDetail, ids, openTna } from "./helpers/tnaHarness";

const path = `/api/v1/tna/plans/${ids.plan}`;
const url = `/tna/rencana/${ids.plan}`;
test.beforeAll(() => assertLocalDevOnlyTarget());

for (const width of [1440, 390]) {
  test(`evaluasi ${width}: jatuh tempo → mulai → periode → selesai → validasi ulang`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const current = { success: true, data: evaluationDetail("aktif") };
    const audit = await openTna(page, "/tna", [
      {
        method: "GET",
        path: /\/tna\/plans\?due=1$/,
        body: { success: true, data: { items: [current.data.plan] } },
      },
      { method: "GET", path, body: current },
      {
        method: "POST",
        path: `${path}/start-evaluation`,
        body: { success: true, data: {} },
      },
      {
        method: "PATCH",
        path: `${path}/evaluation`,
        body: { success: true, data: {} },
      },
      {
        method: "POST",
        path: `${path}/complete`,
        body: { success: true, data: {} },
      },
    ]);
    const due = page.getByRole("region", { name: "Perlu dievaluasi" });
    await expect(
      due.getByText("Jatuh tempo 11 November 2026 (WIB)", { exact: true }),
    ).toBeVisible();
    await due.getByRole("link", { name: /Latihan verifikasi data/ }).click();
    await page
      .getByRole("button", { name: "Mulai evaluasi", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Periode evaluasi")).toHaveValue(
      ids.evaluation,
    );
    current.data = evaluationDetail();
    const start = page.waitForRequest(
      (r) => r.url().endsWith("/start-evaluation") && r.method() === "POST",
    );
    await dialog.getByRole("button", { name: "Ya, mulai evaluasi" }).click();
    expect((await start).postDataJSON()).toEqual({
      evaluation_period_id: ids.evaluation,
      expected_updated_at: current.data.plan.updated_at,
    });
    await expect(
      page.getByText("Status: Evaluasi", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Data QA periode baseline berubah sejak aktivasi", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Tidak diaudit", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("1 per 100 sesi sampel", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("heading", { name: "Evaluasi pasca-training", exact: true })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect(page.getByLabel("Periode evaluasi")).toBeVisible();
    expect(
      await page
        .getByLabel("Periode evaluasi")
        .evaluate((el) => (el as HTMLElement).offsetHeight),
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: testInfo.outputPath(
        `tna-phase-2-${width === 390 ? "mobile" : "desktop"}-evaluasi.png`,
      ),
    });
    await page
      .getByRole("heading", { name: "Evaluasi per peserta", exact: true })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: testInfo.outputPath(
        `tna-phase-2-${width === 390 ? "mobile" : "desktop"}-peserta.png`,
      ),
    });
    await page.getByLabel("Periode evaluasi").selectOption(ids.later);
    const patch = page.waitForRequest(
      (r) => r.method() === "PATCH" && r.url().endsWith("/evaluation"),
    );
    current.data = evaluationDetail();
    current.data.plan.evaluation_period_id = ids.later;
    current.data.evaluation!.evaluation_period_id = ids.later;
    current.data.evaluation!.population = {
      ...current.data.evaluation!.population,
      periodId: ids.later,
      auditStatus: "no_audit",
      ratePer100: null,
      spreadPct: null,
    };
    current.data.evaluation!.verdict = null;
    await page.getByRole("button", { name: "Ganti periode" }).click();
    expect((await patch).postDataJSON()).toEqual({
      evaluation_period_id: ids.later,
      expected_updated_at: current.data.plan.updated_at,
    });
    await expect(page.getByLabel("Periode evaluasi")).toHaveValue(ids.later);
    await expect(
      page.getByRole("button", { name: "Selesaikan", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Periode evaluasi").selectOption(ids.evaluation);
    current.data = evaluationDetail();
    await page.getByRole("button", { name: "Ganti periode" }).click();
    await expect(page.getByLabel("Periode evaluasi")).toHaveValue(
      ids.evaluation,
    );
    await page
      .getByLabel("Kesimpulan evaluasi")
      .fill("Hasil evaluasi sudah diperiksa trainer.");
    await page
      .getByLabel("Tindak lanjut")
      .selectOption("perlu_rencana_lanjutan");
    await page.getByRole("button", { name: "Selesaikan", exact: true }).click();
    await expect(dialog).toContainText(
      "Hasil evaluasi dan peserta akan dibekukan",
    );
    current.data = evaluationDetail("selesai");
    const complete = page.waitForRequest(
      (r) => r.url().endsWith("/complete") && r.method() === "POST",
    );
    await dialog.getByRole("button", { name: "Ya, selesaikan" }).click();
    expect((await complete).postDataJSON()).toEqual({
      conclusion_note: "Hasil evaluasi sudah diperiksa trainer.",
      follow_up: "perlu_rencana_lanjutan",
      expected_updated_at: current.data.plan.updated_at,
    });
    await expect(
      page.getByText("Status: Selesai", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Hasil evaluasi beku" }),
    ).toBeVisible();
    await expect(
      page.getByText(current.data.evaluation_narrative!, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Periode evaluasi")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Batalkan", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("heading", { name: "Ringkasan Evaluasi", exact: true })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: testInfo.outputPath(
        `tna-phase-2-${width === 390 ? "mobile" : "desktop"}-selesai.png`,
      ),
    });
    await page.getByRole("link", { name: "Validasi ulang parameter" }).click();
    await expect(page).toHaveURL(
      new RegExp(`period=${ids.evaluation}.*previous_plan=${ids.plan}`),
    );
    await page
      .getByLabel("Catatan penyebab")
      .fill("Validasi lanjutan berdasarkan hasil evaluasi.");
    const create = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/tna/needs"),
    );
    await page.getByRole("button", { name: "Simpan validasi" }).click();
    expect((await create).postDataJSON()).toMatchObject({
      previous_plan_id: ids.plan,
      period_id: ids.evaluation,
      indicator_id: ids.indicator,
      service_type: "call",
      compare_count: 2,
    });
    await waitForMockedApi(audit, [
      "due=1",
      "/start-evaluation",
      "PATCH",
      "/complete",
      "POST /api/v1/tna/needs",
    ]);
    expectHermetic(audit);
  });
}

test("belum jatuh tempo dan periode kosong tidak menawarkan mulai", async ({
  page,
}) => {
  const d = evaluationDetail("aktif");
  d.plan.evaluation_due = false;
  const current = { success: true, data: d };
  const audit = await openTna(page, url, [
    { method: "GET", path, body: current },
  ]);
  await expect(
    page.getByText("Evaluasi dijadwalkan 11 November 2026 (WIB).", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mulai evaluasi", exact: true }),
  ).toHaveCount(0);
  d.plan.evaluation_due = true;
  d.evaluation_period_options = [];
  await page.reload();
  await expect(
    page.getByText("Belum ada periode evaluasi yang tersedia", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mulai evaluasi", exact: true }),
  ).toBeDisabled();
  await waitForMockedApi(audit, [path]);
  expectHermetic(audit);
});

for (const status of [409, 422, 503]) {
  test(`complete ${status}: tidak berpura-pura selesai; pemulihan eksplisit`, async ({
    page,
  }) => {
    const current = { success: true, data: evaluationDetail() };
    const message =
      status === 422
        ? "Belum ada audit pada periode evaluasi."
        : "Evaluasi gagal disimpan. Coba lagi.";
    const audit = await openTna(page, url, [
      { method: "GET", path, body: current },
      {
        method: "POST",
        path: `${path}/complete`,
        status,
        body: { success: false, error: { code: "TNA_ERROR", message } },
      },
    ]);
    await page
      .getByLabel("Kesimpulan evaluasi")
      .fill("Kesimpulan untuk evaluasi peserta.");
    await page.getByRole("button", { name: "Selesaikan", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Ya, selesaikan" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      status === 409 ? "Rencana sudah berubah, muat ulang" : message,
    );
    await expect(
      page.getByText("Status: Evaluasi", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toBeInViewport();
    if (status === 409) {
      await expect(
        page.getByRole("button", { name: "Selesaikan", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Ganti periode" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Batalkan", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Muat ulang", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveCount(0);
    } else {
      await expect(page.getByLabel("Kesimpulan evaluasi")).toHaveValue(
        "Kesimpulan untuk evaluasi peserta.",
      );
      await expect(
        page.getByRole("button", { name: "Selesaikan", exact: true }),
      ).toBeEnabled();
    }
    await waitForMockedApi(audit, ["/complete"]);
    expectHermetic(audit);
  });
}

for (const state of ["aktif", "evaluasi"] as const) {
  test(`cancel ${state}: alasan wajib dan hanya metadata dikirim`, async ({
    page,
  }) => {
    const current = { success: true, data: evaluationDetail(state) };
    const audit = await openTna(page, url, [
      { method: "GET", path, body: current },
    ]);
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Ya, batalkan" }),
    ).toBeDisabled();
    await dialog
      .getByLabel("Alasan pembatalan")
      .fill("Jadwal pelatihan perlu disusun ulang.");
    current.data = evaluationDetail("dibatalkan");
    const cancel = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/cancel"),
    );
    await dialog.getByRole("button", { name: "Ya, batalkan" }).click();
    expect((await cancel).postDataJSON()).toEqual({
      cancel_reason: "Jadwal pelatihan perlu disusun ulang.",
      expected_updated_at: current.data.plan.updated_at,
    });
    await expect(
      page.getByText("Status: Dibatalkan", { exact: true }),
    ).toBeVisible();
    await waitForMockedApi(audit, ["/cancel"]);
    expectHermetic(audit);
  });
}

test("daftar perlu dievaluasi: gagal, coba lagi, lalu kosong", async ({
  page,
}) => {
  const response = {
    success: false,
    error: { message: "Gagal memuat daftar evaluasi" },
    data: undefined as unknown,
  };
  const audit = await openTna(page, "/tna", [
    { method: "GET", path: /\/tna\/plans\?due=1$/, body: response },
  ]);
  const region = page.getByRole("region", { name: "Perlu dievaluasi" });
  await expect(region.getByRole("alert")).toContainText(
    "Gagal memuat daftar evaluasi",
  );
  response.success = true;
  response.data = { items: [] };
  await region.getByRole("button", { name: "Coba lagi" }).click();
  await expect(
    region.getByText("Tidak ada rencana yang perlu dievaluasi"),
  ).toBeVisible();
  await waitForMockedApi(audit, ["due=1"]);
  expectHermetic(audit);
});

test("evaluasi no_audit dan pembanding kecil tidak ditampilkan sebagai nol", async ({
  page,
}) => {
  const d = evaluationDetail();
  d.evaluation!.population = {
    ...d.evaluation!.population,
    auditStatus: "no_audit",
    ratePer100: null,
    spreadPct: null,
  };
  d.evaluation!.cohorts.comparison_small = true;
  d.evaluation!.cohorts.net_effect = null;
  d.evaluation!.verdict = null;
  const audit = await openTna(page, url, [
    { method: "GET", path, body: { success: true, data: d } },
  ]);
  await expect(
    page.getByText("Kelompok pembanding terlalu kecil untuk dibandingkan.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Selesaikan", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Efek bersih", { exact: true })).toHaveCount(0);
  await waitForMockedApi(audit, [path]);
  expectHermetic(audit);
});

test("periode belum disimpan tidak boleh menyelesaikan periode lama", async ({
  page,
}) => {
  const audit = await openTna(page, url, [
    { method: "GET", path, body: { success: true, data: evaluationDetail() } },
  ]);
  await page
    .getByLabel("Kesimpulan evaluasi")
    .fill("Kesimpulan berdasarkan hasil evaluasi.");
  await expect(
    page.getByRole("button", { name: "Selesaikan", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Periode evaluasi").selectOption(ids.later);
  await expect(
    page.getByRole("button", { name: "Selesaikan", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Periode evaluasi").selectOption(ids.evaluation);
  await expect(
    page.getByRole("button", { name: "Selesaikan", exact: true }),
  ).toBeEnabled();
  await waitForMockedApi(audit, [path]);
  expectHermetic(audit);
});

test("detail evaluasi memuat: aksi belum tersedia sebelum respons", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (
      window as typeof window & { releaseEvaluation: () => void }
    ).releaseEvaluation = () => release();
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (String(args[0]).includes("/tna/plans/")) await gate;
      return response;
    };
  });
  const audit = await openTna(page, url, [
    { method: "GET", path, body: { success: true, data: evaluationDetail() } },
  ]);
  await expect(
    page.getByText("Memuat data TNA…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Selesaikan", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as typeof window & { releaseEvaluation: () => void }
    ).releaseEvaluation(),
  );
  await expect(
    page.getByText("Status: Evaluasi", { exact: true }),
  ).toBeVisible();
  await waitForMockedApi(audit, [path]);
  expectHermetic(audit);
});

for (const role of ["leader", "agent"]) {
  test(`${role}: route evaluasi ditolak`, async ({ page }) => {
    const audit = await openTna(page, url, [], role, /\/unauthorized$/);
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect.poll(() => audit.mockedAuth.length).toBeGreaterThan(0);
    expect(
      audit.mockedApi.filter((request) => request.includes("/tna/")),
    ).toEqual([]);
    expectHermetic(audit);
  });
}
