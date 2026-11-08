import { expect, test } from "@playwright/test";
import { expectHermetic, type ApiMock } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna } from "./helpers/tnaHarness";

const ok = (data: unknown) => ({ success: true, data });
const programs = [
  { code: "ketik", name: "KETIK", default_service_type: "chat", sort_order: 1 },
];
const base: ApiMock[] = [
  { method: "GET", path: "/api/v1/tna/efek/programs", body: ok(programs) },
  {
    method: "GET",
    path: "/api/v1/tna/efek/report",
    body: ok({
      data_until: { year: 2026, month: 10 },
      window: 3,
      include_proper_input: false,
      teams: [],
      years: [2026],
      programs: [],
      sessions: [],
    }),
  },
];
const csv = (name: string) => ({
  name: `${name}.csv`,
  mimeType: "text/csv",
  buffer: Buffer.from(
    `Program,Nama Sesi,Tanggal Mulai,Nama Peserta\nKETIK,Kelas ${name},2026-05-12,${name}\n`,
  ),
});
const match = (name: string) => ({
  name,
  status: "cocok",
  candidates: [
    {
      id: name === "Ana" ? ids.ana : ids.budi,
      nama: `${name} dari Profiler`,
      tim: "Tim A",
    },
  ],
});

test.beforeAll(() => assertLocalDevOnlyTarget());
test.setTimeout(90000);

test("EFEK latest file owns matching preview and imported payload", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek/impor", base);
  await expect(page.getByLabel("File daftar peserta")).toBeAttached({
    timeout: 20000,
  });
  let releaseOld!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let oldStarted = false;
  let submitted:
    { sessions: { peserta_ids: string[]; title: string }[] } | undefined;
  await page.route("**/api/v1/tna/efek/import/match", async (route) => {
    const name = route.request().postDataJSON().names[0] as string;
    if (name === "Ana") {
      oldStarted = true;
      await gate;
    }
    await route.fulfill({ json: ok({ items: [match(name)] }) });
  });
  await page.route("**/api/v1/tna/efek/import", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: ok({ session_ids: [ids.plan] }) });
  });
  try {
    await page.getByLabel("File daftar peserta").setInputFiles(csv("Ana"));
    await expect.poll(() => oldStarted).toBe(true);
    await page.getByLabel("File daftar peserta").setInputFiles(csv("Budi"));
    await expect(page.getByText(/^Budi dari Profiler/)).toBeVisible();
    const oldResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/import/match") &&
        response.request().postDataJSON().names[0] === "Ana",
    );
    releaseOld();
    await (await oldResponse).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByText(/^Budi dari Profiler/)).toBeVisible();
    await expect(page.getByText("Budi.csv", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Impor 1 peserta ke 1 sesi" })
      .click();
    await expect
      .poll(() => submitted?.sessions[0]?.peserta_ids)
      .toEqual([ids.budi]);
    expect(submitted?.sessions[0]?.title).toBe("Kelas Budi");
    await expect(page).toHaveURL(/\/tna\/efek$/);
    expectHermetic(audit);
  } finally {
    releaseOld();
  }
});

test("EFEK import freezes the file and preserves the preview after failure", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek/impor", [
    {
      method: "POST",
      path: "/api/v1/tna/efek/import/match",
      body: ok({ items: [match("Budi")] }),
    },
    ...base,
  ]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route("**/api/v1/tna/efek/import", async (route) => {
    writes++;
    await gate;
    await route.fulfill({
      status: 500,
      json: {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Impor belum berhasil. Coba lagi.",
        },
      },
    });
  });
  try {
    await expect(page.getByLabel("File daftar peserta")).toBeAttached({
      timeout: 20000,
    });
    await page.getByLabel("File daftar peserta").setInputFiles(csv("Budi"));
    await page
      .getByRole("button", { name: "Impor 1 peserta ke 1 sesi" })
      .click();
    await expect.poll(() => writes).toBe(1);
    await expect(page.getByLabel("File daftar peserta")).toBeDisabled();
    release();
    await expect(
      page.getByText("Impor belum berhasil. Coba lagi.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^Budi dari Profiler/)).toBeVisible();
    await expect(page.getByLabel("File daftar peserta")).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Impor 1 peserta ke 1 sesi" }),
    ).toBeEnabled();
    expectHermetic(audit);
  } finally {
    release();
  }
});
