import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  openHermeticShell,
  expectHermetic,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { summarizeKetikLanding } from "../src/routes/ketik/utils/landingSummary";

const ok = (data: unknown) => ({ success: true, data });
const version = "2026-11-08T01:00:00.000Z";
const mocks: ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/ketik/settings",
    headers: {
      "x-settings-version": version,
      "x-ketik-templates-version": version,
    },
    body: ok(DEFAULT_KETIK_SETTINGS),
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
const image = {
  name: "small.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S3sAAAAASUVORK5CYII=",
    "base64",
  ),
};

async function openEditor(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Pengaturan KETIK" });
  await dialog.getByRole("button", { name: "Skenario baru" }).click();
  await dialog.getByLabel("Judul skenario").fill("Skenario lampiran");
  await dialog.getByLabel("Deskripsi skenario").fill("Deskripsi lampiran");
  return dialog;
}

async function setup(
  page: Page,
  onWrite?: (body: {
    scenarios: { title: string; images?: string[] }[];
  }) => void,
) {
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    auth: { role: "admin" },
    expectedThirdPartyHosts: ["randomuser.me"],
    apiMocks: mocks,
    beforeNavigate: async () => {
      await page.route("**/api/v1/ketik/settings", async (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        onWrite?.(route.request().postDataJSON());
        await route.fulfill({
          json: ok(null),
          headers: { "x-settings-version": version },
        });
      });
    },
  });
  const menu = page.getByRole("navigation", { name: "Menu KETIK" });
  await expect(menu).toBeVisible({ timeout: 20000 });
  await menu.getByRole("button", { name: /^Pengaturan/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pengaturan KETIK" });
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await dialog.getByRole("tab", { name: /Skenario/ }).click();
  return { audit, dialog: await openEditor(page) };
}

test.beforeAll(() => assertLocalDevOnlyTarget());
test.setTimeout(90000);

test("scenario image preview is saved in settings", async ({ page }) => {
  let saved: { scenarios: { title: string; images?: string[] }[] } | undefined;
  const { audit, dialog } = await setup(page, (body) => {
    saved = body;
  });
  await dialog.locator('input[type="file"]').setInputFiles(image);
  await expect(dialog.getByRole("img", { name: "Preview 1" })).toHaveAttribute(
    "src",
    `data:image/png;base64,${image.buffer.toString("base64")}`,
  );
  await expect(dialog.getByRole("button", { name: "Terapkan" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Terapkan" }).click();
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect
    .poll(
      () =>
        saved?.scenarios.find(
          (scenario) => scenario.title === "Skenario lampiran",
        )?.images,
    )
    .toEqual([`data:image/png;base64,${image.buffer.toString("base64")}`]);
  expectHermetic(audit);
});

test("scenario image is saved after a settings tab round trip", async ({
  page,
}) => {
  let saved: { scenarios: { title: string; images?: string[] }[] } | undefined;
  const { audit, dialog } = await setup(page, (body) => {
    saved = body;
  });
  await dialog.getByRole("tab", { name: /Karakter konsumen/ }).click();
  await dialog.getByRole("tab", { name: /Skenario/ }).click();
  await dialog.locator('input[type="file"]').setInputFiles(image);
  await expect(dialog.getByRole("img", { name: "Preview 1" })).toHaveAttribute(
    "src",
    `data:image/png;base64,${image.buffer.toString("base64")}`,
  );
  await expect(dialog.getByRole("button", { name: "Terapkan" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Terapkan" }).click();
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect
    .poll(
      () =>
        saved?.scenarios.find(
          (scenario) => scenario.title === "Skenario lampiran",
        )?.images,
    )
    .toEqual([`data:image/png;base64,${image.buffer.toString("base64")}`]);
  expectHermetic(audit);
});

test("oversized image is rejected without blocking save", async ({ page }) => {
  const { audit, dialog } = await setup(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(500 * 1024 + 1),
  });
  await expect(
    page.getByText(
      "File large.png terlalu besar (>500KB). Mohon kompres gambar terlebih dahulu.",
    ),
  ).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Preview 1" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Terapkan" })).toBeEnabled();
  expectHermetic(audit);
});

test("a read from a discarded editor cannot affect the next editor", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeFileReader = window.FileReader;
    const gate = window as typeof window & {
      releaseScenarioRead?: () => void;
      scenarioReadHeld?: boolean;
      scenarioReadReleased?: boolean;
    };
    window.FileReader = class extends NativeFileReader {
      constructor() {
        super();
        let callback: ((event: ProgressEvent<FileReader>) => unknown) | null =
          null;
        Object.defineProperty(this, "onloadend", {
          get: () => callback,
          set: (value) => {
            callback = value;
          },
        });
        this.addEventListener("loadend", (event) => {
          gate.scenarioReadHeld = true;
          gate.releaseScenarioRead = () => {
            callback?.call(this, event);
            gate.scenarioReadReleased = true;
          };
        });
      }
    };
  });
  const { audit, dialog } = await setup(page);
  await dialog.locator('input[type="file"]').setInputFiles(image);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { scenarioReadHeld?: boolean })
            .scenarioReadHeld,
      ),
    )
    .toBe(true);
  await expect(
    dialog.getByRole("status").filter({ hasText: "Membaca lampiran..." }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Terapkan" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page
    .getByRole("button", { name: "Buang perubahan", exact: true })
    .click();
  await openEditor(page);
  await page.evaluate(() =>
    (
      window as typeof window & { releaseScenarioRead: () => void }
    ).releaseScenarioRead(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { scenarioReadReleased?: boolean })
            .scenarioReadReleased,
      ),
    )
    .toBe(true);
  await expect(dialog.getByRole("img", { name: "Preview 1" })).toHaveCount(0);
  await expect(
    dialog.getByRole("status").filter({ hasText: "Membaca lampiran..." }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Terapkan" })).toBeEnabled();
  expectHermetic(audit);
});
