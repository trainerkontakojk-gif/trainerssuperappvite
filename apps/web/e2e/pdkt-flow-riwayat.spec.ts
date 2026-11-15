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
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findTextBelowFloor } from "./helpers/typographyFloor";
import type { SessionHistory } from "../src/routes/pdkt/utils/sessionHistory";
import {
  MAIL_AT,
  mailboxItem,
  OPEN_MAIL,
  REPLIED_MAIL,
  EVALUATED_HISTORY,
  HISTORY_PAGE_SESSIONS,
  pdktMocks,
  openScenarioSettings,
  openWorkspace,
  stageNav,
  pdktNavigationMocks,
  SUBJECT_X,
  SUBJECT_MAIL,
  CREATE_MOCKS,
  reviewHeading,
  expectSearch,
} from "./helpers/pdktFlowHarness";

test.describe("PDKT (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("halaman Riwayat merangkum, menyaring, dan mencari sesi", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS),
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Riwayat latihan" }),
    ).toBeVisible({ timeout: 20000 });
    // Ringkasan berupa kalimat, bukan kartu metrik.
    await expect(page.getByTestId("pdkt-history-summary")).toHaveText(
      "4 sesi · 1 ditelaah · rata-rata skor 85",
    );

    const table = page.getByRole("table", { name: "Daftar sesi PDKT" });
    const rows = table.getByRole("row").filter({ has: page.getByRole("cell") });
    await expect(rows).toHaveCount(4);
    const evaluated = rows.filter({ hasText: REPLIED_MAIL.list.subject });
    await expect(evaluated.getByTestId("pdkt-history-score")).toHaveText("85");
    await expect(rows.filter({ hasText: "Saldo belum kembali" })).toContainText(
      "Sedang ditelaah",
    );
    await expect(rows.filter({ hasText: "Kartu terblokir" })).toContainText(
      "Telaah gagal",
    );
    // Peserta yang datanya sudah dihapus: nama snapshot + catatan biasa.
    const removed = rows.filter({ hasText: "Andi" });
    await expect(removed).toContainText("data peserta sudah dihapus");
    await expect(removed).toContainText("Belum ditelaah");
    await expect(page.getByText(/record peserta/)).toHaveCount(0);
    await expect(page.getByText(/Target:|Pelaksana:|Export CSV/)).toHaveCount(
      0,
    );

    // Filter status.
    const filters = page.getByRole("group", { name: "Saring status" });
    await filters.getByRole("button", { name: /^Ditelaah/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(REPLIED_MAIL.list.subject);
    await filters.getByRole("button", { name: /^Semua/ }).click();
    await expect(rows).toHaveCount(4);

    // Pencarian subjek atau peserta.
    const search = page.getByRole("searchbox", { name: "Cari sesi" });
    await search.fill("kartu");
    await expect(rows).toHaveCount(1);
    await search.fill("tidak ada yang cocok");
    await expect(page.getByText("Tidak ada sesi yang cocok.")).toBeVisible();
    await page.getByRole("button", { name: "Reset filter" }).click();
    await expect(search).toHaveValue("");
    await expect(rows).toHaveCount(4);

    await expect(page.getByRole("button", { name: "Unduh CSV" })).toBeVisible();
    expectHermetic(audit);
  });

  test("Riwayat membuka sesi yang ditelaah di tahap Telaah", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks(HISTORY_PAGE_SESSIONS, [REPLIED_MAIL]),
    });

    const link = page
      .getByRole("table", { name: "Daftar sesi PDKT" })
      .getByRole("link", { name: REPLIED_MAIL.list.subject });
    await expect(link).toHaveAttribute(
      "href",
      "/pdkt?ruang=1&sesi=pdkt-evaluated-1&dari=riwayat",
      {
        timeout: 20000,
      },
    );
    await link.click();

    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
      { timeout: 20000 },
    );
    // Parameter sesi bertahan agar reload membuka telaah yang sama.
    await expectSearch(page, { sesi: "pdkt-evaluated-1", dari: "riwayat" });
    await expect(
      page
        .getByRole("region", { name: "Ringkasan skor" })
        .getByTestId("pdkt-review-score"),
    ).toHaveText("85");

    expectHermetic(audit);
  });

  test("Riwayat menghapus sesi lewat dialog konfirmasi", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "DELETE",
          path: "/api/v1/pdkt/history/pdkt-processing-1",
          body: { success: true, data: null },
        },
        ...pdktMocks(HISTORY_PAGE_SESSIONS),
      ],
    });

    const row = page
      .getByRole("row")
      .filter({ hasText: "Saldo belum kembali" });
    await row
      .getByRole("button", { name: "Hapus sesi Saldo belum kembali" })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Hapus sesi ini?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(1);
    expect(audit.mockedApi.filter((call) => call.startsWith("DELETE"))).toEqual(
      [],
    );

    await row
      .getByRole("button", { name: "Hapus sesi Saldo belum kembali" })
      .click();
    await page
      .getByRole("dialog", { name: "Hapus sesi ini?" })
      .getByRole("button", { name: "Hapus sesi" })
      .click();
    await waitForMockedApi(audit, [
      "DELETE /api/v1/pdkt/history/pdkt-processing-1",
    ]);
    await expect(row).toHaveCount(0);

    expectHermetic(audit);
  });

  test("Riwayat menghapus semua sesi lewat dialog konfirmasi", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "DELETE",
          path: "/api/v1/pdkt/history",
          body: { success: true, data: null },
        },
        ...pdktMocks(HISTORY_PAGE_SESSIONS),
      ],
    });

    await page
      .getByRole("button", { name: "Hapus semua riwayat" })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Hapus semua riwayat?" });
    await expect(dialog).toContainText("4 sesi");
    await dialog.getByRole("button", { name: "Hapus semua" }).click();
    await waitForMockedApi(audit, ["DELETE /api/v1/pdkt/history"]);
    await expect(page.getByText("Belum ada sesi latihan")).toBeVisible();
    await expect(page.getByTestId("pdkt-history-summary")).toHaveCount(0);

    expectHermetic(audit);
  });

  test("tautan sesi yang tidak ada lagi memberi tahu dan tetap di landing", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt?sesi=sesi-yang-sudah-dihapus",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS),
    });

    await expect(
      page.getByText("Sesi itu tidak ada lagi di riwayat Anda."),
    ).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/pdkt$/);
    await expect(
      page.getByRole("navigation", { name: "Menu PDKT" }),
    ).toBeVisible();
    await expect(stageNav(page)).toHaveCount(0);

    expectHermetic(audit);
  });

  test("Riwayat yang gagal dimuat bisa dicoba lagi dan muat di ponsel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/history",
          status: 500,
          body: {
            success: false,
            error: { code: "DATABASE_ERROR", message: "Server sedang sibuk." },
          },
        },
        ...pdktMocks([]).filter((mock) => mock.path !== "/api/v1/pdkt/history"),
      ],
    });

    await expect(page.getByText("Riwayat belum bisa dimuat.")).toBeVisible({
      timeout: 20000,
    });
    const before = audit.mockedApi.filter((call) =>
      call.endsWith("/api/v1/pdkt/history?view=list"),
    ).length;
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect
      .poll(
        () =>
          audit.mockedApi.filter((call) =>
            call.endsWith("/api/v1/pdkt/history?view=list"),
          ).length,
      )
      .toBeGreaterThan(before);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    expectHermetic(audit);
  });

  test("tabel Riwayat tidak menggeser layar ponsel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS),
    });
    await expect(page.getByTestId("pdkt-history-summary")).toBeVisible({
      timeout: 20000,
    });
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      return Math.max(
        document.documentElement.scrollWidth - window.innerWidth,
        main.scrollWidth - main.clientWidth,
      );
    });
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await findTextBelowFloor(page.locator("main").first())).toEqual([]);
    expectHermetic(audit);
  });
});

