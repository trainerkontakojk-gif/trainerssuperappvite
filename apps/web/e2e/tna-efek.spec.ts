import { expect, test } from "@playwright/test";
import type {
  EfekParticipantResult,
  EfekProgram,
  EfekProgramReport,
  EfekProgramSummary,
  EfekReport,
  EfekSession,
  EfekSessionSummary,
} from "@trainers/types";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna } from "./helpers/tnaHarness";

// EFEK screens (plans/markdown/efek.md): TNA tab, report, session form, import.
test.beforeAll(() => assertLocalDevOnlyTarget());

const ok = (data: unknown) => ({ success: true, data });
const programs: EfekProgram[] = [
  { code: "ketik", name: "KETIK", default_service_type: "chat", sort_order: 1 },
  { code: "pdkt", name: "PDKT", default_service_type: "email", sort_order: 2 },
  {
    code: "telefun",
    name: "Telefun",
    default_service_type: "call",
    sort_order: 3,
  },
  {
    code: "ceriwis",
    name: "CERIWIS",
    default_service_type: "cso",
    sort_order: 4,
  },
];
const sessionId = "8f3a2b1c-0d4e-4f5a-8b6c-7d8e9f0a1b2c";
const sessions: EfekSession[] = [
  {
    id: sessionId,
    program_code: "ketik",
    title: "Level Up Week Mei",
    service_type: "chat",
    start_date: "2026-05-12",
    end_date: "2026-05-16",
    participant_count: 2,
    updated_at: "2026-10-19T10:00:00.000Z",
  },
  {
    id: "9a4b3c2d-1e5f-4a6b-9c7d-8e9f0a1b2c3d",
    program_code: "pdkt",
    title: "Level Up Week Juli",
    service_type: "email",
    start_date: "2026-07-14",
    end_date: "2026-07-14",
    participant_count: 4,
    updated_at: "2026-10-19T10:00:00.000Z",
  },
];
const summary = (
  p: EfekProgram,
  patch: Partial<EfekProgramSummary> = {},
): EfekProgramSummary => ({
  code: p.code,
  name: p.name,
  service_type: p.default_service_type,
  participants: 0,
  evaluated: 0,
  pending: 0,
  naik: 0,
  stabil: 0,
  turun: 0,
  avg_delta: null,
  avg_relative_delta: null,
  findings_per_session_before: null,
  findings_per_session_after: null,
  ...patch,
});
const sessionSummaries: EfekSessionSummary[] = [
  {
    ...sessions[0]!,
    participants: 2,
    evaluated: 2,
    avg_delta: 1.75,
    status: "terukur",
    months_after_closed: 3,
    first_after: { year: 2026, month: 6 },
  },
  {
    ...sessions[1]!,
    participants: 4,
    evaluated: 0,
    avg_delta: null,
    status: "menunggu",
    months_after_closed: 0,
    first_after: { year: 2026, month: 11 },
  },
];
const ketikSummary = summary(programs[0]!, {
  participants: 2,
  evaluated: 2,
  naik: 1,
  stabil: 1,
  avg_delta: 1.75,
  avg_relative_delta: 0.75,
  findings_per_session_before: 1.45,
  findings_per_session_after: 0.64,
});
const report: EfekReport = {
  data_until: { year: 2026, month: 9 },
  window: 3,
  teams: ["Tim A", "Tim B"],
  years: [2026],
  programs: [
    ketikSummary,
    summary(programs[1]!, { participants: 4, pending: 4 }),
    summary(programs[2]!),
    summary(programs[3]!),
  ],
  sessions: sessionSummaries,
};
const months = (scores: (number | null)[]) =>
  scores.map((score, i) => ({
    year: 2026,
    month: i + 2,
    offset: i - 3,
    score,
    sessions: score === null ? 0 : 3,
    findings: score === null ? 0 : 2,
    comparison_score: 82,
  }));
