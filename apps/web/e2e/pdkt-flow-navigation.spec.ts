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
import type { SessionHistory } from "../src/routes/pdkt/utils/sessionHistory";
import {
  mailboxItem,
  OPEN_MAIL,
  NEWER_OPEN_MAIL,
  REPLIED_MAIL,
  EVALUATED_HISTORY,
  HISTORY_PAGE_SESSIONS,
  workspaceMarker,
  openWorkspace,
  overrideJson,
  stageNav,
  pdktNavigationMocks,
  SUBJECT_X,
  SUBJECT_Y,
  SUBJECT_MAIL,
  CREATE_MOCKS,
  picker,
  hero,
  reviewHeading,
  expectSearch,
  requestNewEmail,
  LEGACY_PRACTICE_SUBJECTS,
  openSubjectReview,
  createPracticeAgain,
} from "./helpers/pdktFlowHarness";

test.describe("PDKT navigation acceptance", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  test("email dibalas dibuka sebagai email dengan tombol Lihat telaah", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks(EVALUATED_HISTORY, [REPLIED_MAIL]),
    );
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: null });
    const article = page.getByRole("article");
    await expect(article).toContainText(REPLIED_MAIL.detail.inbound_email.body);
    await expect(reviewHeading(page)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Ringkasan skor" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tulis balasan" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Lihat telaah" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Telaah siap" }),
    ).toBeVisible();
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Pahami/,
    );
    await expect(stageNav(page)).toContainText("Tanggapi (selesai)");
    await expect(
      stageNav(page).getByRole("button", { name: "Telaah", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Telaah terbuka setelah balasan dikirim"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Detail email" }),
    ).not.toContainText("Terima kasih, kami cek transaksinya.");
    await expect(
      page.getByRole("region", { name: "Detail email" }),
    ).not.toContainText("Skor 85");
    await expect(
      page.getByRole("button", { name: "Hapus email", exact: true }),
    ).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const reviewButton = page.getByRole("button", { name: "Lihat telaah" });
      await expect(reviewButton).toBeVisible();
      expect(
        await reviewButton.evaluate(
          (element) => (element as HTMLElement).offsetHeight,
        ),
      ).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`dibalas-${width}.png`),
      });
    }
    // Footer menghormati izin hapus, tanpa mengubah panel baca.
    await overrideJson(page, `**/api/v1/pdkt/mailbox/${REPLIED_MAIL.list.id}`, {
      ...REPLIED_MAIL.detail,
      permissions: { can_delete: false },
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Lihat telaah" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hapus email", exact: true }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("Lihat telaah membuka Telaah, Back dan tahap Pahami kembali ke email", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks(EVALUATED_HISTORY, [REPLIED_MAIL]),
    );
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: "telaah" });
    await expect(reviewHeading(page)).toBeVisible();
    await page.reload();
    await expect(reviewHeading(page)).toBeVisible();
    await page.goBack();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: null });
    await expect(page.getByRole("article")).toBeVisible();
    await stageNav(page)
      .getByRole("button", { name: "Telaah", exact: true })
      .click();
    await expect(reviewHeading(page)).toBeVisible();
    await stageNav(page)
      .getByRole("button", { name: /Pahami/ })
      .click();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: null });
    await expect(page.getByRole("article")).toBeVisible();
    expectHermetic(audit);
  });

  test("tahap=telaah diabaikan untuk email terbuka", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: `/pdkt?ruang=1&email=${OPEN_MAIL.list.id}&tahap=telaah`,
      apiMocks: pdktNavigationMocks([], [OPEN_MAIL]),
    });
    await expect(page.getByRole("article")).toBeVisible({ timeout: 20000 });
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Pahami/,
    );
    await expect(
      page.getByRole("button", { name: "Tulis balasan" }),
    ).toBeVisible();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    expectHermetic(audit);
  });

  test("refresh pada email dibalas memilih tab Dibalas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    const audit = await openHermeticShell(page, {
      path: `/pdkt?ruang=1&email=${REPLIED_MAIL.list.id}`,
      apiMocks: pdktNavigationMocks(EVALUATED_HISTORY, [
        OPEN_MAIL,
        REPLIED_MAIL,
      ]),
    });
    await expect(page.getByRole("article")).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: /^Dibalas/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) }),
    ).toHaveAttribute("aria-current", "true");
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    expectHermetic(audit);
  });

  test("AC1 kotak masuk menambah history dan Back kembali ke landing", async ({
    page,
  }) => {
    const audit = await openWorkspace(page, pdktNavigationMocks([]));
    await expectSearch(page, { ruang: "1" });
    await page.goBack();
    await expect(hero(page)).toBeVisible();
    expectHermetic(audit);
  });

  for (const width of [390, 1280]) {
    test(`AC2 detail email Back kembali ke daftar pada ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const audit = await openWorkspace(
        page,
        pdktNavigationMocks([], [OPEN_MAIL, NEWER_OPEN_MAIL]),
      );
      await page
        .getByRole("button", { name: new RegExp(NEWER_OPEN_MAIL.list.subject) })
        .click();
      await expectSearch(page, { email: NEWER_OPEN_MAIL.list.id });
      await page.goBack();
      await expectSearch(page, { ruang: "1", email: null });
      await expect(workspaceMarker(page)).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(0);
      expectHermetic(audit);
    });
  }

  for (const item of [OPEN_MAIL, SUBJECT_MAIL]) {
    test(`AC3 refresh mempertahankan email ${item.list.status}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const audit = await openWorkspace(
        page,
        pdktNavigationMocks(EVALUATED_HISTORY, [item]),
      );
      if (item.list.status === "replied") await workspaceMarker(page).click();
      await page
        .getByRole("button", { name: new RegExp(item.list.subject) })
        .click();
      await expectSearch(page, { ruang: "1", email: item.list.id });
      await expect(page.getByRole("article")).toBeVisible();
      await page.reload();
      await expectSearch(page, { ruang: "1", email: item.list.id });
      await expect(page.getByRole("article")).toContainText(item.list.subject);
      await expect(hero(page)).toHaveCount(0);
      expectHermetic(audit);
    });
  }

  test("AC4 Riwayat ke Telaah tanpa hero, refresh dan kedua aksi kembali", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks(HISTORY_PAGE_SESSIONS, [REPLIED_MAIL]),
    });
    await page.evaluate(() => {
      (window as Window & { sawPdktHero?: boolean }).sawPdktHero = false;
      new MutationObserver(() => {
        if (document.getElementById("pdkt-hero-title"))
          (window as Window & { sawPdktHero?: boolean }).sawPdktHero = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    const link = () =>
      page
        .getByRole("table")
        .getByRole("link", { name: REPLIED_MAIL.list.subject });
    await link().click();
    await expect(reviewHeading(page)).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as Window & { sawPdktHero?: boolean }).sawPdktHero,
      ),
    ).toBe(false);
    await page.reload();
    await expect(reviewHeading(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/pdkt\/history$/);
    await link().click();
    await page
      .locator("main header")
      .getByRole("button", { name: "Riwayat", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pdkt\/history$/);
    expectHermetic(audit);
  });

  test("Telaah dari Riwayat tetap menyediakan Riwayat setelah Pahami dan Lihat telaah", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks(HISTORY_PAGE_SESSIONS, [REPLIED_MAIL]),
    });
    await page
      .getByRole("table")
      .getByRole("link", { name: REPLIED_MAIL.list.subject })
      .click();
    await expect(reviewHeading(page)).toBeVisible();

    await stageNav(page)
      .getByRole("button", { name: /Pahami/ })
      .click();
    await expect(page.getByRole("article")).toBeVisible();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, dari: "riwayat" });

    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(reviewHeading(page)).toBeVisible();
    await expectSearch(page, {
      email: REPLIED_MAIL.list.id,
      tahap: "telaah",
      dari: "riwayat",
    });
    await page
      .locator("main header")
      .getByRole("button", { name: "Riwayat", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pdkt\/history$/);
    expectHermetic(audit);
  });

  test("AC5 peserta ruang kerja bertahan setelah Riwayat dan Back", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        ...CREATE_MOCKS,
        ...pdktNavigationMocks([], [OPEN_MAIL]),
        {
          method: "GET",
          path: "/api/v1/profiler/peserta/options",
          body: {
            success: true,
            data: [
              {
                id: SUBJECT_X.participantId,
                nama: "Peserta X",
                batch_name: "Batch 1",
                tim: "Alpha",
              },
            ],
          },
        },
      ],
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await picker(page)
      .getByRole("radio", { name: /Peserta resmi/ })
      .check();
    await picker(page)
      .getByLabel("Cari peserta (min. 2 huruf)")
      .fill("Peserta");
    await picker(page)
      .getByRole("button", { name: /Peserta X/ })
      .click();
    await picker(page)
      .getByRole("button", { name: "Mulai", exact: true })
      .click();
    await expect(workspaceMarker(page)).toBeVisible();
    await page.getByRole("button", { name: "Menu lainnya" }).click();
    await page.getByRole("menuitem", { name: "Riwayat", exact: true }).click();
    await page.goBack();
    await expect(workspaceMarker(page)).toBeVisible();
    await expect(picker(page)).toHaveCount(0);
    await page.reload();
    await expect(workspaceMarker(page)).toBeVisible();
    expect((await requestNewEmail(page)).simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  test("AC6 latihan lagi memakai peserta email X meski ruang kerja Y", async ({
    page,
  }) => {
    await page.addInitScript(
      (subject) =>
        sessionStorage.setItem("pdkt_subject_user-1", JSON.stringify(subject)),
      SUBJECT_Y,
    );
    const audit = await openHermeticShell(page, {
      path: "/pdkt?ruang=1",
      apiMocks: [
        ...CREATE_MOCKS,
        ...pdktNavigationMocks(EVALUATED_HISTORY, [SUBJECT_MAIL, OPEN_MAIL]),
      ],
    });
    await expect(workspaceMarker(page)).toBeVisible();
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(SUBJECT_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(reviewHeading(page)).toBeVisible();
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/api/v1/pdkt/session/create"),
    );
    await page
      .getByRole("button", { name: "Latihan lagi dengan skenario ini" })
      .click();
    expect((await request).postDataJSON().simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  for (const subject of [
    { ...SUBJECT_X, participantId: null },
    {
      type: "unknown",
      participantId: null,
      displayName: null,
      batchName: null,
      team: null,
    },
  ]) {
    test(`AC6 atribusi ${subject.type} tanpa ID tidak menjadi self`, async ({
      page,
    }) => {
      const item = mailboxItem("unavailable", "replied", {
        history_id: EVALUATED_HISTORY[0].id,
        simulationSubject: subject,
      });
      const audit = await openWorkspace(page, [
        ...CREATE_MOCKS,
        ...pdktNavigationMocks(EVALUATED_HISTORY, [item]),
      ]);
      await workspaceMarker(page).click();
      await page
        .getByRole("button", { name: new RegExp(item.list.subject) })
        .click();
      await page.getByRole("button", { name: "Lihat telaah" }).click();
      await expect(
        page.getByRole("button", { name: "Latihan lagi dengan skenario ini" }),
      ).toBeDisabled();
      await expect(page.getByText(/Latihan lagi tidak tersedia/)).toBeVisible();
      expectHermetic(audit);
    });
  }

  test("AC7 Belum dibalas melewati picker, Mulai simulasi tetap memilih", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktNavigationMocks([], [OPEN_MAIL]),
    });
    await page
      .getByRole("region", { name: "Belum dibalas" })
      .getByRole("button", { name: new RegExp(OPEN_MAIL.list.subject) })
      .click();
    await expect(page.getByRole("article")).toBeVisible();
    await expect(picker(page)).toHaveCount(0);
    await page
      .getByRole("button", { name: "Kembali ke halaman awal PDKT" })
      .click();
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await expect(picker(page)).toBeVisible();
    expectHermetic(audit);
  });

  test("AC8 Tanggapi kembali ke email dengan label yang sesuai", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks([], [OPEN_MAIL]),
    );
    await page.getByRole("button", { name: "Tulis balasan" }).click();
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Tanggapi/,
    );
    if (process.env.PDKT_FLOW_CAPTURE === "1") {
      await page.screenshot({
        path: test.info().outputPath("pdkt-tanggapi-desktop.png"),
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const back = page
      .locator("main header")
      .getByRole("button", { name: "Kembali ke email" });
    await expect(back).toBeVisible();
    expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (process.env.PDKT_FLOW_CAPTURE === "1") {
      await page.screenshot({
        path: test.info().outputPath("pdkt-tanggapi-mobile.png"),
      });
    }
    await page
      .locator("main header")
      .getByRole("button", { name: "Kembali ke email" })
      .click();
    await expect(page.getByRole("article")).toBeVisible();
    expect(consoleErrors).toEqual([]);
    expectHermetic(audit);
  });

  test("AC9 breadcrumb PDKT bertaut dan Riwayat aktif", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks([]),
    });
    const crumbs = page.getByRole("navigation", { name: /breadcrumb/i });
    await expect(
      crumbs.getByRole("link", { name: "PDKT", exact: true }),
    ).toHaveAttribute("href", "/pdkt");
    await expect(crumbs).toContainText("Riwayat");
    expectHermetic(audit);
  });

  test("AC10 route simulation redirect ke landing", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/simulation",
      waitForUrl: /\/pdkt$/,
      apiMocks: pdktNavigationMocks([]),
    });
    await expect(hero(page)).toBeVisible();
    expectHermetic(audit);
  });
});

