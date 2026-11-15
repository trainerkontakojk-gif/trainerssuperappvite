import { expect, test } from "@playwright/test";
import { expectHermetic } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna } from "./helpers/tnaHarness";
import { findTargetsBelow } from "./helpers/touchTarget";
import {
  ok,
  programs,
  summary,
  ketikSummary,
  participant,
  programReport,
  efekMocks,
} from "./helpers/tnaEfekHarness";

// EFEK screens (plans/markdown/efek.md): TNA tab, report, session form, import.
test.beforeAll(() => assertLocalDevOnlyTarget());

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
  await form.getByText("Sesuaikan analisis", { exact: true }).click();
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

test("toggle proper input tersimpan di tautan, terbawa ke rincian, dan ikut ekspor", async ({
  page,
}) => {
  const reportRequests: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/tna/efek/report") reportRequests.push(url);
  });
  const includedModeMocks = [
    ...efekMocks.filter(
      (mock) => mock.path !== "/api/v1/tna/efek/report/ketik",
    ),
    {
      method: "GET" as const,
      path: "/api/v1/tna/efek/report/ketik",
      body: ok({ ...programReport, include_proper_input: true }),
    },
  ];
  const audit = await openTna(page, "/tna/efek", includedModeMocks);
  const toggle = page.getByRole("checkbox", {
    name: "Hitung proper input (APPK)",
  });
  const defaultNote =
    "Proper input (APPK) dianggap sesuai, jadi skor fokus pada interaksi dengan konsumen. Nyalakan untuk melihat skor SIDAK resmi.";
  const includedNote = "Skor SIDAK resmi, termasuk proper input (APPK).";

  await expect(toggle).not.toBeChecked();
  await expect(page.getByText(defaultNote, { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/proper_input/);
  await expect.poll(() => reportRequests.length).toBeGreaterThan(0);
  expect(reportRequests[0]!.searchParams.has("proper_input")).toBe(false);

  const summaryRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/v1/tna/efek/report" &&
      url.searchParams.get("proper_input") === "include"
    );
  });
  await toggle.focus();
  await page.keyboard.press("Space");
  const summaryResponseRequest = await summaryRequest;
  expect(
    new URL(summaryResponseRequest.url()).searchParams.get("proper_input"),
  ).toBe("include");
  await expect(page).toHaveURL(/proper_input=include/);
  await expect(toggle).toBeChecked();
  await expect(page.getByText(includedNote, { exact: true })).toBeVisible();

  const detailRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/v1/tna/efek/report/ketik" &&
      url.searchParams.get("proper_input") === "include"
    );
  });
  await page.getByRole("link", { name: "Rincian KETIK" }).click();
  const detailApiRequest = await detailRequest;
  expect(new URL(detailApiRequest.url()).searchParams.get("proper_input")).toBe(
    "include",
  );
  await expect(page).toHaveURL(
    /\/tna\/efek\/program\/ketik\?.*proper_input=include/,
  );
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(toggle).toBeChecked();
  await expect(page.getByText(includedNote, { exact: true })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh laporan" }).click();
  const file = await download;
  const html = await (
    await file.createReadStream()
  )
    .toArray()
    .then((parts) => Buffer.concat(parts).toString("utf8"));
  expect(html).toContain(includedNote);

  const reloadRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/v1/tna/efek/report/ketik" &&
      url.searchParams.get("proper_input") === "include"
    );
  });
  await page.reload();
  await reloadRequest;
  await expect(
    page.getByRole("checkbox", { name: "Hitung proper input (APPK)" }),
  ).toBeChecked();
  await expect(page.getByText(includedNote, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/proper_input=include/);
  expectHermetic(audit);
});

test("tab EFEK dari rincian program mempertahankan filter dan Sesuaikan analisis punya penanda buka-tutup", async ({
  page,
}) => {
  const audit = await openTna(
    page,
    "/tna/efek/program/ketik?window=4&proper_input=include",
    efekMocks,
  );
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });

  const adjustments = page.locator("summary", {
    hasText: "Sesuaikan analisis",
  });
  const marker = adjustments.locator("svg");
  await expect(marker).toBeVisible();
  // Tailwind v4 rotates through the CSS `rotate` property, not `transform`.
  const rotation = () =>
    marker.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.rotate}|${style.transform}`;
    });
  const closed = await rotation();
  await adjustments.click();
  await expect.poll(rotation).not.toBe(closed);

  await page
    .getByRole("navigation", { name: "Bagian TNA" })
    .getByRole("link", { name: "EFEK" })
    .click();
  await expect(page).toHaveURL(/\/tna\/efek\?/);
  await expect(page).toHaveURL(/proper_input=include/);
  await expect(page).toHaveURL(/window=4/);
  await expect(
    page.getByRole("checkbox", { name: "Hitung proper input (APPK)" }),
  ).toBeChecked();
  expectHermetic(audit);
});

test("390 px: target sentuh EFEK minimal 44 px dan filter dua per baris", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const audit = await openTna(page, "/tna/efek", efekMocks);
  for (const [path, ready] of [
    [
      "/tna/efek",
      page.getByRole("link", { name: "Rincian Level Up Week Mei" }),
    ],
    [
      "/tna/efek/program/ketik",
      page.getByRole("button", { name: "Peserta", exact: true }),
    ],
    ["/tna/efek/sesi/baru", page.getByRole("button", { name: "Simpan sesi" })],
  ] as const) {
    if (path !== "/tna/efek") await page.goto(path);
    await expect(ready).toBeVisible({ timeout: 20000 });
    for (const region of ["header", "main"])
      expect(
        await findTargetsBelow(page, page.locator(region).first()),
        `${region} ${path}`,
      ).toEqual([]);
  }

  // The first crumb's enlarged target must not cover the menu button beside it.
  const menu = page.getByRole("button", { name: "Buka menu navigasi" });
  expect(
    await menu.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.right - 1,
        box.top + box.height / 2,
      );
      return Boolean(hit && button.contains(hit));
    }),
  ).toBe(true);

  // Back on the program report: the first two filters share one row.
  await page.goto("/tna/efek/program/ketik");
  const first = await page.getByLabel("Jendela banding").boundingBox();
  const second = await page.getByLabel("Tahun sesi").boundingBox();
  expect(second?.y).toBe(first?.y);
  expectHermetic(audit);
});
