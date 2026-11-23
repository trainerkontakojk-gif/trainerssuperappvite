/**
 * Enter yang mengonfirmasi kandidat IME (Jepang/Mandarin/Korea) tidak boleh
 * mengirim nilai setengah jadi. Hermetic: semua `/api` dimock.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import {
  CHAT_ID,
  FAST_SETTINGS,
  assignedSelf,
  ketikMocks,
  open,
  serverSession,
} from "./helpers/ketikFlowHarness";
import { PROFILER_MOCKS, TEAM_ID } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const TEAMS = [{ id: TEAM_ID, nama: "Tim Call" }];

const PROFILER_MOCKS_WITH_TEAMS: readonly ApiMock[] = [
  {
    method: "GET",
    path: /^\/api\/v1\/profiler\/peserta\/batch\/Batch(%20|\+)Pagi$/,
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/teams",
    body: { success: true, data: TEAMS },
  },
  {
    method: "POST",
    path: "/api/v1/profiler/teams",
    body: {
      success: true,
      data: { id: "77777777-7777-7777-7777-777777777773", nama: "Tim Sosmed" },
    },
  },
  ...PROFILER_MOCKS,
];

function collectWrites(page: Page) {
  const writes: Array<{ method: string; path: string; body: string }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/") || request.method() === "GET") return;
    writes.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData() ?? "",
    });
  });
  return writes;
}

async function dispatchComposingEnter(field: Locator) {
  await field.evaluate((element) => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

/**
 * The real Enter is the sentinel: it carries different text than the IME Enter
 * did, and we wait for the response to the request carrying that text. Any
 * request the IME Enter caused was issued earlier, so it is already recorded
 * when the sentinel response arrives.
 */
async function pressPlainEnterAndAwaitWrite(
  page: Page,
  field: Locator,
  pathSuffix: string,
  text: string,
) {
  const sentinel = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith(pathSuffix) &&
      (response.request().postData() ?? "").includes(text),
  );
  await field.press("Enter");
  await sentinel;
}

type ImeSignal = "isComposing" | "keyCode 229";

async function dispatchImeEnter(page: Page, field: Locator, signal: ImeSignal) {
  await field.focus();
  if (signal === "isComposing") {
    await dispatchComposingEnter(field);
  } else {
    await dispatchKeyCode229Enter(page);
  }
}

async function dispatchKeyCode229Enter(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 229,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 229,
  });
  await cdp.detach();
}

test.describe("Enter konfirmasi IME tidak mengirim (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  for (const signal of ["isComposing", "keyCode 229"] as const) {
    test(`KETIK chat (${signal}): Enter IME tidak mengirim, Enter biasa mengirim`, async ({
      page,
    }) => {
      const writes = collectWrites(page);
      const audit = await open(
        page,
        "/ketik",
        [
          assignedSelf,
          ...ketikMocks([], FAST_SETTINGS),
          {
            method: "GET",
            path: "/api/v1/ai/usage/summary",
            body: { success: true, data: null },
          },
          {
            method: "POST",
            path: "/api/v1/ketik/sessions",
            body: { success: true, data: serverSession() },
          },
          {
            method: "POST",
            path: `/api/v1/ketik/sessions/${CHAT_ID}/messages`,
            body: { success: true, data: serverSession() },
          },
        ],
        "agent",
      );
      await page
        .getByRole("button", { name: /^Mulai simulasi/ })
        .click({ timeout: 20000 });
      const box = page
        .getByRole("region", { name: "Ruang chat" })
        .getByRole("textbox", { name: "Tulis balasan" });
      await expect(box).toBeVisible();
      await box.fill("こんにちは");

      await dispatchImeEnter(page, box, signal);
      await box.fill("ありがとう");
      await pressPlainEnterAndAwaitWrite(page, box, "/messages", "ありがとう");

      const sent = writes.filter((write) => write.path.endsWith("/messages"));
      expect(sent).toHaveLength(1);
      expect(sent[0].body).toContain("ありがとう");
      expectHermetic(audit);
    });

    test(`Profiler kelola tim (${signal}): Enter IME tidak menambah tim, Enter biasa menambah`, async ({
      page,
    }) => {
      const writes = collectWrites(page);
      const audit = await openHermeticShell(page, {
        path: "/profiler?batch=Batch%20Pagi&tim=1",
        waitForUrl: /\/profiler/,
        apiMocks: PROFILER_MOCKS_WITH_TEAMS,
      });
      const dialog = page.getByRole("dialog", { name: "Kelola daftar tim" });
      const field = dialog.getByLabel("Nama tim baru");
      await expect(field).toBeVisible({ timeout: 20000 });
      await field.fill("チーム");

      await dispatchImeEnter(page, field, signal);
      await field.fill("タイム");
      await pressPlainEnterAndAwaitWrite(
        page,
        field,
        "/api/v1/profiler/teams",
        "タイム",
      );

      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        method: "POST",
        path: "/api/v1/profiler/teams",
      });
      expect(writes[0].body).toContain("タイム");
      expectHermetic(audit);
    });

    test(`Profiler tambah peserta (${signal}): Enter IME tidak menambah tim, Enter biasa menambah`, async ({
      page,
    }) => {
      const writes = collectWrites(page);
      const audit = await openHermeticShell(page, {
        path: "/profiler?batch=Batch%20Pagi&view=tambah",
        waitForUrl: /\/profiler/,
        apiMocks: PROFILER_MOCKS_WITH_TEAMS,
      });
      await page
        .getByRole("button", { name: "Tim baru" })
        .last()
        .click({ timeout: 20000 });
      const field = page.getByPlaceholder("Nama tim baru");
      await expect(field).toBeVisible();
      await field.fill("チーム");

      await dispatchImeEnter(page, field, signal);
      await field.fill("タイム");
      await pressPlainEnterAndAwaitWrite(
        page,
        field,
        "/api/v1/profiler/teams",
        "タイム",
      );

      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        method: "POST",
        path: "/api/v1/profiler/teams",
      });
      expect(writes[0].body).toContain("タイム");
      expectHermetic(audit);
    });
  }
});
