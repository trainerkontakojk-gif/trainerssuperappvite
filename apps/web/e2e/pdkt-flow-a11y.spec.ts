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
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import { findTargetsBelow } from "./helpers/touchTarget";
import {
  PIXEL_PNG,
  OPEN_MAIL,
  REPLIED_MAIL,
  EVALUATED_HISTORY,
  COMPANY_SCENARIO,
  SAVED_SETTINGS,
  pdktMocks,
  openScenarioSettings,
  workspaceMarker,
  openWorkspace,
} from "./helpers/pdktFlowHarness";

test.describe("PDKT (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  for (const surface of [
    "landing",
    "kotak masuk",
    "Pahami",
    "Tanggapi",
    "buat email",
    "lampiran",
    "konsumen",
    "skenario",
    "editor",
    "penerima",
    "landing gagal",
    "editor konsumen",
    "lampiran skenario",
  ] as const) {
    test(`touch target 44px: ${surface}`, async ({ page }) => {
      test.setTimeout(90000);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        let root = page.locator("main").first();
        let audit;
        const extraFindings: Awaited<ReturnType<typeof findTargetsBelow>> = [];
        const capture = async () => {
          for (const theme of ["light", "dark"] as const) {
            await setDocumentTheme(page, theme);
            await page.screenshot({
              path: `../../plans/artifacts/pdkt-touch-target-dan-error-backend/${surface}-${width}-${theme}.png`,
              fullPage: true,
            });
          }
        };
        if (
          [
            "konsumen",
            "skenario",
            "editor",
            "penerima",
            "editor konsumen",
            "lampiran skenario",
          ].includes(surface)
        ) {
          const settings = await openScenarioSettings(page);
          audit = settings.audit;
          root = settings.dialog;
          await expect(root).toBeVisible({ timeout: 20000 });
          if (surface === "konsumen" || surface === "editor konsumen") {
            await root.getByRole("tab", { name: /^Karakter konsumen/ }).click();
            if (surface === "editor konsumen") {
              await root
                .getByRole("button", { name: "Karakter baru", exact: true })
                .click();
              await expect(root.getByLabel("Nama karakter")).toBeVisible();
              extraFindings.push(...(await findTargetsBelow(page, root)));
              await root.getByLabel("Nama karakter").fill("Konsumen uji");
              await root
                .getByLabel("Deskripsi karakter")
                .fill("Tenang dan sopan.");
              await root
                .getByRole("button", { name: "Simpan", exact: true })
                .first()
                .click();
              await expect(
                root.getByRole("button", { name: "Hapus Konsumen uji" }),
              ).toBeVisible();
            }
          } else if (
            surface === "editor" ||
            surface === "penerima" ||
            surface === "lampiran skenario"
          ) {
            await root
              .getByRole("button", { name: `Ubah ${COMPANY_SCENARIO.title}` })
              .click();
            await expect(
              root.getByRole("heading", { name: "Ubah skenario" }),
            ).toBeVisible();
            if (surface === "penerima") {
              await root.getByRole("button", { name: "Tambah email" }).click();
            } else if (surface === "lampiran skenario") {
              await root.locator("summary").click();
              const fileChooserEvent = page.waitForEvent("filechooser");
              await root
                .getByText("Pilih gambar atau PDF", { exact: true })
                .click();
              const fileChooser = await fileChooserEvent;
              await fileChooser.setFiles({
                name: "lampiran.png",
                mimeType: "image/png",
                buffer: Buffer.from(PIXEL_PNG.split(",")[1], "base64"),
              });
              await expect(
                root.getByRole("button", { name: "Hapus lampiran 1" }),
              ).toBeVisible();
              await expect(
                root.getByRole("heading", { name: "Ubah skenario" }),
              ).toBeInViewport();
              await root
                .getByRole("button", { name: "Hapus lampiran 1" })
                .scrollIntoViewIfNeeded();
              await expect(
                root.getByRole("button", { name: "Hapus lampiran 1" }),
              ).toBeInViewport();
              await expect(
                root.getByRole("heading", { name: "Ubah skenario" }),
              ).toBeInViewport();
            }
          }
        } else if (surface === "landing" || surface === "landing gagal") {
          audit = await openHermeticShell(page, {
            path: "/pdkt",
            apiMocks: [
              ...(surface === "landing gagal"
                ? [
                    {
                      method: "GET" as const,
                      path: "/api/v1/pdkt/history",
                      status: 500,
                      body: {
                        success: false,
                        error: {
                          code: "DATABASE_ERROR",
                          message: "Gagal memuat riwayat.",
                        },
                      },
                    },
                    {
                      method: "GET" as const,
                      path: "/api/v1/pdkt/mailbox",
                      status: 500,
                      body: {
                        success: false,
                        error: {
                          code: "DATABASE_ERROR",
                          message: "Gagal memuat email.",
                        },
                      },
                    },
                  ]
                : []),
              ...pdktMocks(EVALUATED_HISTORY, [OPEN_MAIL, REPLIED_MAIL]),
            ],
          });
          await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);
          await expect(
            page.getByRole("region", { name: "Belum dibalas" }),
          ).toBeVisible({ timeout: 20000 });
        } else {
          audit = await openWorkspace(page, [
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
          root = page.locator("main main");
          if (surface !== "kotak masuk" && surface !== "buat email") {
            if (width === 390)
              await page
                .getByRole("button", {
                  name: new RegExp(OPEN_MAIL.list.subject),
                })
                .click();
            await waitForMockedApi(audit, [
              `/pdkt/mailbox/${OPEN_MAIL.list.id}`,
            ]);
          }
          if (surface === "Tanggapi") {
            await page.getByRole("button", { name: "Tulis balasan" }).click();
            await expect(page.getByLabel("Balasan Anda")).toBeVisible();
          } else if (surface === "buat email") {
            await page
              .getByRole("button", { name: "Email baru", exact: true })
              .click();
            root = page.getByRole("dialog", { name: "Buat email baru" });
            await expect(root).toBeVisible();
          } else if (surface === "lampiran") {
            await page
              .getByRole("button", { name: "Lampiran 1", exact: true })
              .click();
            root = page.getByRole("dialog");
            await expect(root).toBeVisible();
          } else if (surface === "kotak masuk") {
            await capture();
            await page.getByRole("button", { name: "Menu lainnya" }).click();
            await expect(
              page.getByRole("menuitem", { name: "Pilih beberapa" }),
            ).toBeVisible();
            expect(
              await findTargetsBelow(page, page.getByRole("menu")),
              `${width}px menu`,
            ).toEqual([]);
            await page
              .getByRole("menuitem", { name: "Pilih beberapa" })
              .click();
            await expect(page.getByRole("checkbox")).toBeVisible();
            await page.getByRole("checkbox").check();
          }
        }
        if (surface === "landing" || surface === "skenario") await capture();
        expect(
          [...extraFindings, ...(await findTargetsBelow(page, root))],
          `${width}px ${surface}`,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          `${width}px overflow`,
        ).toBe(true);
        expectHermetic(audit);
      }
    });
  }

  test("tombol Mulai simulasi PDKT memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    const start = page.getByRole("button", { name: /^Mulai simulasi/ }).first();
    await expect(start).toBeVisible({ timeout: 20000 });

    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const buttons = await findLowContrastText(start.locator(".."), {
        selector: "button",
      });
      expect(buttons, `${theme}: ${buttons.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks landing PDKT minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }).first(),
    ).toBeVisible({ timeout: 20000 });

    // Ilustrasi tiga tahap (aria-hidden) meniru layar kotak masuk pada skala
    // kecil; ia ilustrasi, bukan teks UI yang dibaca.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="pdkt-stage-demo"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test(`teks mailbox, evaluasi, dan lampiran PDKT minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktMocks(EVALUATED_HISTORY, [OPEN_MAIL, REPLIED_MAIL]),
    );

    // Filter bawaan "Belum dibalas" memilih email terbuka (berlampiran) otomatis.
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    await expect(page.getByRole("button", { name: "Lampiran 1" })).toBeVisible({
      timeout: 20000,
    });
    const offenders = (
      await findTextBelowFloor(page.locator("main").first())
    ).map((o) => `[pahami + lampiran] ${o}`);

    await page.getByRole("button", { name: "Tulis balasan" }).click();
    await expect(page.getByLabel("Balasan Anda")).toBeVisible();
    offenders.push(
      ...(await findTextBelowFloor(page.locator("main").first())).map(
        (o) => `[tanggapi] ${o}`,
      ),
    );
    await page.getByRole("button", { name: "Kembali ke email" }).click();

    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    await expect(
      page.getByText("Sebut kanal pengaduan resmi.").first(),
    ).toBeVisible({
      timeout: 20000,
    });
    offenders.push(
      ...(await findTextBelowFloor(page.locator("main").first())).map(
        (o) => `[telaah] ${o}`,
      ),
    );

    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});