const participant = (
  patch: Partial<EfekParticipantResult>,
): EfekParticipantResult => ({
  session_id: sessionId,
  peserta_id: ids.ana,
  nama: "Ana Contoh",
  tim: "Tim A",
  session_title: "Level Up Week Mei",
  service_type: "chat",
  start_date: "2026-05-12",
  end_date: "2026-05-16",
  months_before: 3,
  months_after: 3,
  sessions_before: 9,
  sessions_after: 9,
  findings_before: 12,
  findings_after: 3,
  score_before: 91,
  score_after: 95,
  findings_per_session_before: 1.33,
  findings_per_session_after: 0.33,
  delta: 4,
  comparison_delta: 1,
  relative_delta: 3,
  status: "naik",
  thin: false,
  months: months([90, 91, 92, 50, 94, 95, 96]),
  ...patch,
});
const programReport: EfekProgramReport = {
  data_until: report.data_until,
  window: 3,
  teams: report.teams,
  years: report.years,
  program: ketikSummary,
  sessions: [sessionSummaries[0]!],
  chart: [-3, -2, -1, 0, 1, 2, 3].map((offset) => ({
    offset,
    score: 90 + offset,
    comparison_score: 82,
    findings_per_session: 1.4,
    comparison_findings_per_session: 1,
  })),
  participants: [
    participant({
      peserta_id: ids.budi,
      nama: "Budi Contoh",
      months_before: 1,
      months_after: 1,
      score_before: 90,
      score_after: 89.5,
      delta: -0.5,
      relative_delta: -1.5,
      status: "stabil",
      thin: true,
      months: months([null, null, 90, null, 89.5, null, null]),
    }),
    participant({}),
  ],
};
const efekMocks = [
  {
    method: "GET" as const,
    path: "/api/v1/tna/efek/programs",
    body: ok(programs),
  },
  {
    method: "GET" as const,
    path: "/api/v1/tna/efek/report/ketik",
    body: ok(programReport),
  },
  {
    method: "GET" as const,
    path: "/api/v1/tna/efek/report",
    body: ok(report),
  },
  {
    method: "GET" as const,
    path: `/api/v1/tna/efek/sessions/${sessionId}`,
    body: ok({
      ...sessions[0],
      participants: [
        { peserta_id: ids.ana, nama: "Ana Contoh", tim: "Tim A" },
        { peserta_id: ids.budi, nama: "Budi Contoh", tim: "Tim A" },
      ],
    }),
  },
  {
    method: "POST" as const,
    path: "/api/v1/tna/efek/sessions",
    status: 201,
    body: ok({ id: sessionId }),
  },
  {
    method: "PUT" as const,
    path: `/api/v1/tna/efek/sessions/${sessionId}`,
    body: ok({ id: sessionId }),
  },
  {
    method: "DELETE" as const,
    path: `/api/v1/tna/efek/sessions/${sessionId}`,
    body: ok({ id: sessionId }),
  },
];

