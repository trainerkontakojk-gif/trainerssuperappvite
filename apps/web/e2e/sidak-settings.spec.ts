/**
 * E2E perilaku halaman Parameter QA SIDAK (`/sidak/settings`).
 *
 * Hermetic: semua `/api` dijawab harness stateful (`sidakSettingsHarness.ts`),
 * guard jaringan fail-closed, target dibuktikan dev-server lokal. Tidak ada
 * Supabase/produksi yang disentuh.
 *
 * Satu test per kontrak di `plans/markdown/sidak-settings-redesign.md`.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  assertLocalDevOnlyTarget,
  captured,
  capturedWithParam,
  clearFailures,
  clearIndicators,
  expectIsolation,
  failAlways,
  failNext,
  IDS,
  openSettings,
  P_JAN27,
  resetStore,
  startAudit,
} from "./helpers/sidakSettingsHarness";

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test.beforeEach(() => {
  resetStore();
});

async function open(
  page: Page,
  opts: Parameters<typeof openSettings>[2] = {},
) {
  const audit = startAudit();
  await openSettings(page, audit, opts);
  await expect(
    page.getByRole("heading", { level: 1, name: "Parameter QA" }),
  ).toBeVisible({ timeout: 20000 });
  return audit;
}

const versionList = (page: Page) =>
  page.getByRole("navigation", { name: "Riwayat versi" });

/** Geser slider native lewat pointer sungguhan (down, banyak move, up). */
async function dragSlider(slider: Locator, from: number, to: number) {
  const page = slider.page();
  const box = await slider.boundingBox();
  if (!box) throw new Error("slider tidak punya bounding box");
  const thumb = 8;
  const xAt = (value: number) =>
    box.x + thumb + (value / 100) * (box.width - thumb * 2);
  const y = box.y + box.height / 2;
  await page.mouse.move(xAt(from), y);
  await page.mouse.down();
  const steps = Math.abs(to - from) / 5;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(xAt(from + ((to - from) * i) / steps), y);
  }
  await page.mouse.up();
}

