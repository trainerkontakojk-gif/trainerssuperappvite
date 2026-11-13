import { expect, test } from "@playwright/test";
import type {
  EfekProgram,
  EfekReport,
  EfekSessionSummary,
  TnaPlanEfekSession,
} from "@trainers/types";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna, planDetail } from "./helpers/tnaHarness";

// EFEK ↔ TNA link UI (plans/markdown/efek-tna-plan-link.md). Hermetic shell;
// no backend, provider, or remote target.
test.beforeAll(() => assertLocalDevOnlyTarget());

const ok = (data: unknown) => ({ success: true, data });
const sessionId = "8f3a2b1c-0d4e-4f5a-8b6c-7d8e9f0a1b2c";
const linked: TnaPlanEfekSession = {
  id: sessionId,
  program_code: "ketik",
  title: "Level Up Week Oktober",
  start_date: "2026-10-10",
  end_date: "2026-10-11",
  participant_count: 1,
  roster_overlap: 1,
  status: "menunggu",
  mean_delta: null,
};
const activeDetail = planDetail("aktif");
const linkedDetail = {
  ...activeDetail,
  efek: { state: "ok" as const, sessions: [linked] },
};
const planOptions = [
  {
    id: ids.plan,
    title: activeDetail.plan.title,
    status: "aktif" as const,
    start_date: activeDetail.plan.start_date,
    end_date: activeDetail.plan.end_date,
    service_type: activeDetail.service_type,
    participant_ids: [ids.ana],
  },
];
const effectsReport: EfekReport = {
  data_until: { year: 2026, month: 9 },
  window: 3,
  include_proper_input: false,
  teams: ["Tim A"],
  years: [2026],
  programs: [
    {
      code: "ketik",
      name: "KETIK",
      service_type: "chat",
      participants: 1,
      evaluated: 0,
      pending: 1,
      naik: 0,
      stabil: 0,
      turun: 0,
      avg_delta: null,
      avg_relative_delta: null,
      median_delta: null,
      median_relative_delta: null,
      findings_per_session_before: null,
      findings_per_session_after: null,
    },
  ],
  sessions: [
    {
      id: sessionId,
      program_code: "ketik",
      title: "Level Up Week Oktober",
      service_type: "chat",
      start_date: "2026-10-10",
      end_date: "2026-10-11",
      participants: 1,
      evaluated: 0,
      avg_delta: null,
      status: "menunggu",
      months_after_closed: 0,
      first_after: { year: 2026, month: 11 },
      tna_plan: {
        id: ids.plan,
        title: activeDetail.plan.title,
        status: "dibatalkan",
      },
    } satisfies EfekSessionSummary,
  ],
};
const base = [
  { method: "GET" as const, path: "/api/v1/tna/efek/programs", body: ok([
    {
      code: "ketik",
      name: "KETIK",
      default_service_type: "chat",
      sort_order: 1,
    },
  ] satisfies EfekProgram[]) },
  {
    method: "GET" as const,
    path: /^\/api\/v1\/tna\/efek\/plan-options\?/,
    body: ok(planOptions),
  },
];