test("trainer membuka EFEK dari TNA dan membuat sesi CERIWIS yang diukur dari CSO", async ({
  page,
}) => {
  const audit = await openTna(
    page,
    "/tna",
    efekMocks,
    "trainer",
    /\/tna(?:\?|$)/,
  );
  await page.getByRole("link", { name: "EFEK", exact: true }).first().click();
  await expect(page).toHaveURL(/\/tna\/efek$/);
  await expect(
    page.getByRole("heading", {
      name: "EFEK · Evaluasi Efektivitas dan Kinerja",
    }),
  ).toBeVisible();
  const cards = page.getByRole("region", { name: "Program pelatihan" });
  await expect(cards.getByRole("article")).toHaveCount(4);
  await expect(cards.getByRole("article").nth(0)).toContainText(
    "1 sesi · 2 peserta",
  );
  await expect(cards.getByRole("article").nth(3)).toContainText("CSO");
  await expect(cards.getByRole("article").nth(3)).toContainText(
    "Belum ada sesi pelatihan.",
  );
  const table = page.getByRole("region", { name: "Sesi pelatihan" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await table.getByLabel("Program").selectOption("pdkt");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Level Up Week Juli");
  await expect(table).toContainText("Menunggu November 2026");

  await cards.getByRole("link", { name: "+ Sesi CERIWIS" }).click();
  await expect(page).toHaveURL(/\/tna\/efek\/sesi\/baru\?program=ceriwis/);
  await expect(
    page.getByRole("heading", { name: "Sesi pelatihan baru" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel("Program")).toHaveValue("ceriwis");
  await expect(page.getByLabel("Layanan yang diukur")).toHaveValue("cso");
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("alert")).toContainText("minimal 1");
  await page.getByLabel("Nama sesi").fill("Level Up Week September");
  await page.getByLabel("Tanggal mulai").fill("2026-09-15");
  await expect(page.getByLabel("Tanggal selesai")).toHaveValue("2026-09-15");
  await page.getByLabel("Tanggal selesai").fill("2026-09-19");
  await page.getByLabel("Cari peserta").fill("Budi");
  await page.getByRole("button", { name: "Tambah Budi Contoh" }).click();
  const create = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/tna/efek/sessions"),
  );
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  expect((await create).postDataJSON()).toEqual({
    program_code: "ceriwis",
    title: "Level Up Week September",
    service_type: "cso",
    start_date: "2026-09-15",
    end_date: "2026-09-19",
    peserta_ids: [ids.budi],
  });
  await expect(page).toHaveURL(/\/tna\/efek\?program=ceriwis/);
  await waitForMockedApi(audit, [
    "GET /api/v1/tna/efek/programs",
    "POST /api/v1/tna/efek/sessions",
  ]);
  expectHermetic(audit);
});

test("trainer mengubah peserta sesi lalu menghapusnya setelah konfirmasi", async ({
  page,
}) => {
  const audit = await openTna(page, `/tna/efek/sesi/${sessionId}`, efekMocks);
  await expect(page.getByLabel("Nama sesi")).toHaveValue("Level Up Week Mei");
  await expect(page.getByLabel("Layanan yang diukur")).toHaveValue("chat");
  await page.getByRole("button", { name: "Hapus Ana Contoh" }).click();
  const put = page.waitForRequest((r) => r.method() === "PUT");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  expect((await put).postDataJSON()).toMatchObject({
    program_code: "ketik",
    service_type: "chat",
    peserta_ids: [ids.budi],
  });
  await expect(page).toHaveURL(/\/tna\/efek\?program=ketik/);

  await page
    .getByRole("link", { name: "Level Up Week Mei", exact: true })
    .click();
  await page.getByRole("button", { name: "Hapus sesi" }).click();
  await expect(page.getByText('Hapus sesi "Level Up Week Mei"?')).toBeVisible();
  await page.getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Hapus sesi" }).click();
  const del = page.waitForRequest((r) => r.method() === "DELETE");
  await page.getByRole("button", { name: "Ya, hapus" }).click();
  expect((await del).url()).toContain(`/tna/efek/sessions/${sessionId}`);
  await expect(page).toHaveURL(/\/tna\/efek$/);
  await waitForMockedApi(audit, [
    "PUT /api/v1/tna/efek",
    "DELETE /api/v1/tna/efek",
  ]);
  expectHermetic(audit);
});

test("impor CSV mencocokkan nama, meminta pilihan, dan mengelompokkan sesi", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek/impor", [
    {
      method: "POST",
      path: "/api/v1/tna/efek/import/match",
      body: ok({
        items: [
          {
            name: "Ana Contoh",
            status: "cocok",
            candidates: [{ id: ids.ana, nama: "Ana Contoh", tim: "Tim A" }],
          },
          {
            name: "Budi C.",
            status: "pilih",
            candidates: [
              { id: ids.budi, nama: "Budi Contoh", tim: "Tim A" },
              { id: ids.plan, nama: "Budi Cahyono", tim: "Tim B" },
            ],
          },
          { name: "Orang Asing", status: "tidak_ditemukan", candidates: [] },
        ],
      }),
    },
    {
      method: "POST",
      path: "/api/v1/tna/efek/import",
      status: 201,
      body: ok({ session_ids: [sessionId] }),
    },
    ...efekMocks,
  ]);
  const csv = [
    "Program,Nama Sesi,Tanggal Mulai,Nama Peserta",
    "KETIK,Level Up Week Mei,2026-05-12,Ana Contoh",
    "ketik,level up week mei,2026-05-12,Budi C.",
    "Telefun,,Agustus 2026,Orang Asing",
    "Ceriwis,Kelas CSO,15/09/2026,Ana Contoh",
    "Asing,Sesi X,2026-05-01,Siapa",
  ].join("\n");
  const match = page.waitForRequest((r) => r.url().endsWith("/import/match"));
  await page.getByLabel("File daftar peserta").setInputFiles({
    name: "peserta.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  expect((await match).postDataJSON()).toEqual({
    names: ["Ana Contoh", "Budi C.", "Orang Asing"],
  });
  await expect(
    page.getByText("1 baris tidak bisa dibaca dan dilewati"),
  ).toBeVisible();
  await expect(page.getByText('Program "Asing" tidak dikenal.')).toBeVisible();
  await expect(page.getByText("1 cocok", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 perlu dipilih", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 tidak ditemukan", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Tidak ada di Profiler · dilewati"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Impor 2 peserta ke 2 sesi" }),
  ).toBeVisible();
  await page.getByLabel("Pilih peserta untuk Budi C.").selectOption(ids.budi);
  const commit = page.waitForRequest((r) =>
    r.url().endsWith("/tna/efek/import"),
  );
  await page.getByRole("button", { name: "Impor 3 peserta ke 2 sesi" }).click();
  expect((await commit).postDataJSON()).toEqual({
    sessions: [
      {
        program_code: "ketik",
        title: "Level Up Week Mei",
        service_type: "chat",
        start_date: "2026-05-12",
        end_date: "2026-05-12",
        peserta_ids: [ids.ana, ids.budi],
      },
      {
        program_code: "ceriwis",
        title: "Kelas CSO",
        service_type: "cso",
        start_date: "2026-09-15",
        end_date: "2026-09-15",
        peserta_ids: [ids.ana],
      },
    ],
  });
  await expect(page).toHaveURL(/\/tna\/efek$/);
  await waitForMockedApi(audit, [
    "/import/match",
    "POST /api/v1/tna/efek/import",
  ]);
  expectHermetic(audit);
});