/**
 * Performa: riwayat PDKT memuat semua sesi lengkap (email + lampiran), jadi
 * setiap muat ulang yang tidak perlu menghabiskan egress Supabase. Baris
 * riwayat hanya bertambah saat membalas email.
 */
test.describe("PDKT tidak memuat ulang riwayat tanpa perlu (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("menyimpan Pengaturan tidak memuat ulang riwayat", async ({ page }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    const count = (call: string) =>
      audit.mockedApi.filter((entry) => entry === call).length;
    await waitForMockedApi(audit, ["GET /api/v1/pdkt/history"]);
    const before = count("GET /api/v1/pdkt/history");

    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    await page
      .getByRole("dialog", { name: "Pulihkan pengaturan bawaan?" })
      .getByRole("button", { name: "Pulihkan bawaan" })
      .click();
    await expect
      .poll(() => count("POST /api/v1/pdkt/settings"), { timeout: 20000 })
      .toBe(1);
    await page.waitForTimeout(1500);

    expect(count("GET /api/v1/pdkt/history")).toBe(before);
    expectHermetic(audit);
  });

  test("telaah selesai milik orang lain tidak memuat ulang kotak masuk dan riwayat", async ({
    page,
  }) => {
    const OTHER_HISTORY_ID = "pdkt-other-user-1";
    const othersReply = mailboxItem("mail-others", "replied", {
      user_id: "trainer-1",
      history_id: OTHER_HISTORY_ID,
      replied_at: MAIL_AT,
      created_by_user: {
        id: "trainer-1",
        full_name: "Siti Aminah",
        role: "Trainer",
        is_current_user: false,
      },
    });
    const evalCall = `GET /api/v1/pdkt/history/eval/${OTHER_HISTORY_ID}`;
    const audit = await openWorkspace(page, [
      {
        method: "GET",
        path: `/api/v1/pdkt/history/eval/${OTHER_HISTORY_ID}`,
        body: {
          success: true,
          data: {
            evaluation_status: "completed",
            evaluation: EVALUATED_HISTORY[0].evaluation,
            evaluation_error: null,
          },
        },
      },
      ...pdktMocks([], [othersReply]),
    ]);
    await waitForMockedApi(audit, [evalCall]);
    await page.waitForTimeout(2000);

    const afterEval = audit.mockedApi.slice(
      audit.mockedApi.indexOf(evalCall) + 1,
    );
    expect(afterEval).not.toContain("GET /api/v1/pdkt/mailbox");
    expect(afterEval).not.toContain("GET /api/v1/pdkt/history");
    expectHermetic(audit);
  });
});

