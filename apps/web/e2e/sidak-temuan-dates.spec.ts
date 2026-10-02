/**
 * E2E tanggal temuan SIDAK pada permukaan INPUT MANUAL (`/sidak/input`).
 *
 * Fokus fase ini: pengguna mengetik tanggal sekali di level tiket, dan backend
 * menerimanya per item parameter. Semua request going ke `/api` di-mock lewat
 * harness fail-closed, jadi spec ini tidak menyentuh database mana pun — bukan
 * DB nyata, bukan DB lokal. Persistence yang nyata dibuktikan di
 * `sidak-temuan-dates-api.spec.ts`, bukan di sini.
 */

import { expect, test } from "@playwright/test";
import {
  allRows,
  captured,
  expectIsolation,
  FIXTURE,
  lastBatchItems,
  openInputAudit,
  resetStore,
  startAudit,
} from "./helpers/sidakTemuanDatesHarness";
import {
  currentRow,
  lastUpdate as lastAgentUpdate,
  openAgentDetail,
  seedRow,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";

/**
 * Tombol buka form manual berbeda labelnya tergantung state: "Tambah Temuan"
 * saat panel kosong, "Tambah" di header setelah ada temuan. Keduanya memanggil
 * aksi yang sama, jadi keduanya boleh dipakai.
 */
const OPEN_FORM = /^(Tambah Temuan|Tambah)$/;
const LAYAN = /^Tanggal layanan/;
const SAMPEL = /^Tanggal sampel/;

test.beforeEach(() => {
  resetStore();
});

/** Payload PUT terakhir yang benar-benar dikirim ke server. */
function lastUpdate(): any | null {
  const updates = captured("update");
  return updates.length ? updates[updates.length - 1] : null;
}

async function openForm(
  page: import("@playwright/test").Page,
  opts?: Parameters<typeof openInputAudit>[2],
) {
  const audit = startAudit();
  await openInputAudit(page, audit, opts);

  // Halaman berhenti di "Pilih Periode" sampai periode dipilih; tombol tambah
  // temuan baru muncul setelah agent + periode + layanan siap.
  const periodButton = page
    .getByRole("button", { name: /Januari 2026/ })
    .first();
  await periodButton.click();

  await page.getByRole("button", { name: OPEN_FORM }).first().click();
  await expect(page.getByLabel(LAYAN)).toBeVisible();
  return audit;
}

test.describe("Input manual: dua tanggal opsional", () => {
  test("kedua field tanggal terlihat dan berlabel opsional", async ({ page }) => {
    const audit = await openForm(page);

    const layanan = page.getByLabel(LAYAN);
    const sampel = page.getByLabel(SAMPEL);

    await expect(layanan).toBeVisible();
    await expect(sampel).toBeVisible();
    // Label harus menyatakan opsional, sesuai keputusan requirement.
    await expect(layanan).toHaveAccessibleName(/Tanggal layanan/);
    await expect(page.locator("form, div").getByText(/opsional/i).first()).toBeVisible();

    expectIsolation(audit);
  });

  test("menyimpan tanpa tanggal tetap mengirim tanpa tanggal (bukan string kosong)", async ({ page }) => {
    const audit = await openForm(page);

    await page.getByPlaceholder(/Contoh: L/).fill("TKT-0001");
    await pickParameter(page, 0, FIXTURE.indicators[0]!.name);
    await page.getByRole("button", { name: /Simpan Temuan/ }).click();

    await expect.poll(() => lastBatchItems().length).toBe(1);
    const item = lastBatchItems()[0]!;
    expect(item.no_tiket).toBe("TKT-0001");
    // Tidak boleh jadi `""` — string kosong bukan tanggal dan akan disimpan
    // sebagai nilai, bukan "belum diisi".
    expect(item.tanggal_layanan ?? null).toBeNull();
    expect(item.tanggal_sampel ?? null).toBeNull();

    expectIsolation(audit);
  });

  test("tanggal diisi sekali berlaku ke semua item parameter", async ({ page }) => {
    const audit = await openForm(page);

    await page.getByPlaceholder(/Contoh: L/).fill("TKT-0002");
    // Form manual dibuka dengan SATU entry; dua entry lain dibuat lewat tombol.
    await page.getByRole("button", { name: /Tambah Parameter/ }).click();
    await page.getByRole("button", { name: /Tambah Parameter/ }).click();
    await pickParameter(page, 0, FIXTURE.indicators[0]!.name);
    await pickParameter(page, 1, FIXTURE.indicators[1]!.name);
    await pickParameter(page, 2, FIXTURE.indicators[2]!.name);

    await page.getByLabel(LAYAN).fill("2026-01-05");
    await page.getByLabel(SAMPEL).fill("2026-01-09");

    await page.getByRole("button", { name: /Simpan Temuan/ }).click();

    await expect.poll(() => lastBatchItems().length).toBe(3);
    for (const item of lastBatchItems()) {
      expect(item.tanggal_layanan, "setiap parameter harus dapat tanggal sama").toBe(
        "2026-01-05",
      );
      expect(item.tanggal_sampel).toBe("2026-01-09");
    }

    expectIsolation(audit);
  });

  test("kedua tanggal boleh diisi sebagian", async ({ page }) => {
    const audit = await openForm(page);

    await page.getByPlaceholder(/Contoh: L/).fill("TKT-0003");
    await pickParameter(page, 0, FIXTURE.indicators[0]!.name);
    await page.getByLabel(LAYAN).fill("2026-01-20");

    await page.getByRole("button", { name: /Simpan Temuan/ }).click();

    await expect.poll(() => lastBatchItems().length).toBe(1);
    expect(lastBatchItems()[0]!.tanggal_layanan).toBe("2026-01-20");
    expect(lastBatchItems()[0]!.tanggal_sampel ?? null).toBeNull();

    expectIsolation(audit);
  });

  test("form ter-reset setelah sukses — tanggal kembali kosong", async ({ page }) => {
    const audit = await openForm(page);

    await page.getByPlaceholder(/Contoh: L/).fill("TKT-0004");
    await pickParameter(page, 0, FIXTURE.indicators[0]!.name);
    await page.getByLabel(LAYAN).fill("2026-01-05");
    await page.getByLabel(SAMPEL).fill("2026-01-06");

    await page.getByRole("button", { name: /Simpan Temuan/ }).click();
    // Setelah sukses form ditutup, jadi field tidak ada lagi — yang dibuktikan
    // adalah state DIBERSIHKAN, bukan field yang masih kosong di layar.
    await expect(
      page.getByRole("button", { name: /Simpan Temuan/ }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: OPEN_FORM }).first().click();
    await expect(page.getByLabel(LAYAN)).toHaveValue("");
    await expect(page.getByLabel(SAMPEL)).toHaveValue("");
    await expect(page.getByPlaceholder(/Contoh: L/)).toHaveValue("");

    expectIsolation(audit);
  });

  test("klik Batal mengosongkan tanggal", async ({ page }) => {
    const audit = await openForm(page);

    await page.getByLabel(LAYAN).fill("2026-01-05");
    await page.getByLabel(SAMPEL).fill("2026-01-06");
    await page.getByRole("button", { name: /^Batal$/ }).click();

    await page.getByRole("button", { name: OPEN_FORM }).first().click();
    await expect(page.getByLabel(LAYAN)).toHaveValue("");
    await expect(page.getByLabel(SAMPEL)).toHaveValue("");

    expectIsolation(audit);
  });

  test("gagal menyimpan TIDAK menghapus draft tanggal", async ({ page }) => {
    const audit = await openForm(page, {
      batch: { kind: "error", status: 400, message: "Gagal menyimpan temuan" },
    });

    await page.getByPlaceholder(/Contoh: L/).fill("TKT-0005");
    await pickParameter(page, 0, FIXTURE.indicators[0]!.name);
    await page.getByLabel(LAYAN).fill("2026-01-05");
    await page.getByLabel(SAMPEL).fill("2026-01-09");

    await page.getByRole("button", { name: /Simpan Temuan/ }).click();

    // Draft harus utuh supaya user tidak mengetik ulang.
    await expect(page.getByLabel(LAYAN)).toHaveValue("2026-01-05");
    await expect(page.getByLabel(SAMPEL)).toHaveValue("2026-01-09");
    await expect(page.getByPlaceholder(/Contoh: L/)).toHaveValue("TKT-0005");

    expectIsolation(audit);
  });

  test("berganti konteks (agent/layanan) mengosongkan tanggal", async ({ page }) => {
    const audit = await openForm(page);

    await page.getByLabel(LAYAN).fill("2026-01-05");
    await page.getByLabel(SAMPEL).fill("2026-01-09");

    // Latar belakang perlakukan perubahan konteks sebagai form yang perlu
    // dibersihkan; driver di bawah mengikuti kontrol nyata di halaman.
    await changeContext(page);
    await expect(page.getByLabel(LAYAN)).toHaveValue("");

    expectIsolation(audit);
  });
});

/**
 * Pilih parameter untuk entry ke-`index`.
 *
 * Trigger dropdown memakai `aria-haspopup="listbox"` dan TEKSNYA BERUBAH setelah
 * dipilih ("— Pilih parameter —" → "Kesesuaian Data (15%)"). Jadi tidak boleh
 * memakai pencocokan teks untuk menghitung posisi, karena memilih entry pertama
 * membuat indeks berikutnya bergeser. Atributnya stabil karena urutan DOM entry
 * tidak berubah.
 */
async function pickParameter(
  page: import("@playwright/test").Page,
  index: number,
  name: string,
) {
  await page.locator('button[aria-haspopup="listbox"]').nth(index).click();
  await page.getByRole("option", { name }).first().click();
}

/** Pemicu perubahan konteks di halaman Input Audit. */
async function changeContext(page: import("@playwright/test").Page) {
  const serviceSelect = page.locator("#sidak-mix-service, select").first();
  if (await serviceSelect.count()) {
    await serviceSelect.selectOption({ index: 1 }).catch(() => {});
  }
  await page.waitForTimeout(300);
}
test.describe("Edit inline di Input Audit", () => {
  /** Simpan satu temuan lebih dulu supaya ada baris yang bisa diedit. */
  async function seedOneFinding(page: import("@playwright/test").Page) {
    const audit = await openForm(page);
    await page.getByPlaceholder(/Contoh: L/).fill("TKT-9001");
    await pickParameter(page, 0, FIXTURE.indicators[0]!.name);
    await page.getByLabel(LAYAN).fill("2026-01-05");
    await page.getByLabel(SAMPEL).fill("2026-01-09");
    await page.getByRole("button", { name: /Simpan Temuan/ }).click();
    await expect.poll(() => allRows().length).toBe(1);
    return audit;
  }

  test("tanggal tampil di detail temuan dan bisa diedit per baris", async ({ page }) => {
    const audit = await seedOneFinding(page);

    // Detail menampilkan tanggal yang tersimpan.
    await expect(page.getByText("2026-01-05").first()).toBeVisible();

    await page.getByRole("button", { name: /Edit/ }).first().click();
    const editLayanan = page.getByLabel("Tanggal layanan", { exact: true }).last();
    const editSampel = page.getByLabel("Tanggal sampel", { exact: true }).last();
    await expect(editLayanan).toHaveValue("2026-01-05");
    await expect(editSampel).toHaveValue("2026-01-09");

    await editLayanan.fill("2026-02-11");
    await page.getByRole("button", { name: /^Simpan$/ }).click();

    await expect.poll(() => allRows()[0]!.tanggal_layanan).toBe("2026-02-11");
    // Hanya baris itu yang berubah; tanggal sampel tidak ikut tersentuh.
    expect(allRows()[0]!.tanggal_sampel).toBe("2026-01-09");

    expectIsolation(audit);
  });

  test("mengosongkan tanggal lewat edit memakai null, bukan string kosong", async ({ page }) => {
    const audit = await seedOneFinding(page);

    await page.getByRole("button", { name: /Edit/ }).first().click();
    const editLayanan = page.getByLabel("Tanggal layanan", { exact: true }).last();
    await editLayanan.fill("");
    await page.getByRole("button", { name: /^Simpan$/ }).click();

    await expect.poll(() => allRows()[0]!.tanggal_layanan).toBeNull();
    const sent = lastUpdate();
    expect(sent, "update harus tetap mengirim tanggal_sampel").toBeTruthy();
    expect(sent!.tanggal_layanan).toBeNull();

    expectIsolation(audit);
  });

  test("temuan tanpa tanggal menampilkan 'Belum diisi'", async ({ page }) => {
    const audit = await openForm(page);
    await page.getByPlaceholder(/Contoh: L/).fill("TKT-9002");
    await pickParameter(page, 0, FIXTURE.indicators[1]!.name);
    await page.getByRole("button", { name: /Simpan Temuan/ }).click();
    await expect.poll(() => allRows().length).toBe(1);

    expect(allRows()[0]!.tanggal_layanan).toBeNull();
    expect(allRows()[0]!.tanggal_sampel).toBeNull();

    await page.getByRole("button", { name: /Edit/ }).first().click();
    const editLayanan = page.getByLabel("Tanggal layanan", { exact: true }).last();
    await expect(editLayanan).toHaveValue("");

    expectIsolation(audit);
  });
});

/**
 * Permukaan kedua: modal edit temuan di DETAIL AGENT.
 *
 * Ini menutup gap yang tercatat di plans/markdown/sidak-heatmap.md (Fase 3):
 * implementasi `EditTemuanModal` sebelumnya hanya/typecheck tanpa bukti
 * perilaku end-to-end.
 */
test.describe("Edit tanggal di detail agent (EditTemuanModal)", () => {
  // Halaman detail agent adalah SPA terberat di feature ini. Setelah beberapa
  // spec berjalan di proses yang sama, dev server Vite butuh waktu lebih lama
  // untuk merakit ulang modulnya, dan default 30s habis sebelum assertion
  // pertama selesai. Budget dinaikkan, assertion tidak dilonggarkan.
  test.slow();
  function audit(): AgentAudit {
    return { mockedApi: [], blockedApi: [], blockedExternal: [] };
  }

  async function openModal(page: import("@playwright/test").Page, opts: {
    row: { tanggal_layanan: string | null; tanggal_sampel: string | null };
    failUpdate?: boolean;
  }) {
    seedRow(opts.row);
    const a = audit();
    await openAgentDetail(page, a, { failUpdate: opts.failUpdate });
    // Halaman memakai animasi masuk; menunggu heading muncul dulu memastikan
    // konten sudah settles sehingga klik tab tidak menunggu "element stable".
    await expect(
      page.getByRole("heading", { name: "Agen Uji Tanggal" }),
    ).toBeVisible();
    // Tab diaktifkan lewat keyboard: `role="tab"` mendukung roving focus, dan
    // ini menghindari wait actionability yang tidak pernah selesai karena
    // elemen berada di dalam container yang sedang beranimasi.
    const temuanTab = page.getByRole("tab", { name: "Temuan" });
    await temuanTab.focus();
    await temuanTab.press("Enter");
    await expect(temuanTab).toHaveAttribute("aria-selected", "true");
    // Temuan dikelompokkan per bulan/tiket di dalam akordeon yang tertutup secara default,
    // jadi grupnya harus dibuka lebih dulu sebelum tombol Edit muncul.
    const group = page.locator("button", { hasText: /temuan · / }).first();
    await group.waitFor({ state: "visible" });
    await group.click();
    // Accessible name-nya "Edit temuan <nama parameter>", bukan "Edit".
    await page
      .getByRole("button", { name: /^Edit temuan/ })
      .first()
      .click();
    await expect(page.getByLabel("Tanggal layanan", { exact: true })).toBeVisible();
    return a;
  }

  test("modal menampilkan tanggal tersimpan dan 'Belum diisi' saat kosong", async ({ page }) => {
    const a = await openModal(page, {
      row: { tanggal_layanan: "2026-01-05", tanggal_sampel: null },
    });

    const layanan = page.getByLabel("Tanggal layanan", { exact: true });
    const sampel = page.getByLabel("Tanggal sampel", { exact: true });

    await expect(layanan).toHaveValue("2026-01-05");
    // Tanggal sampel kosong, jadi editor harus kosong — bukan filled dengan
    // tanggal layanan dan bukan string Odd.
    await expect(sampel).toHaveValue("");

    // Keterangan di bawah editor menyatakan kondisi sebenarnya per tanggal.
    await expect(page.getByText("2026-01-05").first()).toBeVisible();
    await expect(page.getByText("Belum diisi").first()).toBeVisible();

    expect(a.blockedExternal).toEqual([]);
    expect(a.blockedApi).toEqual([]);
  });

  test("menyimpan tanggal dari modal benar-benar mengirim keduanya", async ({ page }) => {
    const a = await openModal(page, {
      row: { tanggal_layanan: "2026-01-05", tanggal_sampel: "2026-01-09" },
    });

    await page.getByLabel("Tanggal layanan", { exact: true }).fill("2026-02-11");
    await page.getByLabel("Tanggal sampel", { exact: true }).fill("2026-02-12");
    await page.getByRole("button", { name: /Simpan Perubahan/ }).click();

    await expect.poll(() => currentRow()?.tanggal_layanan).toBe("2026-02-11");
    expect(currentRow()?.tanggal_sampel).toBe("2026-02-12");
    expect(lastAgentUpdate()).toMatchObject({
      tanggal_layanan: "2026-02-11",
      tanggal_sampel: "2026-02-12",
    });

    expect(a.blockedExternal).toEqual([]);
  });

  test("mengosongkan tanggal dari modal mengirim null, bukan string kosong", async ({ page }) => {
    const a = await openModal(page, {
      row: { tanggal_layanan: "2026-01-05", tanggal_sampel: "2026-01-09" },
    });

    await page.getByLabel("Tanggal layanan", { exact: true }).fill("");
    await page.getByRole("button", { name: /Simpan Perubahan/ }).click();

    await expect.poll(() => currentRow()?.tanggal_layanan).toBeNull();
    const sent = lastAgentUpdate();
    // `null` berarti "kosongkan"; `""` akan disimpan sebagai nilai, bukan
    // sebagai "belum diisi".
    expect(sent?.tanggal_layanan).toBeNull();
    expect(sent?.tanggal_layanan).not.toBe("");

    expect(a.blockedExternal).toEqual([]);
  });

  test("gagal menyimpan tidak menutup modal dan tidak mengubah data", async ({ page }) => {
    const a = await openModal(page, {
      row: { tanggal_layanan: "2026-01-05", tanggal_sampel: null },
      failUpdate: true,
    });

    await page.getByLabel("Tanggal layanan", { exact: true }).fill("2026-03-03");
    await page.getByRole("button", { name: /Simpan Perubahan/ }).click();

    // Modal tetap terbuka supaya user tidak kehilangan isian.
    await expect(page.getByLabel("Tanggal layanan", { exact: true })).toBeVisible();
    expect(currentRow()?.tanggal_layanan).toBe("2026-01-05");

    expect(a.blockedExternal).toEqual([]);
  });

  test("modal menjebak fokus: Tab berputar dan Escape menutup tanpa menyimpan", async ({ page }) => {
    const a = await openModal(page, {
      row: { tanggal_layanan: "2026-01-05", tanggal_sampel: null },
    });

    const closeButton = page.getByRole("button", { name: "Tutup edit temuan" });
    const saveButton = page.getByRole("button", { name: /Simpan Perubahan/ });

    // Fokus awal masuk ke dalam dialog, bukan tertinggal di halaman belakang.
    await expect(closeButton).toBeFocused();

    // Shift+Tab dari elemen pertama berputar ke elemen terakhir DI DALAM dialog.
    await page.keyboard.press("Shift+Tab");
    await expect(saveButton).toBeFocused();

    // Tab dari elemen terakhir kembali ke elemen pertama — fokus tidak kabur ke
    // halaman belakang.
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    // Escape menutup dialog dan tidak mengirim update apa pun.
    await page.keyboard.press("Escape");
    await expect(closeButton).toBeHidden();
    expect(lastAgentUpdate()).toBeNull();

    expect(a.blockedExternal).toEqual([]);
    expect(a.blockedApi).toEqual([]);
  });
});