test("CERIWIS labels the baseline as the CSO service average", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek/program/ceriwis", [
    {
      method: "GET",
      path: "/api/v1/tna/efek/report/ceriwis",
      body: ok({
        ...programReport,
        program: summary(programs[3]!, { participants: 2 }),
      }),
    },
    ...efekMocks,
  ]);
  await expect(
    page.locator("figure span").filter({ hasText: /^Rata-rata layanan CSO$/ }),
  ).toHaveCount(2);
  await waitForMockedApi(audit, ["GET /api/v1/tna/efek/report/ceriwis"]);
  expectHermetic(audit);
});

test("leader tidak bisa membuka EFEK", async ({ page }) => {
  await openTna(page, "/tna/efek", efekMocks, "leader");
  await expect(page).not.toHaveURL(/\/tna\/efek/);
  await expect(page.getByRole("heading", { name: /EFEK/ })).toHaveCount(0);
});

test("ringkasan EFEK menampilkan efek per program dan rincian peserta KETIK", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek", efekMocks);
  await expect(
    page.getByText("Data SIDAK sampai September 2026"),
  ).toBeVisible();
  const ketik = page
    .getByRole("region", { name: "Program pelatihan" })
    .getByRole("article")
    .first();
  await expect(ketik).toContainText("+1,8");
  await expect(ketik).toContainText("1 / 1 / 0");
  await expect(ketik).toContainText("2 dari 2");
  await expect(ketik).toContainText("1,5 → 0,6");
  await expect(
    page.getByText("4 peserta belum bisa dinilai", { exact: false }),
  ).toBeVisible();
  const table = page.getByRole("region", { name: "Sesi pelatihan" });
  await expect(table.getByRole("row").nth(1)).toContainText("Terukur");

  const widened = page.waitForRequest((r) =>
    r.url().includes("/tna/efek/report?window=6"),
  );
  await page.getByLabel("Jendela banding").selectOption("6");
  await widened;
  await expect(page).toHaveURL(/window=6/);

  await ketik.getByRole("link", { name: "Rincian KETIK" }).click();
  await expect(page).toHaveURL(/\/tna\/efek\/program\/ketik\?window=6/);
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText("Skor QA rata-rata, dihitung dari bulan pelatihan").first(),
  ).toBeVisible();
  await expect(
    page.locator("figure span").filter({ hasText: /^Rata-rata layanan Chat$/ }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Δ relatif rata-rata layanan", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Garis putus-putus = rata-rata semua agent Chat yang diaudit pada bulan yang sama, termasuk peserta.",
      { exact: false },
    ),
  ).toBeVisible();
  const people = page.getByRole("region", { name: "Peserta" });
  const rows = people.locator("tbody > tr");
  await expect(rows.first()).toContainText("Ana Contoh");
  await expect(rows.first()).toContainText("+4,0");
  await expect(rows.first()).toContainText("Naik");
  await expect(rows.nth(1)).toContainText("Data tipis");
  await expect(rows.nth(1)).toContainText("−0,5");
  await people.getByRole("button", { name: "Δ skor" }).click();
  await expect(rows.first()).toContainText("Budi Contoh");

  await people.getByRole("button", { name: /Ana Contoh/ }).click();
  const monthly = people.getByRole("table", {
    name: "Rincian bulanan Ana Contoh",
  });
  await expect(monthly).toBeVisible();
  await expect(
    monthly.getByRole("columnheader", {
      name: "Rata-rata layanan",
      exact: true,
    }),
  ).toBeVisible();
  await expect(monthly.getByRole("row").nth(1)).toContainText("Februari 2026");
  await expect(monthly.getByRole("row").nth(4)).toContainText(
    "Bulan pelatihan",
  );

  const scoped = page.waitForResponse((r) =>
    r.url().includes(`/tna/efek/report/ketik?window=6&session=${sessionId}`),
  );
  await page.getByLabel(/^Sesi/).selectOption(sessionId);
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}`));
  await scoped;
  await waitForMockedApi(audit, [
    "GET /api/v1/tna/efek/report",
    "GET /api/v1/tna/efek/report/ketik",
  ]);
  expectHermetic(audit);
});

test("rincian program di ponsel menampilkan peserta sebagai kartu tanpa geser samping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const audit = await openTna(page, "/tna/efek/program/ketik", efekMocks);
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("region", { name: "Peserta" }).getByText("Ana Contoh"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expectHermetic(audit);
});

for (const width of [390, 1280])
  test(`pengecualian agent transparan, dapat dipulihkan, dan ikut ekspor (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light" });
    const reason = "Audit <perlu> ditinjau";
    const adjusted: EfekProgramReport = {
      ...programReport,
      program: {
        ...ketikSummary,
        participants: 1,
        evaluated: 1,
        stabil: 0,
        avg_delta: 4,
      },
      analysis: {
        all_participants: ketikSummary,
        exclusions: [{ peserta_id: ids.budi, nama: "Budi Contoh", reason }],
      },
      participants: programReport.participants.map((p) =>
        p.peserta_id === ids.budi ? { ...p, exclusion_reason: reason } : p,
      ),
    };
    const audit = await openTna(page, "/tna/efek/program/ketik", [
      {
        method: "GET",
        path: /\/api\/v1\/tna\/efek\/report\/ketik\?.*exclusions=/,
        body: ok(adjusted),
      },
      ...efekMocks,
    ]);
    const filter = page.getByRole("region", { name: "Pengecualian analisis" });
    await expect(filter).toBeVisible();
    await filter.getByLabel("Agent").selectOption(ids.budi);
    const apply = filter.getByRole("button", {
      name: "Kecualikan dari analisis",
    });
    await expect(apply).toBeDisabled();
    await filter.getByLabel("Alasan pengecualian").fill("   ");
    await expect(apply).toBeDisabled();
    await filter.getByLabel("Alasan pengecualian").fill(reason);
    await filter.getByLabel("Alasan pengecualian").press("Tab");
    await expect(apply).toBeFocused();
    await apply.press("Enter");
    await expect(page).toHaveURL(/exclusions=/);
    const comparison = page.getByRole("region", {
      name: "Perbandingan analisis",
    });
    await expect(comparison).toContainText("Semua peserta");
    await expect(comparison).toContainText("+1,8");
    await expect(comparison).toContainText("+4,0");
    await expect(filter).toContainText(reason);
    await expect(page.getByRole("region", { name: "Peserta" })).toContainText(
      "Dikecualikan",
    );
    await page.reload();
    await expect(filter).toContainText(reason);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh laporan" }).click();
    const html = await (
      await (await download).createReadStream()
    )
      .toArray()
      .then((parts) => Buffer.concat(parts).toString("utf8"));
    expect(html).toContain("Semua peserta");
    expect(html).toContain("Setelah pengecualian");
    expect(html).toContain("Audit &lt;perlu&gt; ditinjau");
    expect(html).not.toContain("Audit <perlu>");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const control of [
      filter.getByLabel("Agent"),
      filter.getByLabel("Alasan pengecualian"),
      apply,
    ]) {
      expect(
        await control.evaluate((el) => (el as HTMLElement).offsetHeight),
      ).toBeGreaterThanOrEqual(44);
    }
    await filter.screenshot({
      path: testInfo.outputPath(`exclusions-${width}.png`),
    });
    await page
      .getByRole("region", { name: "Grafik relatif bulan pelatihan" })
      .screenshot({
        path: testInfo.outputPath(`service-average-charts-${width}.png`),
      });
    await comparison.screenshot({
      path: testInfo.outputPath(`comparison-${width}.png`),
    });
    await filter
      .getByRole("button", { name: "Sertakan kembali Budi Contoh" })
      .click();
    await expect(page).not.toHaveURL(/exclusions=/);
    await expect(comparison).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Peserta" }),
    ).not.toContainText("Dikecualikan");
    await waitForMockedApi(audit, ["GET /api/v1/tna/efek/report/ketik"]);
    expectHermetic(audit);
  });

