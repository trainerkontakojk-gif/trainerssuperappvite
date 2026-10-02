/**
 * Integrasi BROWSER → route Hono NYATA → DB lokal disposable → halaman heatmap.
 *
 * Gap yang ditutup: spec mock-only (`sidak-temuan-dates.spec.ts`,
 * `sidak-temuan-import-dates.spec.ts`) dan spec route-level
 * (`sidak-heatmap-integration.spec.ts`, `sidak-temuan-dates-api.spec.ts`) masing
 * -masing tidak membuktikan satu alur browser yang benar-benar menyimpan.
 *
 * Di sini katalog/auth UI di-mock (fixture), TETAPI semua request fitur
 * (`/api/v1/sidak/temuan*`, `/api/v1/sidak/heatmap`) diteruskan ke router Hono
 * ASLI dengan JWT user nyata dan database Supabase LOKAL disposable. Mutasi
 * bisnis dan hitungan heatmap tidak pernah di-mock.
 *
 * Fixture: satu peserta + folder + periode + indikator unik per run; hari uji
 * memakai November/Desember 2026 supaya tidak bertabrakan dengan spec lain.
 */

import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  openInputAudit,
  startAudit,
  type HarnessFixture,
} from "./helpers/sidakTemuanDatesHarness";
import {
  createAdmin,
  createRealSidakApp,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

const ENV = readLoopbackEnv();
installLoopbackFetchGuard();
const admin = createAdmin(ENV);

const LAYANAN_DATE = "2026-11-17";
const LAYANAN_MOVED = "2026-11-18";
const SAMPEL_DATE = "2026-12-19";
const IMPORT_LAYANAN = "2026-11-20";
const IMPORT_SAMPEL = "2026-12-20";

function displayName(indicator: HarnessFixture["indicators"][number]): string {
  const group = indicator.parameter_group?.trim();
  return group ? `${group} — ${indicator.name}` : indicator.name;
}

type Fixture = {
  fixture: HarnessFixture;
  periodId: string;
  pesertaId: string;
  folderName: string;
  indicatorIds: string[];
};

async function seedFixture(): Promise<Fixture> {
  const folderName = `e2e-browser-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const yearId = sqlOne(
    ENV,
    `INSERT INTO public.profiler_years (year, label) VALUES (2026,'E2E Browser')
     ON CONFLICT (year) DO UPDATE SET label=EXCLUDED.label RETURNING id;`,
  );
  const folderId = sqlOne(
    ENV,
    `INSERT INTO public.profiler_folders (name, year_id)
     VALUES ('${folderName}','${yearId}') RETURNING id;`,
  );
  // `tim = 'SLIK'` membuat halaman memilih layanan `slik` otomatis, cocok dengan
  // indikator rule aktif yang dipakai fixture.
  const pesertaId = sqlOne(
    ENV,
    `INSERT INTO public.profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES ('${folderName}','Agen Browser','SLIK','Agent',1) RETURNING id;`,
  );
  const periodId = sqlOne(
    ENV,
    `SELECT id FROM public.qa_periods WHERE month = 1 AND year = 2026 LIMIT 1;`,
  );

  const indicatorRows = runSql(
    ENV,
    `SELECT i.id || '|' || i.name || '|' || COALESCE(i.parameter_group,'') || '|' ||
            i.category || '|' || COALESCE(i.bobot::text,'0')
     FROM public.qa_indicators i
     WHERE i.service_type = 'slik' AND i.is_active
       AND EXISTS (SELECT 1 FROM public.qa_service_rule_indicators r
                   WHERE r.legacy_indicator_id = i.id)
     ORDER BY i.sort_order LIMIT 3;`,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (indicatorRows.length < 3) {
    throw new Error(`Butuh 3 indikator SLIK aktif, dapat ${indicatorRows.length}`);
  }
  const indicators = indicatorRows.map((row) => {
    const [id, name, parameter_group, category, bobot] = row.split("|");
    return {
      id: id!,
      service_type: "slik",
      name: name!,
      parameter_group: parameter_group || null,
      category: category!,
      bobot: Number(bobot ?? "0"),
      is_active: true,
    };
  });

  return {
    fixture: {
      folder: { id: folderId, name: folderName },
      period: { id: periodId, month: 1, year: 2026 },
      agent: {
        id: pesertaId,
        nama: "Agen Browser",
        batch_name: folderName,
        tim: "SLIK",
        jabatan: "Agent",
      },
      indicators,
    },
    periodId,
    pesertaId,
    folderName,
    indicatorIds: indicators.map((i) => i.id),
  };
}

async function pickParameter(
  page: import("@playwright/test").Page,
  index: number,
  name: string,
) {
  await page.locator('button[aria-haspopup="listbox"]').nth(index).click();
  await page.getByRole("option", { name }).first().click();
}

function countRows(pesertaId: string, ticket?: string): number {
  const where = ticket
    ? `AND no_tiket = '${ticket}'`
    : "";
  return Number(
    sqlOne(
      ENV,
      `SELECT count(*) FROM public.qa_temuan WHERE peserta_id='${pesertaId}' ${where};`,
    ),
  );
}

test.describe.serial("Integrasi browser: manual + import → route nyata → DB → heatmap", () => {
  let fx: Fixture;
  let app: Awaited<ReturnType<typeof createRealSidakApp>>;
  let trainerUserId = "";

  async function heatmapDay(
    mode: "agent" | "qa",
    date: string,
  ): Promise<number> {
    const res = await app.request(
      `/v1/sidak/heatmap?mode=${mode}&year=2026`,
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.bodyText);
    expect(body.success).toBe(true);
    return body.data.days.find((d: any) => d.date === date)?.count ?? 0;
  }

  test.beforeAll(async () => {
    fx = await seedFixture();
    const trainer = await createUserWithJwt(ENV, "trainer", String(Date.now()));
    trainerUserId = trainer.userId;
    app = await createRealSidakApp(ENV, {
      userId: trainer.userId,
      email: trainer.email,
      role: "trainer",
      fullName: "E2E Browser",
      token: trainer.token,
    });
  });

  test.afterAll(async () => {
    // Cleanup HANYA fixture milik run ini.
    if (fx?.pesertaId) {
      runSql(ENV, `DELETE FROM public.qa_temuan WHERE peserta_id='${fx.pesertaId}';`);
      runSql(ENV, `DELETE FROM public.profiler_peserta WHERE id='${fx.pesertaId}';`);
      runSql(ENV, `DELETE FROM public.profiler_folders WHERE name='${fx.folderName}';`);
    }
    if (trainerUserId) await admin.auth.admin.deleteUser(trainerUserId);
  });

  test("manual create → edit memindahkan → delete mengurangi, lalu heatmap dua mode", async ({
    page,
  }) => {
    const audit = startAudit();
    await openInputAudit(page, audit, { realApi: app, fixture: fx.fixture });

    // Pilih periode (halaman menahan form sampai periode dipilih).
    await page.getByRole("button", { name: /Januari 2026/ }).first().click();
    await page.getByRole("button", { name: /^(Tambah Temuan|Tambah)$/ }).first().click();
    await expect(page.getByLabel(/^Tanggal layanan/)).toBeVisible();

    // Satu tiket, DUA parameter, tanggal layanan/sampel yang sama.
    await page.getByPlaceholder(/Contoh: L/).fill("TKT-BROWSER-MANUAL");
    await pickParameter(page, 0, fx.fixture.indicators[0]!.name);
    await page.getByRole("button", { name: /Tambah Parameter/ }).click();
    await pickParameter(page, 1, fx.fixture.indicators[1]!.name);
    // Nilai default 3 (Sesuai) TIDAK countable untuk heatmap; pilih 1.
    await page.getByRole("button", { name: "1 Tidak" }).nth(0).click();
    await page.getByRole("button", { name: "1 Tidak" }).nth(1).click();
    await page.getByLabel(/^Tanggal layanan/).fill(LAYANAN_DATE);
    await page.getByLabel(/^Tanggal sampel/).fill(SAMPEL_DATE);
    await page.getByRole("button", { name: /Simpan Temuan/ }).click();

    // Read-after-write lewat route GET nyata (list halaman) + DB.
    await expect.poll(() => countRows(fx.pesertaId, "TKT-BROWSER-MANUAL")).toBe(2);
    await expect(page.getByText("TKT-BROWSER-MANUAL").first()).toBeVisible();
    expect(
      sqlOne(
        ENV,
        `SELECT count(*) FROM public.qa_temuan
         WHERE peserta_id='${fx.pesertaId}' AND tanggal_layanan='${LAYANAN_DATE}'
           AND tanggal_sampel='${SAMPEL_DATE}';`,
      ),
    ).toBe("2");

    // Kalender (agent) membaca dedicated date lewat JWT + RLS nyata.
    expect(await heatmapDay("agent", LAYANAN_DATE)).toBe(2);
    expect(await heatmapDay("qa", SAMPEL_DATE)).toBe(2);

    // Edit satu baris: layanan pindah dari 17 → 18.
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel("Tanggal layanan", { exact: true }).last().fill(LAYANAN_MOVED);
    await page.getByRole("button", { name: /^Simpan$/ }).click();
    await expect
      .poll(() =>
        sqlOne(
          ENV,
          `SELECT count(*) FROM public.qa_temuan
           WHERE peserta_id='${fx.pesertaId}' AND tanggal_layanan='${LAYANAN_MOVED}';`,
        ),
      )
      .toBe("1");
    expect(await heatmapDay("agent", LAYANAN_DATE)).toBe(1);
    expect(await heatmapDay("agent", LAYANAN_MOVED)).toBe(1);

    // Delete baris itu (tombol konfirmasi dua klik) → count berkurang.
    const del = page.getByRole("button", { name: /Hapus|Klik lagi untuk konfirmasi/ });
    await del.first().click();
    await del.first().click();
    await expect.poll(() => countRows(fx.pesertaId)).toBe(1);
    expect(await heatmapDay("agent", LAYANAN_MOVED)).toBe(0);
    expect(await heatmapDay("agent", LAYANAN_DATE)).toBe(1);
    expect(await heatmapDay("qa", SAMPEL_DATE)).toBe(1);

    // Halaman heatmap nyata menampilkan angka dari API nyata.
    await page.goto("/sidak/heatmap", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Heatmap Ketidaksesuaian/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "17/11/2026: 1 temuan" }),
    ).toBeVisible();

    expect(audit.blockedExternal).toEqual([]);
    expect(audit.blockedApi).toEqual([]);
  });

  test("import batch → route nyata → DB → heatmap", async ({ page }) => {
    const audit = startAudit();
    await openInputAudit(page, audit, { realApi: app, fixture: fx.fixture });
    await page.getByRole("button", { name: /Januari 2026/ }).first().click();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Input Temuan");
    ws.addRow([
      "No. Tiket",
      "Parameter / Sub-parameter",
      "Nilai (0-3)",
      "Ketidaksesuaian",
      "Sebaiknya",
      "Tanggal Layanan (YYYY-MM-DD)",
      "Tanggal Sampel (YYYY-MM-DD)",
    ]);
    ws.addRow([
      "TKT-BROWSER-IMP-1",
      displayName(fx.fixture.indicators[0]!),
      1,
      "Import temuan A",
      "",
      IMPORT_LAYANAN,
      IMPORT_SAMPEL,
    ]);
    ws.addRow([
      "TKT-BROWSER-IMP-1",
      displayName(fx.fixture.indicators[1]!),
      2,
      "Import temuan B",
      "",
      IMPORT_LAYANAN,
      IMPORT_SAMPEL,
    ]);
    const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page.getByRole("button", { name: "Upload & Preview" }).click();
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "browser-import.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.getByRole("button", { name: /^Import \d+ Temuan$/ }).click();

    await expect.poll(() => countRows(fx.pesertaId, "TKT-BROWSER-IMP-1")).toBe(2);
    expect(
      sqlOne(
        ENV,
        `SELECT count(*) FROM public.qa_temuan
         WHERE peserta_id='${fx.pesertaId}'
           AND tanggal_layanan='${IMPORT_LAYANAN}' AND tanggal_sampel='${IMPORT_SAMPEL}';`,
      ),
    ).toBe("2");
    // 1 baris sisa dari test manual (LAYANAN_DATE) + 2 baris import.
    expect(await heatmapDay("agent", IMPORT_LAYANAN)).toBe(2);
    expect(await heatmapDay("qa", IMPORT_SAMPEL)).toBe(2);

    expect(audit.blockedExternal).toEqual([]);
    expect(audit.blockedApi).toEqual([]);
  });
});