test.describe("PDKT riwayat ringkas", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  /** Bentuk `GET /pdkt/history?view=list`: hanya yang ditampilkan daftar. */
  function summaryOf(session: SessionHistory) {
    const emails = (session.emails ?? []) as Array<{ subject?: string }>;
    const scenario = (
      session.config as { scenarios?: Array<{ id?: string; title?: string }> }
    )?.scenarios?.[0];
    return {
      id: session.id,
      timestamp: session.timestamp,
      detail: "summary",
      evaluation_status: session.evaluationStatus,
      evaluation:
        typeof session.evaluation?.score === "number"
          ? { score: session.evaluation.score }
          : null,
      config: { scenarios: [{ id: scenario?.id, title: scenario?.title }] },
      emails: [{ subject: emails.at(-1)?.subject }],
      simulationSubject: session.simulationSubject ?? null,
    } as unknown as SessionHistory;
  }

  test("landing dan halaman Riwayat hanya memuat riwayat versi ringkas", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS.map(summaryOf)),
    });
    await waitForMockedApi(audit, ["/api/v1/pdkt/history?view=list"]);
    await page.goto("/pdkt/history");
    await expect(page.getByTestId("pdkt-history-summary")).toBeVisible();
    await expect(
      page.getByRole("table").getByText(REPLIED_MAIL.list.subject),
    ).toBeVisible();
    const historyCalls = audit.mockedApi.filter((entry) =>
      entry.startsWith("GET /api/v1/pdkt/history"),
    );
    expect(historyCalls.length).toBeGreaterThanOrEqual(2);
    expect(historyCalls).toEqual(
      historyCalls.map(() => "GET /api/v1/pdkt/history?view=list"),
    );
    expectHermetic(audit);
  });

  test("Telaah dari riwayat ringkas memuat hasil lengkap lebih dulu", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks(EVALUATED_HISTORY, [REPLIED_MAIL]).map((mock) =>
        mock.path === "/api/v1/pdkt/history"
          ? {
              ...mock,
              body: { success: true, data: EVALUATED_HISTORY.map(summaryOf) },
            }
          : mock,
      ),
    );
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    const row = page.getByRole("button", {
      name: new RegExp(REPLIED_MAIL.list.subject),
    });
    await expect(row).toContainText("Skor 85");
    await row.click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(reviewHeading(page)).toBeVisible();
    await expect(page.getByText("Jawaban relevan dan jelas.")).toBeVisible();
    expect(audit.mockedApi).toContain(
      `GET /api/v1/pdkt/history/eval/${EVALUATED_HISTORY[0].id}`,
    );
    expectHermetic(audit);
  });

  test("membuka sesi dari riwayat ringkas memuat sesi lengkapnya", async ({
    page,
  }) => {
    const session = {
      ...EVALUATED_HISTORY[0],
      simulationSubject: SUBJECT_X,
      emails: [
        SUBJECT_MAIL.detail.inbound_email,
        ...SUBJECT_MAIL.detail.emails_thread,
      ],
    } as unknown as SessionHistory;
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "GET",
          path: `/api/v1/pdkt/history/${session.id}`,
          body: { success: true, data: session },
        },
        ...CREATE_MOCKS,
        ...pdktNavigationMocks([summaryOf(session)], [OPEN_MAIL]),
      ],
    });
    await page
      .getByRole("table")
      .getByRole("link", { name: `Re: ${SUBJECT_MAIL.list.subject}` })
      .click();
    await expect(reviewHeading(page)).toBeVisible();
    await expect(page.getByText("Jawaban relevan dan jelas.")).toBeVisible();
    expect(audit.mockedApi).toContain(`GET /api/v1/pdkt/history/${session.id}`);
    expectHermetic(audit);
  });
});