test("semua agent dikecualikan tetap dapat dilihat, diunduh, dan dipulihkan", async ({
  page,
}) => {
  const exclusions = programReport.participants.map((p) => ({
    peserta_id: p.peserta_id,
    nama: p.nama,
    reason: "Data perlu ditinjau",
  }));
  const empty = summary(programs[0]!);
  const audit = await openTna(
    page,
    `/tna/efek/program/ketik?exclusions=${encodeURIComponent(JSON.stringify(exclusions.map(({ peserta_id, reason }) => ({ peserta_id, reason }))))}`,
    [
      {
        method: "GET",
        path: /\/api\/v1\/tna\/efek\/report\/ketik\?.*exclusions=/,
        body: ok({
          ...programReport,
          program: empty,
          analysis: { all_participants: ketikSummary, exclusions },
          participants: programReport.participants.map((p) => ({
            ...p,
            exclusion_reason: "Data perlu ditinjau",
          })),
          chart: programReport.chart.map((p) => ({ ...p, score: null })),
        }),
      },
      ...efekMocks,
    ],
  );
  await expect(page.getByRole("status")).toContainText(
    "Semua peserta dikecualikan",
  );
  await expect(page.getByRole("region", { name: "Peserta" })).toContainText(
    "Budi Contoh",
  );
  await expect(
    page.getByRole("button", { name: "Unduh laporan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset pengecualian" }).click();
  await expect(
    page.getByRole("region", { name: "Ringkasan program" }),
  ).toContainText("+1,8");
  expectHermetic(audit);
});

test("gagal memuat hasil pengecualian tidak menampilkan atau mengekspor hasil lama", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek/program/ketik?window=6", [
    {
      method: "GET",
      path: /\/api\/v1\/tna\/efek\/report\/ketik\?.*exclusions=/,
      status: 503,
      body: {
        success: false,
        error: { message: "Laporan belum tersedia. Coba lagi." },
      },
    },
    ...efekMocks,
  ]);
  const form = page.getByRole("region", { name: "Pengecualian analisis" });
  await form.getByLabel("Agent").selectOption(ids.budi);
  await form.getByLabel("Alasan pengecualian").fill("Data perlu ditinjau");
  await form.getByRole("button", { name: "Kecualikan dari analisis" }).click();
  await expect(
    page.getByText("Laporan belum tersedia. Coba lagi.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Unduh laporan" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Ringkasan program" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reset pengecualian" }).click();
  await expect(page).toHaveURL(/window=6/);
  await expect(page).not.toHaveURL(/exclusions=/);
  await expect(
    page.getByRole("region", { name: "Ringkasan program" }),
  ).toContainText("+1,8");
  expectHermetic(audit);
});

