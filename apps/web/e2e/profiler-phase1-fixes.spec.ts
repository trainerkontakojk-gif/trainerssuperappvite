import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS, TEAM_ID } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Profiler tahap 1 (plans/markdown/profiler-phase1-fixes.md):
 * - form tambah wajib memilih folder tujuan, tanpa jatuh diam-diam ke "Batch 1";
 * - pilihan jabatan menampilkan label ("CCA"), bukan kode ("cca");
 * - teks Data sensitif jujur: data ikut tampil di slide dan ekspor;
 * - jumlah tim di Kelola tim menghitung tim sistem + tim buatan;
 * - slide tidak terpotong di laptop 1440px maupun HP 390px.
 */

const FULL_PESERTA = {
  id: "66666666-6666-6666-6666-666666666661",
  batch_name: "Batch Pagi",
  nomor_urut: 1,
  nama: "Rina Kartika Maharani",
  tim: "Telepon",
  jabatan: "cca",
  nik_ojk: "OJK-2024-00123",
  bergabung_date: "2022-03-14",
  email_ojk: "rina.kartika@ojk.go.id",
  no_telepon: "081234567890",
  no_telepon_darurat: "081298765432",
  nama_kontak_darurat: "Sulastri Wibowo",
  hubungan_kontak_darurat: "Orang Tua",
  jenis_kelamin: "Perempuan",
  agama: "Islam",
  tgl_lahir: "1996-08-21",
  status_perkawinan: "Belum Menikah",
  pendidikan: "S1",
  nama_lembaga: "Universitas Padjadjaran",
  jurusan: "Ilmu Komunikasi",
  previous_company: "PT Telekomunikasi Indonesia",
  pengalaman_cc: "Ya",
  status_tempat_tinggal: "Kos",
  no_ktp: "3273012108960002",
  no_npwp: "12.345.678.9-012.000",
  nomor_rekening: "1234567890",
  nama_bank: "BNI",
  alamat_tinggal:
    "Jl. Cikutra Barat No. 12, RT 03/RW 07, Kel. Cigadung, Kec. Cibeunying Kaler, Kota Bandung",
  catatan_tambahan:
    "Aktif di program mentoring agen baru dan membantu penyusunan materi FAQ.",
  keterangan: "Kandidat team leader periode berikutnya.",
};

const FULL_BATCH_MOCK: ApiMock = {
  method: "GET",
  path: /^\/api\/v1\/profiler\/peserta\/batch\/Batch(%20|\+)Pagi$/,
  body: { success: true, data: [FULL_PESERTA] },
};

const TEAMS_MOCK: ApiMock = {
  method: "GET",
  path: "/api/v1/profiler/teams",
  body: {
    success: true,
    data: [
      { id: TEAM_ID, nama: "Tim Call" },
      { id: "77777777-7777-7777-7777-777777777771", nama: "Tim Sosmed" },
      { id: "77777777-7777-7777-7777-777777777772", nama: "Tim Surat" },
    ],
  },
};

const CREATE_MOCK: ApiMock = {
  method: "POST",
  path: "/api/v1/profiler/peserta",
  body: { success: true, data: { ...FULL_PESERTA, id: "created" } },
};

function collectCreateBodies(page: Page) {
  const bodies: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      url.pathname === "/api/v1/profiler/peserta"
    ) {
      bodies.push(request.postDataJSON());
    }
  });
  return bodies;
}

/** Elemen di dalam slide yang isinya melebihi kotaknya (terpotong/tersembunyi). */
async function clippedSlideParts(page: Page) {
  const region = page.getByRole("region", { name: /^Slide / });
  await expect(region).toBeVisible({ timeout: 20000 });
  return region.evaluate((root) => {
    const clipped: string[] = [];
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(element);
      if (!["auto", "hidden", "scroll"].includes(style.overflowY)) continue;
      // Bingkai pratinjau sengaja memotong ukuran desain yang sudah diperkecil.
      if (element.querySelector(":scope > [data-slide-scaler]")) continue;
      if (element.scrollHeight > element.clientHeight + 1) {
        clipped.push(
          `${element.className.toString().slice(0, 60)} (${element.scrollHeight}>${element.clientHeight})`,
        );
      }
    }
    return clipped;
  });
}