test.describe("PDKT navigation boundaries", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));
  test("replay tanpa mailbox mempertahankan sesi dan peserta setelah refresh", async ({
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
        ...CREATE_MOCKS,
        ...pdktNavigationMocks([session], [OPEN_MAIL]),
      ],
    });
    await page
      .getByRole("table")
      .getByRole("link", { name: `Re: ${SUBJECT_MAIL.list.subject}` })
      .click();
    await expect(reviewHeading(page)).toBeVisible();
    await expectSearch(page, {
      sesi: session.id,
      ruang: "1",
      dari: "riwayat",
      email: null,
    });
    await page.reload();
    await expect(reviewHeading(page)).toBeVisible();
    await expectSearch(page, { sesi: session.id, email: null });
    await expect(page.locator("main header").last()).toContainText("Peserta X");
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/api/v1/pdkt/session/create"),
    );
    await page
      .getByRole("button", { name: "Latihan lagi dengan skenario ini" })
      .click();
    expect((await request).postDataJSON().simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  for (const state of ["corrupt", "blocked", "other-account"] as const) {
    test(`storage ${state} kembali aman ke self untuk email baru`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ state, subject }) => {
          if (state === "blocked")
            Object.defineProperty(window, "sessionStorage", {
              get() {
                throw new DOMException("Blocked", "SecurityError");
              },
            });
          else
            sessionStorage.setItem(
              state === "other-account"
                ? "pdkt_subject_other-user"
                : "pdkt_subject_user-1",
              state === "corrupt" ? "{broken" : JSON.stringify(subject),
            );
        },
        { state, subject: SUBJECT_Y },
      );
      const audit = await openHermeticShell(page, {
        path: "/pdkt?ruang=1",
        apiMocks: [...CREATE_MOCKS, ...pdktNavigationMocks([], [OPEN_MAIL])],
      });
      await expect(workspaceMarker(page)).toBeVisible();
      expect((await requestNewEmail(page)).simulationSubject).toEqual({
        type: "self",
      });
      expectHermetic(audit);
    });
  }
});

