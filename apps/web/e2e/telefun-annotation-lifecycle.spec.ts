import { expect, test } from "@playwright/test";
import { openHermeticShell, expectHermetic } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  ANNOTATED_ROW,
  recordingMock,
  serveRecording,
  telefunMocks,
} from "./helpers/telefunFixtures";

const row = ANNOTATED_ROW;
const ok = (data: unknown) => ({ success: true, data });
test.beforeAll(() => assertLocalDevOnlyTarget());
test.setTimeout(90000);

for (const outcome of ["success", "failure"] as const) {
  test(`manual Telefun annotation ${outcome} preserves save ownership`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const audit = await openHermeticShell(page, {
      path: `/telefun?sesi=${row.id}&tahap=telaah`,
      waitForUrl: /\/telefun/,
      apiMocks: [
        {
          method: "GET",
          path: `/api/v1/telefun/history/${row.id}`,
          body: ok(row),
        },
        {
          method: "GET",
          path: `/api/v1/telefun/annotations/${row.id}`,
          body: ok([]),
        },
        {
          method: "GET",
          path: `/api/v1/telefun/coaching-summary/${row.id}`,
          body: ok(null),
        },
        recordingMock(row.id),
        ...telefunMocks([row]),
      ],
      beforeNavigate: async () => {
        await serveRecording(page);
        await page.route(
          `**/api/v1/telefun/annotations/${row.id}`,
          async (route) => {
            if (route.request().method() !== "POST") return route.fallback();
            writes++;
            await gate;
            await route.fulfill({
              status: outcome === "failure" ? 500 : 201,
              json:
                outcome === "failure"
                  ? {
                      success: false,
                      error: {
                        code: "SERVER_ERROR",
                        message: "Catatan belum tersimpan.",
                      },
                    }
                  : ok({ id: "manual-note" }),
            });
          },
        );
      },
    });
    try {
      const notes = page.locator("#telefun-trainer-notes");
      await expect(notes).toBeVisible({ timeout: 20000 });
      await notes.locator("summary").click();
      const editor = page.getByRole("textbox", { name: /^Catatan/ });
      await expect(editor).toBeVisible({ timeout: 20000 });
      await editor.fill("Catatan yang sedang disimpan.");
      await page
        .getByRole("button", { name: "Simpan catatan", exact: true })
        .click();
      await expect.poll(() => writes).toBe(1);
      if (outcome === "success") {
        await expect(editor).toBeDisabled();
        await expect(
          page.getByRole("slider", { name: /^Waktu di rekaman/ }),
        ).toBeDisabled();
      }
      release();
      if (outcome === "failure") {
        await expect(editor).toHaveValue("Catatan yang sedang disimpan.");
        await expect(
          page.getByRole("button", { name: "Simpan catatan", exact: true }),
        ).toBeEnabled();
      } else {
        await expect(editor).toHaveValue("");
      }
      expectHermetic(audit);
    } finally {
      release();
    }
  });
}
