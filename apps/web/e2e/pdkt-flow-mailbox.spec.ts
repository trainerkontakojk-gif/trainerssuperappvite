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
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { E2E_SUPABASE_URL } from "./helpers/e2eTargets";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  MAIL_AT,
  PIXEL_PNG,
  SESSION_CONFIG,
  mailboxItem,
  OPEN_MAIL,
  REPLIED_MAIL,
  EVALUATED_HISTORY,
  COMPANY_SCENARIO,
  OJK_SCENARIO,
  SAVED_SETTINGS,
  PDKT_USAGE,
  pdktMocks,
  enterWorkspace,
  openWorkspace,
  overrideJson,
  stageNav,
  reviewHeading,
  expectSearch,
} from "./helpers/pdktFlowHarness";

test.describe("PDKT (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("panel email tidak menampilkan penerima email kepada peserta", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([], [OPEN_MAIL]),
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await enterWorkspace(page);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);

    // Isi email tampil; penerima (arah balasan) tidak.
    const main = page.locator("main").first();
    await expect(
      main.getByText(OPEN_MAIL.detail.inbound_email.body).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(main.getByText(/Kepada:/)).toHaveCount(0);
    await expect(main.getByText(OPEN_MAIL.detail.inbound_email.to)).toHaveCount(
      0,
    );
    await expect(main.getByText("konsumen@ojk.go.id")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("menghapus email memakai dialog konfirmasi, bukan window.confirm", async ({
    page,
  }) => {
    const deletePath = `/api/v1/pdkt/mailbox/${OPEN_MAIL.list.id}`;
    const audit = await openWorkspace(page, [
      {
        method: "DELETE",
        path: deletePath,
        body: { success: true, data: null },
      },
      ...pdktMocks([], [OPEN_MAIL]),
    ]);
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    const deletes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "DELETE") deletes.push(request.url());
    });

    const deleteButton = page.getByRole("button", {
      name: "Hapus email",
      exact: true,
    });
    await deleteButton.click();
    const confirm = page.getByRole("dialog", { name: "Hapus email ini?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Batal" }).click();
    await expect(confirm).toHaveCount(0);
    expect(deletes, "Batal tidak boleh menghapus").toEqual([]);

    await deleteButton.click();
    const deleted = page.waitForRequest(
      (request) =>
        request.method() === "DELETE" && request.url().endsWith(deletePath),
    );
    await page
      .getByRole("dialog", { name: "Hapus email ini?" })
      .getByRole("button", { name: "Hapus email" })
      .click();
    await deleted;
    await expect(
      page.getByRole("dialog", { name: "Hapus email ini?" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("kotak masuk yang gagal dimuat menyembunyikan galat server dan bisa kembali", async ({
    page,
  }) => {
    const rawError = "relation pdkt_mailbox_items does not exist";
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/mailbox",
          status: 500,
          body: {
            success: false,
            error: { code: "DATABASE_ERROR", message: rawError },
          },
        },
        ...pdktMocks([]),
      ],
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    const workspaceTitle = page.getByRole("heading", {
      level: 1,
      name: "Simulasi PDKT",
    });
    await enterWorkspace(page, workspaceTitle);

    const problem = page
      .getByRole("alert")
      .filter({ hasText: "Kotak masuk belum bisa dimuat" });
    await expect(problem).toBeVisible({ timeout: 20000 });
    await expect(problem).toContainText(
      "Periksa koneksi Anda, lalu coba lagi.",
    );
    await expect(
      problem.getByRole("button", { name: "Coba lagi" }),
    ).toBeVisible();
    await expect(page.getByText(rawError)).toHaveCount(0);

    // Bukan jalan buntu: header ruang kerja tetap punya tombol kembali.
    await page
      .getByRole("button", { name: "Kembali ke halaman awal PDKT" })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Pahami keluhannya\.\s*Balas dengan tepat\./,
      }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("balasan yang gagal terkirim memakai pesan PDKT, bukan teks server", async ({
    page,
  }) => {
    const rawError = "Email mailbox tidak ditemukan.";
    const audit = await openWorkspace(page, [
      {
        method: "POST",
        path: "/api/v1/pdkt/mailbox/reply",
        status: 404,
        body: {
          success: false,
          error: { code: "NOT_FOUND", message: rawError },
        },
      },
      ...pdktMocks([], [OPEN_MAIL]),
    ]);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    await page.getByRole("button", { name: "Tulis balasan" }).click();
    const compose = page.getByRole("region", { name: "Tulis balasan" });
    await compose.getByLabel("Balasan Anda").fill("Kami cek transaksi Ibu.");
    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim balasan" })
      .click();

    await expect(
      page.getByText("Email ini sudah dihapus dan tidak bisa dibalas."),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(rawError)).toHaveCount(0);
    // Balasan tetap di editor; tidak ada yang hilang.
    await expect(compose.getByLabel("Balasan Anda")).toHaveValue(
      "Kami cek transaksi Ibu.",
    );

    // Balasan gagal tidak memakai AI: popover tidak boleh tertahan "masih dihitung".
    await page.getByRole("button", { name: "Kembali ke email" }).click();
    await page
      .getByRole("button", { name: "Kembali ke halaman awal PDKT" })
      .click();
    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pemakaian AI/ })
      .click();
    const usage = page.getByRole("dialog", { name: /^Pemakaian AI/ });
    await expect(usage.getByText(/^Rp\s?50\.000$/)).toBeVisible({
      timeout: 20000,
    });
    await expect(usage.getByText(/masih dihitung/)).toHaveCount(0);
    expectHermetic(audit);
  });

  test("dialog Buat email baru tidak menampilkan ringkasan skenario email tetap", async ({
    page,
  }) => {
    const audit = await openWorkspace(page, [
      {
        method: "GET",
        path: "/api/v1/pdkt/settings",
        body: { success: true, data: SAVED_SETTINGS },
        headers: { "x-settings-version": "absent" },
      },
      ...pdktMocks([], [OPEN_MAIL]).filter(
        (mock) => mock.path !== "/api/v1/pdkt/settings",
      ),
    ]);
    await page.getByRole("button", { name: "Email baru", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Buat email baru" });
    await expect(dialog).toBeVisible({ timeout: 20000 });

    // Skenario email tetap: judul dan kategori saja. Ringkasannya disalin dari
    // isi email, jadi peserta tidak boleh membacanya sebelum mulai.
    const fixed = dialog.getByRole("button", {
      name: new RegExp(OJK_SCENARIO.title),
    });
    await expect(fixed).toContainText("Asuransi · Email tetap");
    await expect(dialog.getByText(OJK_SCENARIO.description)).toHaveCount(0);

    const generated = dialog.getByRole("button", {
      name: new RegExp(COMPANY_SCENARIO.title),
    });
    await expect(generated).toContainText("Pembiayaan · Dibuat AI");
    await expect(generated).toContainText(COMPANY_SCENARIO.description);
    expectHermetic(audit);
  });

  test("tahap Pahami: kotak masuk, navigasi tahap, dan panel baca", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktMocks(EVALUATED_HISTORY, [OPEN_MAIL, REPLIED_MAIL]),
    );

    await expect(
      page.getByRole("heading", { name: "Kotak masuk", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Email baru", exact: true }),
    ).toBeVisible();
    const filters = page.getByRole("group", { name: "Saring email" });
    await expect(filters.getByRole("button")).toHaveText([
      "Semua",
      "Belum dibalas · 1",
      "Dibalas",
    ]);
    await expect(
      page.getByPlaceholder("Cari pengirim atau subjek"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Menu lainnya" }).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Riwayat",
      "Pengaturan",
      "Pilih beberapa",
    ]);
    await page.keyboard.press("Escape");

    // Filter bawaan "Belum dibalas" memilih email terbuka: tahap Pahami.
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    const nav = stageNav(page);
    await expect(nav.locator('[aria-current="step"]')).toHaveText(/Pahami/);
    await expect(nav).toContainText("Telaah terbuka setelah balasan dikirim");
    await expect(nav.getByRole("button", { name: /Telaah/ })).toHaveCount(0);

    const reading = page.getByRole("article");
    await expect(
      reading.getByRole("heading", { name: OPEN_MAIL.list.subject }),
    ).toBeVisible({ timeout: 20000 });
    await expect(reading).toContainText(OPEN_MAIL.detail.inbound_email.body);
    await expect(reading).toContainText("rina@local.test");
    await expect(reading.getByText("Lampiran (1)")).toBeVisible();
    // Header menjelaskan pembuat email, bukan peserta yang membalas nanti.
    await expect(
      page.getByText("Pembuat email: Siti Aminah · Trainer"),
    ).toBeVisible();
    await expect(
      reading.getByRole("button", { name: "Lampiran 1" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hapus email", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Tulis balasan" }),
    ).toBeVisible();

    // Baris yang sudah dibalas menampilkan skor; memilih filter tidak membuka
    // Telaah dengan sendirinya.
    await filters.getByRole("button", { name: "Dibalas", exact: true }).click();
    const repliedRow = page.getByRole("button", {
      name: new RegExp(REPLIED_MAIL.list.subject),
    });
    await expect(repliedRow).toContainText("Skor 85");
    await expect(page.getByText(/Pilih email dari kotak masuk/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Balasan untuk/ }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("lampiran yang tersimpan di Storage tampil sebagai tautan, gambar dan PDF", async ({
    page,
  }) => {
    const storage = `${E2E_SUPABASE_URL}/storage/v1/object/public/scenario-attachments`;
    const imageUrl = `${storage}/${"a".repeat(64)}.png`;
    const pdfUrl = `${storage}/${"b".repeat(64)}.pdf`;
    const mail = structuredClone(OPEN_MAIL);
    mail.detail.inbound_email.attachments = [imageUrl, pdfUrl];
    mail.detail.emails_thread = [mail.detail.inbound_email];
    await page.addInitScript(() => {
      (window as unknown as { openedUrls: string[] }).openedUrls = [];
      window.open = ((url?: string | URL) => {
        (window as unknown as { openedUrls: string[] }).openedUrls.push(
          String(url),
        );
        return null;
      }) as typeof window.open;
    });
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks(EVALUATED_HISTORY, [mail]),
    });
    const served: string[] = [];
    await page.route(`${storage}/**`, (route) => {
      served.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(PIXEL_PNG.split(",")[1], "base64"),
      });
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await enterWorkspace(page);

    const reading = page.getByRole("article");
    await expect(reading.getByText("Lampiran (2)")).toBeVisible({
      timeout: 20000,
    });
    const image = reading.getByRole("button", {
      name: "Lampiran 1",
      exact: true,
    });
    await expect(image.locator("img")).toHaveAttribute("src", imageUrl);
    await expect
      .poll(() =>
        image
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    await image.click();
    await expect(
      page.getByRole("dialog", { name: "Pratinjau lampiran" }).locator("img"),
    ).toHaveAttribute("src", imageUrl);
    await page
      .getByRole("button", { name: "Tutup pratinjau lampiran" })
      .click();

    await reading.getByRole("button", { name: "Lampiran 2 (PDF)" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { openedUrls: string[] }).openedUrls,
        ),
      )
      .toEqual([pdfUrl]);
    expect(served).toContain(imageUrl);
    expectHermetic(audit);
  });

  test("tahap Tanggapi: tulis, konfirmasi, kirim, lalu kembali ke kotak masuk", async ({
    page,
  }) => {
    const audit = await openWorkspace(page, [
      ...pdktMocks([], [OPEN_MAIL]),
      {
        method: "POST",
        path: "/api/v1/pdkt/mailbox/reply",
        body: { success: true, data: { historyId: "pdkt-new-1" } },
      },
    ]);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    await page.getByRole("button", { name: "Tulis balasan" }).click();

    // Layar fokus: daftar email disembunyikan, email konsumen tetap terlihat.
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Tanggapi/,
    );
    await expect(
      page.getByRole("heading", { name: "Kotak masuk" }),
    ).toHaveCount(0);
    const email = page.getByRole("region", { name: "Email konsumen" });
    await expect(email).toContainText(OPEN_MAIL.detail.inbound_email.body);
    const compose = page.getByRole("region", { name: "Tulis balasan" });
    await expect(compose).toContainText(`Re: ${OPEN_MAIL.list.subject}`);

    const replyText = "Kami akan cek transaksi Ibu hari ini.";
    await compose.getByLabel("Balasan Anda").fill(replyText);
    await expect(compose).toContainText("7 kata");

    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Kirim balasan sekarang?",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Periksa lagi" }).click();
    await expect(confirm).toHaveCount(0);

    // Setelah terkirim, server melaporkan email sudah dibalas dan sedang dinilai.
    const replied = mailboxItem(OPEN_MAIL.list.id, "replied", {
      history_id: "pdkt-new-1",
    });
    await overrideJson(page, "**/api/v1/pdkt/mailbox", [replied.list]);
    await overrideJson(
      page,
      `**/api/v1/pdkt/mailbox/${OPEN_MAIL.list.id}`,
      replied.detail,
    );
    await overrideJson(page, "**/api/v1/pdkt/history", [
      {
        id: "pdkt-new-1",
        timestamp: MAIL_AT,
        config: SESSION_CONFIG,
        emails: [],
        evaluation: null,
        evaluation_status: "processing",
      },
    ]);
    await overrideJson(page, /\/api\/v1\/pdkt\/history\/eval\//, {
      evaluation_status: "processing",
      evaluation: null,
      evaluation_error: null,
    });

    // Tab Dibalas tidak boleh aktif sesaat pun selama kembali ke kotak masuk.
    await page.evaluate(() => {
      const w = window as Window & { sawRepliedTab?: boolean };
      w.sawRepliedTab = false;
      new MutationObserver(() => {
        for (const button of document.querySelectorAll(
          'button[aria-pressed="true"]',
        )) {
          if (button.textContent?.trim() === "Dibalas") w.sawRepliedTab = true;
        }
      }).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-pressed"],
      });
    });
    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/pdkt/mailbox/reply"),
    );
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim balasan" })
      .click();
    const body = (await sent).postDataJSON();
    expect(body.mailboxId).toBe(OPEN_MAIL.list.id);
    expect(body.reply.body).toBe(replyText);

    await expectSearch(page, { ruang: "1", email: null, tahap: null });
    await expect(
      page.getByRole("heading", { name: "Kotak masuk" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Belum dibalas/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(
      page.getByText(
        "Balasan terkirim dan sedang ditelaah AI. Buka dari tab Dibalas kapan saja.",
      ),
    ).toBeVisible();
    await expect(reviewHeading(page)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as Window & { sawRepliedTab?: boolean }).sawRepliedTab,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await page
      .getByRole("button", { name: new RegExp(replied.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang ditelaah AI" }),
    ).toBeVisible();

    // Penilaian selesai saat agent kembali ke daftar tanpa seleksi.
    await stageNav(page)
      .getByRole("button", { name: /Pahami/ })
      .click();
    await page.getByRole("button", { name: /^Belum dibalas/ }).click();
    await expectSearch(page, { ruang: "1", email: null, tahap: null });
    await overrideJson(page, "**/api/v1/ai/usage/summary**", PDKT_USAGE);
    await overrideJson(page, "**/api/v1/pdkt/history", [
      { ...EVALUATED_HISTORY[0], id: "pdkt-new-1" },
    ]);
    await overrideJson(page, /\/api\/v1\/pdkt\/history\/eval\//, {
      evaluation_status: "completed",
      evaluation: EVALUATED_HISTORY[0].evaluation,
      evaluation_error: null,
    });
    await expect(page.getByText(/^Pemakaian AI:/)).toBeVisible({
      timeout: 15000,
    });
    await expectSearch(page, { email: null });
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(replied.list.subject) }),
    ).toContainText("Skor 85");
    expectHermetic(audit);
  });
});