test.describe("Profiler tahap 1: perbaikan bug", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("tambah tanpa folder: simpan ditahan sampai folder tujuan dipilih", async ({
    page,
  }) => {
    const bodies = collectCreateBodies(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler/add",
      apiMocks: [TEAMS_MOCK, CREATE_MOCK, ...PROFILER_MOCKS],
    });

    await page.getByLabel("Nama lengkap *").fill("Peserta Baru");
    await page.getByRole("button", { name: "Simpan peserta" }).click();
    await expect(page.getByText("Pilih folder tujuan dulu.")).toBeVisible();
    await page.waitForTimeout(500);
    expect(bodies).toHaveLength(0);

    await page.getByRole("combobox", { name: "Folder tujuan" }).click();
    await page.getByRole("option", { name: "Batch Pagi" }).click();
    await page.getByRole("button", { name: "Simpan peserta" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({
      nama: "Peserta Baru",
      batch_name: "Batch Pagi",
    });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("tambah dari folder: folder terisi, jabatan berlabel, teks sensitif jujur", async ({
    page,
  }) => {
    const bodies = collectCreateBodies(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler/add?batch=Batch%20Pagi",
      waitForUrl: /\/profiler\/add/,
      apiMocks: [TEAMS_MOCK, CREATE_MOCK, ...PROFILER_MOCKS],
    });

    await expect(
      page.getByRole("combobox", { name: "Folder tujuan" }),
    ).toHaveText(/Batch Pagi/, { timeout: 20000 });
    await expect(page.getByRole("combobox", { name: "Jabatan *" })).toContainText("CCA");
    await expect(
      page.getByText("Data ini ikut tampil di profil, slide, dan file ekspor."),
    ).toBeVisible();
    await expect(page.getByText(/tidak tampil di slide/)).toHaveCount(0);

    await page.getByLabel("Nama lengkap *").fill("Peserta Kedua");
    await page.getByRole("button", { name: "Simpan peserta" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({ batch_name: "Batch Pagi" });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("edit peserta: jabatan tampil sebagai label", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler/table?batch=Batch%20Pagi",
      waitForUrl: /\/profiler\/table/,
      apiMocks: [FULL_BATCH_MOCK, TEAMS_MOCK, ...PROFILER_MOCKS],
    });

    await page
      .getByRole("button", { name: `Edit ${FULL_PESERTA.nama}` })
      .click({ timeout: 20000 });
    await expect(
      page.getByRole("combobox", { name: "Level jabatan" }),
    ).toContainText("CCA");

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("kelola tim: jumlah menghitung tim sistem dan tim buatan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler/teams",
      apiMocks: [TEAMS_MOCK, ...PROFILER_MOCKS],
    });

    await expect(page.getByText("6 tim tersedia untuk dipilih.")).toBeVisible({
      timeout: 20000,
    });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("slide di laptop 1440px: tidak ada bagian yang terpotong", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=slide",
      waitForUrl: /\/profiler/,
      apiMocks: [FULL_BATCH_MOCK, ...PROFILER_MOCKS],
    });

    await expect(page.getByText("Tgl Lahir")).toBeVisible({ timeout: 20000 });
    expect(await clippedSlideParts(page)).toEqual([]);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("slide di HP 390px: muat penuh tanpa digeser ke samping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=slide",
      waitForUrl: /\/profiler/,
      apiMocks: [FULL_BATCH_MOCK, ...PROFILER_MOCKS],
    });

    const region = page.getByRole("region", { name: /^Slide / });
    await expect(region).toBeVisible({ timeout: 20000 });
    const overflow = await region.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(await clippedSlideParts(page)).toEqual([]);

    // Gambar yang disimpan tetap berukuran desain penuh (1000px × skala 3),
    // bukan ukuran pratinjau yang diperkecil di HP.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Simpan Gambar" }).click();
    const download = await downloadPromise;
    const png = await readFile((await download.path())!);
    expect(png.readUInt32BE(16)).toBe(3000);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
});