test("plan detail lists linked sessions and offers the prefilled session form", async ({
  page,
}) => {
  const audit = await openTna(page, `/tna/rencana/${ids.plan}`, [
    {
      method: "GET",
      path: `/api/v1/tna/plans/${ids.plan}`,
      body: ok(linkedDetail),
    },
    {
      method: "POST",
      path: "/api/v1/tna/efek/sessions",
      status: 201,
      body: ok({ id: sessionId }),
    },
    ...base,
  ]);
  const section = page.getByRole("region", { name: "Sesi kelas EFEK" });
  await expect(section).toBeVisible({ timeout: 20000 });
  await expect(section).toContainText("Level Up Week Oktober");
  await expect(section).toContainText(
    "1 dari 1 peserta rencana ikut sesi ini",
  );
  await expect(section).toContainText("Menunggu");
  await expect(section).toContainText(
    "Δ EFEK informatif, tidak memengaruhi verdict.",
  );

  await section.getByRole("link", { name: "Catat sesi pelatihan" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/tna/efek/sesi/baru\\?plan=${ids.plan}`),
  );
  await expect(page.getByLabel("Nama sesi")).toHaveValue(
    activeDetail.plan.title,
  );
  await expect(page.getByLabel("Layanan yang diukur")).toHaveValue("call");
  await expect(page.getByLabel("Tanggal mulai")).toHaveValue("2026-10-10");
  await expect(page.getByLabel("Rencana TNA (opsional)")).toHaveValue(
    ids.plan,
  );
  await expect(
    page.getByRole("button", { name: "Hapus Ana Contoh" }),
  ).toBeVisible();

  const create = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/tna/efek/sessions"),
  );
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  expect((await create).postDataJSON()).toEqual({
    program_code: "ketik",
    title: activeDetail.plan.title,
    service_type: "call",
    start_date: "2026-10-10",
    end_date: "2026-10-11",
    peserta_ids: [ids.ana],
    tna_plan_id: ids.plan,
  });
  // Returning to the plan shows the linked session, not a dead-end toast.
  await expect(page).toHaveURL(new RegExp(`/tna/rencana/${ids.plan}$`));
  await expect(
    page.getByRole("region", { name: "Sesi kelas EFEK" }),
  ).toContainText("Level Up Week Oktober");
  await waitForMockedApi(audit, [
    "GET /api/v1/tna/efek/plan-options",
    "POST /api/v1/tna/efek/sessions",
  ]);
  expectHermetic(audit);
});

test("editing an old session can link a plan and the EFEK list names it", async ({
  page,
}) => {
  const audit = await openTna(
    page,
    `/tna/efek/sesi/${sessionId}`,
    [
      {
        method: "GET",
        path: `/api/v1/tna/efek/sessions/${sessionId}`,
        body: ok({
          id: sessionId,
          program_code: "ketik",
          title: "Level Up Week Oktober",
          service_type: "chat",
          start_date: "2026-10-10",
          end_date: "2026-10-11",
          participant_count: 1,
          updated_at: "2026-10-19T10:00:00.000Z",
          tna_plan: null,
          participants: [{ peserta_id: ids.ana, nama: "Ana Contoh", tim: "Tim A" }],
        }),
      },
      {
        method: "PUT",
        path: `/api/v1/tna/efek/sessions/${sessionId}`,
        body: ok({ id: sessionId }),
      },
      ...base,
    ],
  );
  await expect(page.getByLabel("Rencana TNA (opsional)")).toHaveValue("");
  await page.getByLabel("Rencana TNA (opsional)").selectOption(ids.plan);
  const put = page.waitForRequest((r) => r.method() === "PUT");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  expect((await put).postDataJSON()).toMatchObject({ tna_plan_id: ids.plan });
  await waitForMockedApi(audit, ["PUT /api/v1/tna/efek/sessions"]);
  expectHermetic(audit);
});

test("the EFEK session table names the linked plan and marks a cancelled one", async ({ page }) => {
  const audit = await openTna(page, "/tna/efek", [
    { method: "GET", path: "/api/v1/tna/efek/report", body: ok(effectsReport) },
    ...base,
  ]);
  await expect(
    page.getByRole("region", { name: "Sesi pelatihan" }),
  ).toContainText(`Rencana: ${activeDetail.plan.title} · Dibatalkan`, {
    timeout: 20000,
  });
  expectHermetic(audit);
});

test("an unavailable EFEK section keeps the plan readable and offers retry", async ({
  page,
}) => {
  const audit = await openTna(page, `/tna/rencana/${ids.plan}`, [
    {
      method: "GET",
      path: `/api/v1/tna/plans/${ids.plan}`,
      body: ok({ ...activeDetail, efek: { state: "unavailable" } }),
    },
    ...base,
  ]);
  const section = page.getByRole("region", { name: "Sesi kelas EFEK" });
  await expect(section).toContainText(
    "Data sesi kelas belum bisa dimuat.",
    { timeout: 20000 },
  );
  await expect(section.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  // The rest of the plan still renders.
  await expect(page.getByText("Baseline beku")).toBeVisible();
  expectHermetic(audit);
});

test("a rejected plan link is explained on the plan field", async ({ page }) => {
  const audit = await openTna(page, `/tna/efek/sesi/baru?plan=${ids.plan}`, [
    {
      method: "GET",
      path: `/api/v1/tna/plans/${ids.plan}`,
      body: ok({ ...activeDetail, efek: { state: "ok", sessions: [] } }),
    },
    {
      method: "POST",
      path: "/api/v1/tna/efek/sessions",
      status: 422,
      body: {
        success: false,
        error: {
          code: "EFEK_PLAN_INVALID",
          message:
            "Rencana TNA tidak cocok: periksa status, layanan, dan tanggal sesi.",
        },
      },
    },
    ...base,
  ]);
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(
    page
      .locator('p[role="alert"]')
      .filter({ hasText: "Rencana TNA tidak cocok" }),
  ).toBeVisible({ timeout: 20000 });
  expectHermetic(audit);
});
for (const width of [390, 1280]) {
  test(`linked session section stays inside the viewport at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const audit = await openTna(page, `/tna/rencana/${ids.plan}`, [
      {
        method: "GET",
        path: `/api/v1/tna/plans/${ids.plan}`,
        body: ok(linkedDetail),
      },
      ...base,
    ]);
    await expect(
      page.getByRole("region", { name: "Sesi kelas EFEK" }),
    ).toContainText("Level Up Week Oktober", { timeout: 20000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expectHermetic(audit);
  });
}
