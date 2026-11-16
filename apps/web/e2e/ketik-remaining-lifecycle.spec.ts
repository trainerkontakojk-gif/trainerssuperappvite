import { expect, test } from "@playwright/test";
import { expectHermetic, openHermeticShell } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ketikMocks, PENDING_SESSION } from "./helpers/ketikFlowHarness";
import { base } from "./helpers/ketikServerChatHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

test("empty replay stays at zero with no playable or out-of-bounds state", async ({
  page,
}) => {
  const item = { ...PENDING_SESSION, messages: [] };
  const audit = await openHermeticShell(page, {
    path: "/ketik/history",
    apiMocks: ketikMocks([item]),
  });
  await page
    .getByRole("button", {
      name: `Putar ulang ${item.scenarioTitle}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Tidak ada pesan", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("0 / 0", { exact: true })).toBeVisible();
  for (const title of ["Play", "Next", "Previous", "Reset"])
    await expect(dialog.getByTitle(title, { exact: true })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("empty-replay.png") });
  expectHermetic(audit);
});

test("replay playback reaches an explicit end and resets cleanly after closing", async ({
  page,
}) => {
  const item = {
    ...PENDING_SESSION,
    messages: [0, 1, 2].map((i) => ({
      id: `play-${i}`,
      sender: "agent" as const,
      text: `Pesan playback ${i}`,
      timestamp: new Date().toISOString(),
    })),
  };
  const audit = await openHermeticShell(page, {
    path: "/ketik/history",
    apiMocks: ketikMocks([item]),
  });
  const trigger = page.getByRole("button", {
    name: `Putar ulang ${item.scenarioTitle}`,
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTitle("Play", { exact: true }).click();
  await expect(dialog.getByTitle("Pause", { exact: true })).toBeVisible();
  await expect(dialog.getByText("3 / 3", { exact: true })).toBeVisible({
    timeout: 7000,
  });
  await expect(dialog.getByTitle("Play", { exact: true })).toBeDisabled();
  await dialog.getByTitle("Previous", { exact: true }).click();
  await expect(dialog.getByText("2 / 3", { exact: true })).toBeVisible();
  await dialog.getByTitle("Reset", { exact: true }).click();
  await expect(dialog.getByText("1 / 3", { exact: true })).toBeVisible();
  await dialog.getByTitle("Play", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(dialog.getByText("1 / 3", { exact: true })).toBeVisible();
  await expect(dialog.getByTitle("Play", { exact: true })).toBeEnabled();
  await expect(dialog.getByTitle("Pause", { exact: true })).toHaveCount(0);
  expectHermetic(audit);
});

for (const all of [false, true])
  test(`history deletion failure keeps its ${all ? "all" : "one"} target until explicit retry`, async ({
    page,
  }) => {
    const item = PENDING_SESSION;
    const audit = await openHermeticShell(page, {
      path: "/ketik/history",
      apiMocks: ketikMocks([item]),
    });
    let deletes = 0;
    await page.route(
      all ? "**/api/v1/ketik/history" : `**/api/v1/ketik/history/${item.id}`,
      async (route) => {
        if (route.request().method() !== "DELETE") return route.fallback();
        deletes++;
        await route.fulfill(
          deletes === 1
            ? {
                status: 503,
                json: {
                  success: false,
                  error: { code: "HISTORY_FAILED", message: "Coba lagi." },
                },
              }
            : { json: { success: true, data: null } },
        );
      },
    );
    await page
      .getByRole("button", {
        name: all ? "Hapus semua riwayat" : `Hapus sesi ${item.scenarioTitle}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: all ? "Hapus semua riwayat?" : "Hapus sesi ini?",
    });
    const confirm = dialog.getByRole("button", {
      name: all ? "Hapus semua" : "Hapus sesi",
      exact: true,
    });
    await confirm.click();
    await expect(
      page.getByText(
        all
          ? "Riwayat belum terhapus. Coba lagi."
          : "Sesi belum terhapus. Coba lagi.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(confirm).toBeEnabled();
    expect(deletes).toBe(1);
    await confirm.click();
    await expect(dialog).toBeHidden();
    expect(deletes).toBe(2);
    expectHermetic(audit);
  });

test("late recipient lookup cannot replace the version snapshot used to assign another recipient", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstStarted = false;
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: "/api/v1/admin/users",
        body: {
          success: true,
          data: ["a", "b"].map((id) => ({
            id: `recipient-${id}`,
            full_name: `Penerima ${id.toUpperCase()}`,
            email: `${id}@test.local`,
            role: "agent",
            status: "active",
            is_deleted: false,
          })),
        },
      },
    ],
  });
  await page.route("**/api/v1/ketik/assignments/recipient-a", async (route) => {
    firstStarted = true;
    await gate;
    await route.fulfill({
      json: {
        success: true,
        data: { assignment: null, recipientSettingsVersion: "version-a" },
      },
    });
  });
  const puts: unknown[] = [];
  await page.route("**/api/v1/ketik/assignments/recipient-b", async (route) => {
    if (route.request().method() === "PUT")
      puts.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        success: true,
        data: { assignment: null, recipientSettingsVersion: "version-b" },
      },
    });
  });
  try {
    await page.getByRole("button", { name: "Penugasan", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Penugasan KETIK" });
    const recipient = dialog.getByRole("combobox", {
      name: "Penerima",
      exact: true,
    });
    await recipient.click();
    await page.getByRole("option", { name: "Penerima A", exact: true }).click();
    await expect.poll(() => firstStarted).toBe(true);
    await recipient.click();
    await page.getByRole("option", { name: "Penerima B", exact: true }).click();
    const assign = dialog.getByRole("button", {
      name: "Tugaskan skenario",
      exact: true,
    });
    await expect(assign).toBeEnabled();
    const late = page.waitForResponse((response) =>
      response.url().endsWith("/ketik/assignments/recipient-a"),
    );
    release();
    await (await late).finished();
    await page.waitForTimeout(200);
    await assign.click();
    await expect(dialog.getByText(/Penugasan tersimpan/)).toBeVisible();
    expect(puts).toEqual([
      {
        sourceSettingsVersion: "2026-10-14T05:00:00.000Z",
        recipientSettingsVersion: "version-b",
        expectedAssignmentVersion: null,
      },
    ]);
    expectHermetic(audit);
  } finally {
    release();
  }
});