test.describe("Parameter QA (SIDAK) settings", () => {
  test("1a layout: judul, tab layanan, versi awal draft, status berbahasa Indonesia", async ({
    page,
  }) => {
    const audit = await open(page);

    await expect(page.getByRole("tablist")).toBeVisible();
    for (const label of ["Call", "Chat", "Email", "CSO", "Pencatatan", "BKO", "SLIK"]) {
      await expect(page.getByRole("tab", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("tab", { name: "Call", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Riwayat versi: v4 Draft, v3 Berlaku, v2 Digantikan; seleksi awal = draft.
    const list = versionList(page);
    await expect(list.getByRole("button", { name: /v4.*Draft.*Efektif Januari 2027/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(list.getByRole("button", { name: /v3.*Berlaku.*Efektif Oktober 2026/ })).toBeVisible();
    await expect(list.getByRole("button", { name: /v2.*Digantikan.*Efektif Maret 2026/ })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Versi 4 · Draft" })).toBeVisible();
    await expect(page.getByText("Efektif mulai Januari 2027")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish…" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hapus draft" })).toBeVisible();

    // Metadata parameter: teks netral berbahasa Indonesia, bukan badge.
    await expect(page.getByText(/N\/A diizinkan/).first()).toBeVisible();
    await expect(page.getByText(/Urutan #3/).first()).toBeVisible();
    await expect(page.getByText(/Ambang 2/).first()).toBeVisible();
    await expect(page.getByText(/Tertaut ke parameter lama/).first()).toBeVisible();

    // Tidak ada status mentah berbahasa Inggris.
    const text = (await page.getByRole("region", { name: "Konten halaman" }).innerText());
    expect(text).not.toMatch(/superseded/i);
    expect(text).not.toMatch(/\bpublished\b/i);
    expect(text).not.toMatch(/Create Revision|Scoring Mode|Versioning/i);

    expectIsolation(audit);
  });

  test("1b slider bobot: satu drag 40 ke 60 mengirim tepat satu PUT, lalu Tersimpan", async ({
    page,
  }) => {
    const audit = await open(page);

    const slider = page.getByRole("slider", { name: "Bobot Non-critical", exact: true });
    await expect(slider).toHaveValue("40");
    await dragSlider(slider, 40, 60);

    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
    // Beri ruang bagi debounce/request susulan: harus tetap satu.
    await page.waitForTimeout(900);

    expect(captured("updateWeights")).toEqual([
      { non_critical_weight: 0.6, critical_weight: 0.4 },
    ]);
    await expect(slider).toHaveValue("60");
    await expect(page.getByText("Critical 40%")).toBeVisible();

    expectIsolation(audit);
  });

  test("1b2 simpan bobot gagal: nilai kembali ke nilai server dan pesan error inline", async ({
    page,
  }) => {
    const audit = await open(page);

    const slider = page.getByRole("slider", { name: "Bobot Non-critical", exact: true });
    const number = page.getByRole("spinbutton", { name: "Bobot Non-critical, angka", exact: true });
    await expect(slider).toHaveValue("40");

    failNext("updateWeights");
    await number.fill("30");
    await number.blur();

    await expect(page.getByText(/Gagal menyimpan bobot/)).toBeVisible();
    expect(captured("updateWeights")).toEqual([
      { non_critical_weight: 0.3, critical_weight: 0.7 },
    ]);
    await expect(slider).toHaveValue("40");
    await expect(number).toHaveValue("40");

    expectIsolation(audit);
  });

  test("1c publish: diff terhadap versi berlaku, nomor versi, konfirmasi wajib, lalu header Berlaku", async ({
    page,
  }) => {
    const audit = await open(page);

    await page.getByRole("button", { name: "Publish…" }).click();
    const dialog = page.getByRole("dialog", { name: "Publish versi" });
    await expect(dialog).toBeVisible();

    // Diff terhadap v3: 1 ditambah, 1 dihapus, 1 diubah, bobot kategori berubah.
    await expect(dialog.getByRole("heading", { name: "Ditambah (1)" })).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Verifikasi Identitas" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Dihapus (1)" })).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Pemahaman Masalah" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Diubah (1)" })).toBeVisible();
    const changed = dialog.getByRole("listitem").filter({ hasText: "Empati" });
    await expect(changed).toContainText("50%");
    await expect(changed).toContainText("30%");
    await expect(dialog.getByRole("heading", { name: "Bobot kategori" })).toBeVisible();
    await expect(dialog).toContainText(/Non-critical\s*50%\s*→\s*40%/);
    await expect(dialog).toContainText(/Critical\s*50%\s*→\s*60%/);

    // Pratinjau nomor versi mengikuti periode efektif.
    await expect(dialog).toContainText("v4");
    await dialog.getByRole("combobox", { name: "Periode efektif" }).click();
    await page.getByRole("option", { name: "November 2026" }).click();
    await expect(dialog).toContainText("v1");
    await dialog.getByRole("combobox", { name: "Periode efektif" }).click();
    await page.getByRole("option", { name: "Januari 2027" }).click();
    await expect(dialog).toContainText("v4");

    // Publish nonaktif sampai konfirmasi dicentang.
    const publish = dialog.getByRole("button", { name: "Publish", exact: true });
    await expect(publish).toBeDisabled();
    await dialog.getByLabel(/Alasan perubahan/).fill("Perbaikan bobot kategori");
    await dialog.getByRole("checkbox", { name: /Saya telah meninjau/ }).check();
    await expect(publish).toBeEnabled();
    await publish.click();

    await expect(dialog).toBeHidden();
    expect(captured("publish")).toEqual([
      { change_reason: "Perbaikan bobot kategori", effective_period_id: P_JAN27 },
    ]);

    // Seleksi segar: versi yang sama kini Berlaku tanpa aksi draft.
    await expect(page.getByRole("heading", { name: "Versi 4 · Berlaku" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Publish/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hapus draft" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buat revisi" })).toBeVisible();
    await expect(
      versionList(page).getByRole("button", { name: /v4.*Berlaku/ }),
    ).toHaveAttribute("aria-current", "true");

    expectIsolation(audit);
  });

  test("1d hapus parameter: dialog konfirmasi, Batal tanpa DELETE, Hapus tepat satu DELETE", async ({
    page,
  }) => {
    const audit = await open(page);

    const trigger = page.getByRole("button", { name: "Hapus Empati", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Hapus parameter?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Empati");

    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toBeHidden();
    expect(captured("deleteIndicator")).toHaveLength(0);
    await expect(trigger).toBeVisible();

    await trigger.click();
    await page
      .getByRole("dialog", { name: "Hapus parameter?" })
      .getByRole("button", { name: "Hapus", exact: true })
      .click();

    await expect(page.getByRole("button", { name: "Hapus Empati", exact: true })).toHaveCount(0);
    expect(captured("deleteIndicator")).toHaveLength(1);
    expect(capturedWithParam("deleteIndicator")[0].param).toBe(
      "5e771195-0000-4000-8000-000000000312",
    );

    expectIsolation(audit);
  });

  test("1e hapus draft lewat header: dialog konfirmasi (bukan confirm native), seleksi jatuh ke versi berlaku", async ({
    page,
  }) => {
    let nativeDialogs = 0;
    page.on("dialog", async (native) => {
      nativeDialogs += 1;
      await native.dismiss();
    });
    const audit = await open(page);

    await page.getByRole("button", { name: "Hapus draft" }).click();
    const dialog = page.getByRole("dialog", { name: "Hapus draft?" });
    await expect(dialog).toBeVisible();
    expect(captured("deleteVersion")).toHaveLength(0);

    await dialog.getByRole("button", { name: "Hapus draft" }).click();
    await expect(dialog).toBeHidden();

    expect(nativeDialogs).toBe(0);
    expect(capturedWithParam("deleteVersion")).toEqual([
      { body: null, param: IDS.callV4 },
    ]);
    await expect(page.getByRole("heading", { name: "Versi 3 · Berlaku" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hapus draft" })).toHaveCount(0);

    expectIsolation(audit);
  });

  test("1f dialog tambah/edit: Escape menutup, fokus kembali ke pemicu, payload sama dengan indicatorFormToPayload", async ({
    page,
  }) => {
    const audit = await open(page);

    const add = page.getByRole("button", { name: "Tambah parameter", exact: true });
    await add.click();
    const addDialog = page.getByRole("dialog", { name: "Tambah parameter" });
    await expect(addDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(addDialog).toBeHidden();
    await expect(add).toBeFocused();

    await add.click();
    await addDialog.getByLabel("Nama parameter").fill("Kejelasan Suara");
    await addDialog.getByRole("combobox", { name: "Kategori" }).click();
    await page.getByRole("option", { name: "Critical", exact: true }).click();
    await addDialog.getByLabel("Bobot (%)").fill("15");
    await addDialog.getByLabel("Ambang").fill("2");
    await addDialog.getByLabel("Urutan").fill("3");
    await addDialog.getByRole("checkbox", { name: "N/A diizinkan" }).check();
    await addDialog.getByRole("button", { name: "Tambah parameter" }).click();
    await expect(addDialog).toBeHidden();

    expect(captured("addIndicator")).toEqual([
      {
        service_type: "call",
        parameter_group: null,
        name: "Kejelasan Suara",
        category: "critical",
        bobot: 0.15,
        has_na: true,
        threshold: 2,
        sort_order: 3,
      },
    ]);
    await expect(page.getByText("Kejelasan Suara")).toBeVisible();

    const edit = page.getByRole("button", { name: "Edit Empati", exact: true });
    await edit.click();
    const editDialog = page.getByRole("dialog", { name: "Edit parameter" });
    await expect(editDialog.getByLabel("Nama parameter")).toHaveValue("Empati");
    await expect(editDialog.getByLabel("Bobot (%)")).toHaveValue("30");
    await editDialog.getByLabel("Bobot (%)").fill("35");
    await editDialog.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(editDialog).toBeHidden();

    expect(captured("updateIndicator")).toEqual([
      {
        parameter_group: null,
        name: "Empati",
        category: "non_critical",
        bobot: 0.35,
        has_na: false,
        sort_order: 3,
      },
    ]);

    expectIsolation(audit);
  });

  test("1g SLIK: teks porsi kategori mengikuti bobot versi, bukan angka tetap", async ({
    page,
  }) => {
    const audit = await open(page);

    await page.getByRole("tab", { name: "SLIK", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Versi 1 · Draft" })).toBeVisible();
    await expect(page.getByText("Pemeriksaan Data", { exact: true })).toBeVisible();
    await expect(page.getByText(/porsi Non-critical 40% dan Critical 60%/)).toBeVisible();

    const number = page.getByRole("spinbutton", { name: "Bobot Non-critical, angka", exact: true });
    await number.fill("70");
    await number.blur();
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
    expect(captured("updateWeights")).toEqual([
      { non_critical_weight: 0.7, critical_weight: 0.3 },
    ]);
    await expect(page.getByText(/porsi Non-critical 70% dan Critical 30%/)).toBeVisible();
    await expect(page.getByText(/Non-critical 40% dan Critical 60%/)).toHaveCount(0);

    expectIsolation(audit);
  });

  test("1h layanan tanpa versi: CTA Buat baseline mengirim POST tanpa source_version_id", async ({
    page,
  }) => {
    const audit = await open(page);

    // Tanpa baseline sama sekali: CTA menjadi Buat draft baru.
    await page.getByRole("tab", { name: "Chat", exact: true }).click();
    await expect(page.getByText(/Belum ada versi untuk Chat/)).toBeVisible();
    await expect(page.getByText(/Belum ada parameter baseline/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Buat draft baru" })).toBeVisible();

    await page.getByRole("tab", { name: "Email", exact: true }).click();
    await expect(page.getByText(/Belum ada versi untuk Email/)).toBeVisible();
    await expect(page.getByText(/7 parameter/)).toBeVisible();

    await page.getByRole("button", { name: "Buat baseline" }).click();
    expect(captured("createVersion")).toEqual([{ service_type: "email" }]);
    await expect(page.getByRole("heading", { name: "Versi 1 · Draft" })).toBeVisible();
    await expect(page.getByText("Parameter email 1")).toBeVisible();

    expectIsolation(audit);
  });

  test("1k buat revisi dari versi berlaku mengirim source_version_id dan memilih draft baru", async ({
    page,
  }) => {
    const audit = await open(page);

    await versionList(page).getByRole("button", { name: /v3.*Berlaku/ }).click();
    await expect(page.getByRole("heading", { name: "Versi 3 · Berlaku" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish…" })).toHaveCount(0);

    // Draft v4 sudah ada; hapus agar revisi baru bernomor v4.
    await versionList(page).getByRole("button", { name: /v4.*Draft/ }).click();
    await page.getByRole("button", { name: "Hapus draft" }).click();
    await page.getByRole("dialog", { name: "Hapus draft?" }).getByRole("button", { name: "Hapus draft" }).click();
    await expect(page.getByRole("heading", { name: "Versi 3 · Berlaku" })).toBeVisible();

    await page.getByRole("button", { name: "Buat revisi" }).click();
    expect(captured("createVersion")).toEqual([
      { service_type: "call", source_version_id: IDS.callV3 },
    ]);
    await expect(page.getByRole("heading", { name: "Versi 4 · Draft" })).toBeVisible();
    await expect(page.getByText("Salam Pembuka")).toBeVisible();

    expectIsolation(audit);
  });

  test("1m draft kosong: CTA Buat revisi dari versi berlaku mengirim source_version_id", async ({
    page,
  }) => {
    clearIndicators(IDS.callV4);
    const audit = await open(page);

    await expect(page.getByText("Belum ada parameter di versi ini.")).toBeVisible();
    await page.getByRole("button", { name: "Buat revisi dari versi berlaku" }).click();
    expect(captured("createVersion")).toEqual([
      { service_type: "call", source_version_id: IDS.callV3 },
    ]);
    await expect(page.getByRole("heading", { name: "Versi 5 · Draft" })).toBeVisible();
    await expect(page.getByText("Salam Pembuka")).toBeVisible();

    expectIsolation(audit);
  });

  test("1l gagal memuat versi: pesan error dengan Coba lagi", async ({ page }) => {
    failAlways("listVersions");
    const audit = startAudit();
    await openSettings(page, audit);

    await expect(page.getByRole("alert").filter({ hasText: /Gagal memuat/ })).toBeVisible({
      timeout: 20000,
    });
    clearFailures();
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.getByRole("heading", { name: "Versi 4 · Draft" })).toBeVisible();
  });

  test("1i responsif: 1440 dua kolom; 390 Select Versi, tanpa overflow, kontrol 44px", async ({
    page,
  }) => {
    const audit = await open(page, { viewport: { width: 1440, height: 900 } });

    // Desktop: riwayat di kiri, detail di kanan, tanpa Select Versi.
    const list = versionList(page);
    await expect(list).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Versi", exact: true })).toBeHidden();
    const listBox = await list.boundingBox();
    const headingBox = await page.getByRole("heading", { name: "Versi 4 · Draft" }).boundingBox();
    expect(listBox && headingBox && listBox.x + listBox.width <= headingBox.x).toBeTruthy();

    // Mobile 390: Select menggantikan sidebar.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(list).toBeHidden();
    const select = page.getByRole("combobox", { name: "Versi", exact: true });
    await expect(select).toBeVisible();
    await select.click();
    await page.getByRole("option", { name: /v3.*Berlaku/ }).click();
    await expect(page.getByRole("heading", { name: "Versi 3 · Berlaku" })).toBeVisible();
    await select.click();
    await page.getByRole("option", { name: /v4.*Draft/ }).click();
    await expect(page.getByRole("heading", { name: "Versi 4 · Draft" })).toBeVisible();

    // Kontrol di area konten minimal 44px.
    const small = await page
      .getByRole("region", { name: "Konten halaman" })
      .evaluate((region) => {
        const bad: string[] = [];
        const selector =
          "button, [role=tab], [role=combobox], input:not([type=hidden]), select, textarea, a[href]";
        for (const el of Array.from(region.querySelectorAll<HTMLElement>(selector))) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          // Input form tersembunyi milik Select (1x1, visually-hidden) bukan kontrol.
          if (rect.width <= 1 && rect.height <= 1) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden") continue;
          if (rect.height < 43.5 || rect.width < 43.5) {
            bad.push(
              `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24) ?? ""}] ${Math.round(rect.width)}x${Math.round(rect.height)}`,
            );
          }
        }
        return bad;
      });
    expect(small, `kontrol < 44px: ${small.join(" | ")}`).toEqual([]);

    // Tanpa overflow horizontal di lebar kunci.
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        region:
          (document.querySelector('[aria-label="Konten halaman"]') as HTMLElement | null)
            ?.scrollWidth ?? 0,
        regionClient:
          (document.querySelector('[aria-label="Konten halaman"]') as HTMLElement | null)
            ?.clientWidth ?? 0,
      }));
      expect(overflow.doc, `overflow dokumen di ${width}px`).toBeLessThanOrEqual(0);
      expect(overflow.region, `overflow konten di ${width}px`).toBeLessThanOrEqual(
        overflow.regionClient,
      );
    }

    expectIsolation(audit);
  });
});