test("unduh laporan program menghasilkan HTML siap cetak dengan teks yang di-escape", async ({
  page,
}) => {
  const risky = participant({
    peserta_id: ids.plan,
    nama: 'Cici <img src=x onerror="alert(1)">',
    tim: "Tim <B>",
  });
  const audit = await openTna(page, "/tna/efek/program/ketik?window=6", [
    {
      method: "GET",
      path: "/api/v1/tna/efek/report/ketik",
      body: ok({
        ...programReport,
        window: 6,
        participants: [...programReport.participants, risky],
      }),
    },
    ...efekMocks,
  ]);
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh laporan" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^EFEK-KETIK-\d{4}-\d{2}-\d{2}\.html$/,
  );
  const html = await (
    await file.createReadStream()
  )
    .toArray()
    .then((parts) => Buffer.concat(parts).toString("utf8"));
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain("<title>EFEK KETIK · Laporan</title>");
  expect(html).toContain("Data SIDAK sampai September 2026");
  expect(html).toContain("Jendela banding 6 bulan");
  expect(html).toContain("Ana Contoh");
  expect(html).toContain("+4,0");
  expect(html).toContain("Rincian bulanan Ana Contoh");
  expect(html).toContain("Februari 2026");
  expect(html).toContain("Rata-rata layanan Chat");
  expect(html).toContain(
    "Δ relatif = perubahan peserta dikurangi perubahan rata-rata layanan Chat pada bulan yang sama. Rata-rata layanan mencakup semua agent yang diaudit, termasuk peserta, jadi bersifat indikatif.",
  );
  expect(html).toContain(
    "Garis putus-putus = rata-rata semua agent Chat yang diaudit pada bulan yang sama, termasuk peserta.",
  );
  expect(html).not.toMatch(/agent lain/i);
  expect(html).toContain("<svg");
  expect(html).toContain("@media print");
  expect(html).toContain("Cici &lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script");
  expect(html).toContain("Tim &lt;B&gt;");
  expectHermetic(audit);
});