test.describe("PDKT practice again subject policy", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  for (const subject of [
    ...LEGACY_PRACTICE_SUBJECTS,
    {
      label: "self",
      value: {
        type: "self",
        participantId: null,
        displayName: "Agent",
        batchName: null,
        team: null,
      },
    },
    { label: "participant-known", value: SUBJECT_X },
  ]) {
    test(`agent legacy langsung ${subject.label} membuat sesi self`, async ({
      page,
    }) => {
      const audit = await openSubjectReview(page, "agent", subject.value);
      expect((await createPracticeAgain(page)).simulationSubject).toEqual({
        type: "self",
      });
      expectHermetic(audit);
    });
  }

  for (const subject of LEGACY_PRACTICE_SUBJECTS.filter(
    (subject) => subject.label !== "missing",
  )) {
    test(`agent legacy pemilih skenario ${subject.label} membuat sesi self`, async ({
      page,
    }) => {
      const audit = await openSubjectReview(page, "agent", subject.value, true);
      expect((await createPracticeAgain(page, true)).simulationSubject).toEqual(
        { type: "self" },
      );
      expectHermetic(audit);
    });
  }

  for (const role of ["trainer", "admin"] as const) {
    test(`${role} latihan ulang snapshot self tetap self`, async ({ page }) => {
      const audit = await openSubjectReview(page, role, {
        type: "self",
        participantId: null,
        displayName: "Pelaksana",
        batchName: null,
        team: null,
      });
      expect((await createPracticeAgain(page)).simulationSubject).toEqual({
        type: "self",
      });
      expectHermetic(audit);
    });
  }

  test("admin latihan ulang tetap memakai peserta snapshot", async ({
    page,
  }) => {
    const audit = await openSubjectReview(page, "admin", SUBJECT_X);
    expect((await createPracticeAgain(page)).simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  for (const subject of LEGACY_PRACTICE_SUBJECTS.filter(
    (subject) =>
      subject.label === "unknown" || subject.label === "participant-deleted",
  )) {
    test(`admin latihan ulang ${subject.label} tetap diblokir`, async ({
      page,
    }) => {
      const audit = await openSubjectReview(page, "admin", subject.value);
      await expect(
        page.getByRole("button", { name: "Latihan lagi dengan skenario ini" }),
      ).toBeDisabled();
      await expect(page.getByText(/Latihan lagi tidak tersedia/)).toBeVisible();
      expectHermetic(audit);
    });
  }
});
