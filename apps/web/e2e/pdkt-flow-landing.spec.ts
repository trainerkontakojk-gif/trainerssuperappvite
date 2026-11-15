/**
 * PDKT — landing + modal workspace (hermetic).
 *
 * Modul terbesar tanpa E2E (plan 025 Wave 3, spec #10–#12). Semua `/api` dimock;
 * mutasi data nyata tetap milik spec backend loopback.
 *
 * Fixture memakai `data: null` / `[]`, yaitu keadaan pengguna baru tanpa
 * settings tersimpan — bentuk yang sama dengan yang diasumsikan unit test
 * `pdkt-landing` (`useApi` mengembalikan `data: null`). Handler asli juga
 * membalas `null` saat `readPdktSettings` tidak menemukan settings.
 */

import { expect, test } from "@playwright/test";
import {
  APP_ORIGIN,
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import type { SessionHistory } from "../src/routes/pdkt/utils/sessionHistory";
import {
  OPEN_MAIL,
  NEWER_OPEN_MAIL,
  REPLIED_MAIL,
  EVALUATED_HISTORY,
  COMPANY_SCENARIO,
  OJK_SCENARIO,
  SAVED_SETTINGS,
  USAGE_SUMMARY_PATH,
  USAGE_SUMMARY_MOCK,
  PDKT_USAGE,
  pdktMocks,
  openScenarioSettings,
  enterWorkspace,
} from "./helpers/pdktFlowHarness";

test.describe("PDKT (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("landing PDKT menampilkan hero, aksi, dan keadaan kosong", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Pahami keluhannya\.\s*Balas dengan tepat\./,
      }),
    ).toBeVisible({ timeout: 20000 });
    // Kepanjangan PDKT dijelaskan di paragraf hero; pill "PDKT · …" tidak ada lagi.
    const intro = page.getByTestId("pdkt-hero-intro");
    await expect(intro).toContainText(
      "PDKT (Paham Dulu Kasih Tanggapan) adalah latihan membalas email konsumen.",
    );
    await expect(intro).toContainText(
      "Baca emailnya sampai paham, tulis balasan dengan kata-kata Anda sendiri, lalu AI menelaah balasan itu dan menunjukkan bagian yang perlu diperbaiki.",
    );
    await expect(page.getByText("PDKT · Simulasi email konsumen")).toHaveCount(
      0,
    );
    // Daftar centang "janji" di hero dihapus: salah satunya tidak benar untuk
    // skenario email tetap.
    for (const point of [
      "Kasus selalu baru",
      "Tanpa bocoran jawaban",
      "Ditelaah AI",
    ]) {
      await expect(page.getByText(point, { exact: true })).toHaveCount(0);
    }
    const nav = page.getByRole("navigation", { name: "Menu PDKT" });
    for (const label of ["Riwayat", "Pemakaian AI", "Pengaturan"]) {
      await expect(
        nav.getByRole("button", { name: new RegExp(`^${label}`) }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    // "Atur skenario" sama dengan "Pengaturan" di menu; hanya satu yang tersisa.
    await expect(
      page.getByRole("button", { name: "Atur skenario" }),
    ).toHaveCount(0);

    // Pengguna baru: satu blok penjelasan, bukan deretan bagian kosong.
    await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);
    const start = page.getByRole("region", { name: "Belum ada latihan" });
    await expect(start).toBeVisible();
    await expect(start).toContainText(
      "Setelah balasan pertama Anda ditelaah, halaman ini menampilkan email yang belum dibalas, skor rata-rata, aspek yang perlu dilatih, dan hasil telaah terbaru.",
    );
    for (const section of [
      "Progres latihan",
      "Belum dibalas",
      "Fokus berikutnya",
      "Hasil telaah terbaru",
    ]) {
      await expect(page.getByRole("region", { name: section })).toHaveCount(0);
    }
    await start.getByRole("button", { name: "Buka kotak masuk" }).click();
    await enterWorkspace(page);

    // Copy landing lama tidak boleh kembali.
    for (const stale of [
      /Latih balasan email/,
      /PDKT — singkatan dari/,
      /tanpa petunjuk jawaban/,
      /Mulai latihan/,
      /Daftar email masuk/,
      /Pemakaian bulan ini/,
    ]) {
      await expect(page.getByText(stale)).toHaveCount(0);
    }

    await waitForMockedApi(audit, [
      "/pdkt/settings",
      "/pdkt/scenarios",
      "/pdkt/consumer-types",
    ]);
    expectHermetic(audit);
  });

  test("landing PDKT merangkum progres dan membuka email yang belum dibalas", async ({
    page,
  }) => {
    const reviewing = {
      ...EVALUATED_HISTORY[0],
      id: "pdkt-processing-1",
      evaluation: null,
      evaluationStatus: "processing",
    } as SessionHistory;
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      // Urutan API mengikuti aktivitas terbaru; email terlama tampil paling atas.
      apiMocks: pdktMocks(
        [
          {
            ...EVALUATED_HISTORY[0],
            // Public history derives the subject from the replay email, not
            // from the evaluator's private scenario snapshot.
            emails: [REPLIED_MAIL.detail.inbound_email],
          },
          reviewing,
        ],
        [NEWER_OPEN_MAIL, OPEN_MAIL, REPLIED_MAIL],
      ),
    });
    await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);

    // Ringkasan progres berupa satu baris kalimat, bukan kartu statistik.
    const progress = page.getByRole("region", { name: "Progres latihan" });
    const summary = progress.getByTestId("pdkt-progress-summary");
    await expect(summary).toContainText("2 email belum dibalas", {
      timeout: 20000,
    });
    await expect(summary).toContainText("85 rata-rata skor dari sesi terakhir");
    await expect(summary).toContainText("1 sedang ditelaah AI");
    await expect(page.getByTestId(/^pdkt-stat-/)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Belum ada latihan" }),
    ).toHaveCount(0);

    const unreplied = page.getByRole("region", { name: "Belum dibalas" });
    const rows = unreplied.getByRole("button", { name: /Transaksi gagal/ });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(OPEN_MAIL.list.subject);
    await expect(rows.nth(1)).toContainText(NEWER_OPEN_MAIL.list.subject);

    // Aspek terendah EVALUATED_HISTORY adalah Kualitas OJK (80).
    const focus = page.getByRole("region", { name: "Fokus berikutnya" });
    await expect(focus).toContainText("Kualitas OJK");
    await expect(focus).toContainText("80");

    const recent = page.getByRole("region", { name: "Hasil telaah terbaru" });
    await expect(recent.getByRole("row")).toHaveCount(2); // header + 1 sesi
    await expect(recent).toContainText(REPLIED_MAIL.list.subject);
    await expect(recent).toContainText("85");

    // Membuka email terlama: kotak masuk terbuka dengan email itu terpilih,
    // bukan email pertama yang dipilih otomatis.
    await rows.nth(0).click();
    await enterWorkspace(page);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    expect(
      audit.mockedApi.some((entry) =>
        entry.endsWith(`/pdkt/mailbox/${NEWER_OPEN_MAIL.list.id}`),
      ),
      "email lain tidak boleh dibuka lebih dulu",
    ).toBe(false);
    expectHermetic(audit);
  });

  test("animasi tahap PDKT bisa dijeda", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    const pause = page.getByRole("button", { name: "Jeda animasi" });
    await expect(pause).toBeVisible({ timeout: 20000 });
    // Tombol jeda 44px harus muat di bar judulnya (h-11 hanya 38,5px di root
    // 14px), bukan menonjol keluar bar.
    // Ukuran layout (offset*), bukan boundingBox: animasi masuk halaman memakai
    // transform sehingga posisi visual bisa bergeser selama diukur.
    const fit = await pause.evaluate((button: HTMLElement) => ({
      button: button.offsetHeight,
      bar: (button.parentElement as HTMLElement).offsetHeight,
      top: button.offsetTop - (button.parentElement as HTMLElement).offsetTop,
    }));
    expect(fit.button).toBeGreaterThanOrEqual(44);
    expect(fit.bar).toBeGreaterThanOrEqual(fit.button);
    expect(fit.top).toBeGreaterThanOrEqual(0);
    await pause.click();
    await expect(
      page.getByRole("button", { name: "Putar animasi" }),
    ).toBeVisible();
    await expect(page.getByTestId("pdkt-stage-demo")).toHaveAttribute(
      "data-paused",
      "true",
    );
    expectHermetic(audit);
  });

  test("Pengaturan memakai menu, daftar skenario, dan penanda perubahan baru", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/settings",
          body: { success: true, data: SAVED_SETTINGS },
          headers: { "x-settings-version": "absent" },
        },
        ...pdktMocks([]).filter(
          (mock) => mock.path !== "/api/v1/pdkt/settings",
        ),
      ],
    });
    await waitForMockedApi(audit, ["GET /api/v1/pdkt/settings"]);

    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "Pengaturan PDKT" });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(
      dialog.getByText("Berlaku untuk sesi yang Anda mulai berikutnya."),
    ).toBeVisible();
    for (const tab of [
      /^Skenario/,
      /^Karakter konsumen/,
      /^Identitas konsumen/,
      /^Gaya & AI/,
    ]) {
      await expect(dialog.getByRole("tab", { name: tab })).toBeVisible();
    }

    const companyRow = dialog.getByRole("listitem").filter({
      hasText: COMPANY_SCENARIO.title,
    });
    await expect(companyRow).toContainText("Pembiayaan");
    await expect(companyRow).toContainText("Hanya tembusan ke OJK");
    await expect(companyRow).toContainText("Dibuat AI");
    const ojkRow = dialog.getByRole("listitem").filter({
      hasText: OJK_SCENARIO.title,
    });
    await expect(ojkRow).toContainText("Langsung ke OJK");
    await expect(ojkRow).toContainText("Email tetap");

    // Filter kategori dan pencarian menyaring daftar tanpa mengubah data.
    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: "Asuransi" })
      .click();
    await expect(companyRow).toHaveCount(0);
    await expect(ojkRow).toBeVisible();
    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: "Semua" })
      .click();
    await dialog
      .getByRole("searchbox", { name: "Cari skenario" })
      .fill("lunas");
    await expect(ojkRow).toHaveCount(0);
    await expect(companyRow).toBeVisible();

    await expect(dialog.getByText("Belum disimpan")).toHaveCount(0);
    const toggle = companyRow.getByRole("switch", {
      name: `Nonaktifkan ${COMPANY_SCENARIO.title}`,
    });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(
      companyRow.getByRole("switch", {
        name: `Aktifkan ${COMPANY_SCENARIO.title}`,
      }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();

    // Karakter konsumen: daftar baris dengan pilihan "Acak", bukan kartu.
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    await expect(dialog).toContainText("Pilih Acak agar peserta");
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Acak" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Karakter baru" }),
    ).toBeVisible();

    await dialog.getByRole("tab", { name: /^Gaya & AI/ }).click();
    await expect(
      dialog.getByRole("switch", { name: "Gambar lampiran" }),
    ).toBeVisible();

    // Menutup dengan perubahan belum disimpan meminta konfirmasi lewat dialog
    // aplikasi, bukan `window.confirm`.
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });
    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    const discard = page.getByRole("dialog", {
      name: "Tutup tanpa menyimpan?",
    });
    await expect(discard).toBeVisible();
    await expect(discard).toContainText(
      "Perubahan yang belum disimpan akan hilang.",
    );
    await discard.getByRole("button", { name: "Lanjut mengubah" }).click();
    await expect(discard).toHaveCount(0);
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();

    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Tutup tanpa menyimpan?" })
      .getByRole("button", { name: "Buang perubahan" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("Pulihkan bawaan meminta konfirmasi sebelum menyimpan", async ({
    page,
  }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    const posts = () =>
      audit.mockedApi.filter((call) =>
        call.startsWith("POST /api/v1/pdkt/settings"),
      ).length;

    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Pulihkan pengaturan bawaan?",
    });
    await expect(confirm).toContainText("langsung disimpan");
    await confirm.getByRole("button", { name: "Batal" }).click();
    await expect(confirm).toHaveCount(0);
    expect(posts()).toBe(0);

    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    await page
      .getByRole("dialog", { name: "Pulihkan pengaturan bawaan?" })
      .getByRole("button", { name: "Pulihkan bawaan" })
      .click();
    await expect.poll(posts, { timeout: 20000 }).toBe(1);

    expectHermetic(audit);
  });

  test("Riwayat membuka halaman riwayat, bukan modal", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Riwayat/ })
      .click();

    await expect(page).toHaveURL(/\/pdkt\/history$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Riwayat latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Belum ada sesi latihan")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Mulai simulasi" }),
    ).toHaveAttribute("href", "/pdkt");

    expectHermetic(audit);
  });

  test("Pemakaian AI membuka popover rincian bulan ini", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        { ...USAGE_SUMMARY_MOCK, body: { success: true, data: PDKT_USAGE } },
        ...pdktMocks([]).filter((mock) => mock.path !== USAGE_SUMMARY_PATH),
      ],
    });

    const trigger = page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pemakaian AI/ });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const popover = page.getByRole("dialog", {
      name: "Pemakaian AI · Oktober 2026",
    });
    await expect(popover).toBeVisible({ timeout: 20000 });
    await expect(popover.getByText(/^Rp\s?48\.320$/)).toBeVisible();
    await expect(popover.getByText("74 permintaan AI")).toBeVisible();

    // Rincian per jenis permintaan memakai bahasa peserta, bukan nama action.
    const rows = popover.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Menelaah balasan");
    await expect(rows.nth(0)).toContainText(/Rp\s?26\.920/);
    await expect(rows.nth(1)).toContainText("Membuat email konsumen");
    await expect(rows.nth(1)).toContainText(/Rp\s?21\.400/);
    await expect(
      popover.getByText("Perkiraan biaya dari pemakaian AI."),
    ).toBeVisible();

    // Popover kecil, bukan modal lama dengan kartu token.
    for (const stale of [
      "Total Tokens",
      "Input Tokens",
      "Pemakaian Bulan Ini",
    ]) {
      await expect(page.getByText(stale)).toHaveCount(0);
    }
    const box = await popover.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(380);

    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await waitForMockedApi(audit, [USAGE_SUMMARY_PATH]);
    expectHermetic(audit);
  });

  test("popover Pemakaian AI muat di layar ponsel dan bisa dicoba lagi saat gagal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          ...USAGE_SUMMARY_MOCK,
          status: 500,
          body: {
            success: false,
            error: { code: "DATABASE_ERROR", message: "Server sedang sibuk." },
          },
        },
        ...pdktMocks([]).filter((mock) => mock.path !== USAGE_SUMMARY_PATH),
      ],
    });

    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pemakaian AI/ })
      .click();

    const popover = page.getByRole("dialog", { name: /^Pemakaian AI/ });
    await expect(
      popover.getByText("Data pemakaian belum bisa dimuat."),
    ).toBeVisible({ timeout: 20000 });
    const box = await popover.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(390);

    // Coba lagi meminta ulang ringkasan.
    const before = audit.mockedApi.filter((url) =>
      url.includes(USAGE_SUMMARY_PATH),
    ).length;
    await popover.getByRole("button", { name: "Coba lagi" }).click();
    await expect
      .poll(
        () =>
          audit.mockedApi.filter((url) => url.includes(USAGE_SUMMARY_PATH))
            .length,
      )
      .toBeGreaterThan(before);

    expectHermetic(audit);
  });

  test("Mulai simulasi membuka workspace mailbox", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();

    // Dua jalur produk yang sah, tergantung apakah profil sudah termuat saat
    // diklik: `canPickParticipant` true → picker peserta muncul dulu, false →
    // view langsung berpindah. Keduanya harus berakhir di workspace mailbox.
    const picker = page
      .getByRole("dialog")
      .filter({ hasText: "Pilih peserta latihan" });
    const mailboxEmpty = page.getByText(/Pilih email dari kotak masuk/);

    await expect
      .poll(
        async () =>
          (await picker.isVisible()) || (await mailboxEmpty.isVisible()),
        { timeout: 20000 },
      )
      .toBe(true);

    if (await picker.isVisible()) {
      // "Diri sendiri" sudah terpilih secara default.
      await picker.getByRole("button", { name: "Mulai" }).click();
    }

    await expect(mailboxEmpty).toBeVisible({ timeout: 20000 });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("editor skenario satu halaman mengubah kasus, arah balasan, dan kunci jawaban", async ({
    page,
  }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    await dialog
      .getByRole("button", { name: `Ubah ${COMPANY_SCENARIO.title}` })
      .click({ timeout: 20000 });

    // Satu halaman: tiga bagian bernomor tampil bersamaan, tanpa langkah "Lanjut".
    await expect(
      dialog.getByRole("heading", { name: "Ubah skenario" }),
    ).toBeVisible();
    for (const section of ["Kasus", "Arah balasan", "Kunci jawaban"]) {
      await expect(dialog.getByRole("region", { name: section })).toBeVisible();
    }
    await expect(dialog.getByRole("button", { name: "Lanjut" })).toHaveCount(0);

    const title = dialog.getByLabel(/^Judul skenario/);
    await expect(title).toHaveValue(COMPANY_SCENARIO.title);
    await title.fill("Pinjaman lunas tetapi masih ditelepon penagih");

    const direction = dialog.getByRole("radiogroup", { name: "Arah balasan" });
    await expect(
      direction.getByRole("radio", { name: /Hanya tembusan ke OJK/ }),
    ).toBeChecked();
    await direction
      .getByRole("radio", { name: /Tembusan, tetapi meminta bantuan OJK/ })
      .check();
    // Petunjuk kunci jawaban mengikuti arah yang dipilih.
    const answer = dialog.getByRole("region", { name: "Kunci jawaban" });
    await expect(answer).toContainText("bukan sekadar ucapan terima kasih");
    await answer
      .getByRole("textbox", { name: "Kunci jawaban" })
      .fill("Minta bukti pelunasan dan jelaskan tindak lanjut OJK.");

    await dialog.getByRole("button", { name: "Terapkan perubahan" }).click();
    const row = dialog.getByRole("listitem").filter({
      hasText: "Pinjaman lunas tetapi masih ditelepon penagih",
    });
    await expect(row).toContainText("Tembusan, tetapi meminta bantuan OJK");

    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/pdkt/settings",
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    const saved = (await saveRequest).postDataJSON() as {
      settings: { scenarios: Array<Record<string, unknown>> };
    };
    expect(
      saved.settings.scenarios.find((item) => item.id === COMPANY_SCENARIO.id),
    ).toMatchObject({
      title: "Pinjaman lunas tetapi masih ditelepon penagih",
      primaryRecipientType: "reported_company",
      ojkRequestInBody: true,
      expectedAnswer: "Minta bukti pelunasan dan jelaskan tindak lanjut OJK.",
    });
    expectHermetic(audit);
  });

  test("skenario baru divalidasi dan bisa memakai email tulisan sendiri", async ({
    page,
  }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    await dialog
      .getByRole("button", { name: "Skenario baru" })
      .click({ timeout: 20000 });
    await expect(
      dialog.getByRole("heading", { name: "Skenario baru" }),
    ).toBeVisible();

    // Kosong: tidak tersimpan, pesan muncul, fokus ke isian pertama yang salah.
    await dialog.getByRole("button", { name: "Tambahkan skenario" }).click();
    await expect(dialog.getByText("Judul skenario wajib diisi.")).toBeVisible();
    await expect(dialog.getByLabel(/^Judul skenario/)).toBeFocused();

    await dialog
      .getByLabel(/^Judul skenario/)
      .fill("Klaim ditolak tanpa alasan");
    await dialog.getByLabel(/^Kategori/).selectOption("Asuransi");
    const mode = dialog.getByRole("radiogroup", {
      name: "Isi email dibuat oleh",
    });
    await mode
      .getByRole("radio", { name: "Ditulis sendiri (email tetap)" })
      .click();
    // Mode tulis sendiri mengganti ringkasan dengan isi email.
    await expect(dialog.getByLabel(/^Ringkasan masalah/)).toHaveCount(0);
    await dialog
      .getByRole("textbox", { name: /^Subjek email/ })
      .fill("Klaim saya ditolak");
    await dialog
      .getByRole("textbox", { name: /^Isi email/ })
      .fill("Selamat siang, klaim mobil saya ditolak tanpa penjelasan.");

    await dialog.getByRole("button", { name: "Tambahkan skenario" }).click();
    const row = dialog.getByRole("listitem").filter({
      hasText: "Klaim ditolak tanpa alasan",
    });
    await expect(row).toContainText("Asuransi");
    await expect(row).toContainText("Email tetap");
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();
    expectHermetic(audit);
  });

  test("skenario dihapus dari editor setelah konfirmasi", async ({ page }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    await dialog
      .getByRole("button", { name: `Ubah ${OJK_SCENARIO.title}` })
      .click({ timeout: 20000 });
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });
    await dialog.getByRole("button", { name: "Hapus skenario" }).click();
    const confirmDelete = page.getByRole("dialog", {
      name: "Hapus skenario ini?",
    });
    await expect(confirmDelete).toBeVisible();
    await expect(confirmDelete).toContainText(
      "Perubahan berlaku setelah Anda memilih Simpan.",
    );
    await confirmDelete.getByRole("button", { name: "Hapus skenario" }).click();
    await expect(confirmDelete).toHaveCount(0);

    await expect(
      dialog.getByRole("heading", { name: "Skenario", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("listitem").filter({ hasText: OJK_SCENARIO.title }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("listitem").filter({ hasText: COMPANY_SCENARIO.title }),
    ).toBeVisible();
    expectHermetic(audit);
  });
});

test.describe("PDKT pilihan model AI (hermetic)", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  test("hanya Gemini 4 Hydrogen, 3.8 Flash, dan 3.5 Flash Lite; Flash Lite lama tetap Flash Lite", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/settings",
          body: {
            success: true,
            data: { ...SAVED_SETTINGS, selectedModel: "gemini-3.1-flash-lite" },
          },
          headers: { "x-settings-version": "absent" },
        },
        ...pdktMocks([]).filter(
          (mock) => mock.path !== "/api/v1/pdkt/settings",
        ),
      ],
    });
    await waitForMockedApi(audit, ["GET /api/v1/pdkt/settings"]);
    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "Pengaturan PDKT" });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await dialog.getByRole("tab", { name: /^Gaya & AI/ }).click();
    const models = dialog
      .getByRole("radiogroup", { name: "Model AI" })
      .getByRole("radio");
    await expect(models).toHaveCount(3);
    await expect(
      models.filter({ hasText: "Gemini 4 Hydrogen" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      models.filter({ hasText: "Gemini 3.8 Flash" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      models.filter({ hasText: "Gemini 3.5 Flash Lite" }),
    ).toHaveAttribute("aria-checked", "true");
    expectHermetic(audit);
  });
});
