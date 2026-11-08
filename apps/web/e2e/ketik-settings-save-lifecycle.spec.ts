import { expect, test } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  openHermeticShell,
  expectHermetic,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { summarizeKetikLanding } from "../src/routes/ketik/utils/landingSummary";

const ok = (data: unknown) => ({ success: true, data });
const globalTemplates = [
  { id: "standard-1", keyword: "salam", content: "Salam standar awal." },
];
const settings = {
  ...DEFAULT_KETIK_SETTINGS,
  globalQuickTemplates: globalTemplates,
  personalQuickTemplates: [],
  quickTemplates: globalTemplates,
};
const version = "2026-11-08T01:00:00.000Z";
const mocks: ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/ketik/settings",
    headers: {
      "x-settings-version": version,
      "x-ketik-templates-version": version,
    },
    body: ok(settings),
  },
  {
    method: "GET",
    path: "/api/v1/ketik/history/summary",
    body: ok(summarizeKetikLanding([])),
  },
  {
    method: "GET",
    path: "/api/v1/ketik/history",
    body: ok({
      items: [],
      nextCursor: null,
      total: 0,
      counts: { all: 0, completed: 0, running: 0, failed: 0, not_started: 0 },
      reviewedCount: 0,
      averageScore: null,
    }),
  },
  {
    method: "GET",
    path: "/api/v1/ketik/assignments/self",
    body: ok({ assignment: null, recipientSettingsVersion: "absent" }),
  },
];

test.beforeAll(() => assertLocalDevOnlyTarget());
test.setTimeout(90000);
for (const contract of [
  "partial result",
  "retry",
  "reopen",
  "next revision",
] as const) {
  test(`KETIK global-personal save ${contract} acknowledges the completed stage`, async ({
    page,
  }) => {
    let globalWrites = 0;
    let personalWrites = 0;
    const personalVersions: string[] = [];
    const templateVersions: string[] = [];
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      auth: { role: "admin" },
      expectedThirdPartyHosts: ["randomuser.me"],
      apiMocks: mocks,
      beforeNavigate: async () => {
        await page.route("**/api/v1/ketik/templates", async (route) => {
          globalWrites++;
          templateVersions.push(
            route.request().headers()["x-ketik-templates-version"] ?? "",
          );
          expect(route.request().postDataJSON().templates[0].content).toBe(
            globalWrites === 1
              ? "Salam standar yang diperbarui."
              : "Revisi template berikutnya.",
          );
          await route.fulfill({
            json: ok(null),
            headers: {
              "x-ketik-templates-version": "2026-11-08T01:01:00.000Z",
            },
          });
        });
        await page.route("**/api/v1/ketik/settings", async (route) => {
          if (route.request().method() !== "PUT") return route.fallback();
          personalWrites++;
          personalVersions.push(
            route.request().headers()["x-settings-version"] ?? "",
          );
          await route.fulfill(
            personalWrites === 1
              ? {
                  status: 500,
                  json: {
                    success: false,
                    error: {
                      code: "SETTINGS_SAVE_FAILED",
                      message: "Pengaturan pribadi belum tersimpan.",
                    },
                  },
                }
              : {
                  json: ok(null),
                  headers: { "x-settings-version": "2026-11-08T01:02:00.000Z" },
                },
          );
        });
      },
    });
    const menu = page.getByRole("navigation", { name: "Menu KETIK" });
    await expect(menu).toBeVisible({ timeout: 20000 });
    await menu.getByRole("button", { name: /^Pengaturan/ }).click();
    const dialog = page.getByRole("dialog", { name: "Pengaturan KETIK" });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await dialog.getByRole("tab", { name: /Template cepat/ }).click();
    await dialog
      .getByRole("button", { name: "Ubah template salam", exact: true })
      .click();
    await dialog
      .getByRole("textbox", { name: "Isi template", exact: true })
      .fill("Salam standar yang diperbarui.");
    await dialog.getByRole("button", { name: "Terapkan", exact: true }).click();
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect.poll(() => personalWrites).toBe(1);
    await expect(
      dialog.getByRole("button", { name: "Simpan", exact: true }),
    ).toBeEnabled();
    expect(globalWrites).toBe(1);
    if (contract === "partial result") {
      await expect(dialog.getByRole("alert")).toContainText(
        /Template standar sudah tersimpan.*pengaturan pribadi/is,
      );
      await expect(
        dialog.getByText("Salam standar yang diperbarui.", { exact: true }),
      ).toBeVisible();
    } else {
      if (contract === "reopen") {
        await dialog
          .getByRole("button", { name: "Tutup pengaturan", exact: true })
          .click();
        await expect(dialog).toBeHidden();
        await menu.getByRole("button", { name: /^Pengaturan/ }).click();
        await dialog.getByRole("tab", { name: /Template cepat/ }).click();
        await expect(
          dialog.getByText("Salam standar yang diperbarui.", { exact: true }),
        ).toBeVisible();
      }
      if (contract === "next revision") {
        await dialog
          .getByRole("button", { name: "Ubah template salam", exact: true })
          .click();
        await dialog
          .getByRole("textbox", { name: "Isi template", exact: true })
          .fill("Revisi template berikutnya.");
        await dialog
          .getByRole("button", { name: "Terapkan", exact: true })
          .click();
      }
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(personalWrites).toBe(2);
      expect(globalWrites).toBe(contract === "next revision" ? 2 : 1);
      expect(templateVersions).toEqual(
        contract === "next revision"
          ? [version, "2026-11-08T01:01:00.000Z"]
          : [version],
      );
      expect(personalVersions).toEqual([version, version]);
    }
    expectHermetic(audit);
  });
}
