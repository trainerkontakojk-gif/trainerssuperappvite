import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_KETIK_SETTINGS,
  type KetikSessionHistoryItem,
} from "@trainers/types";
import {
  openHermeticShell,
  expectHermetic,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const history: KetikSessionHistoryItem[] = Array.from(
  { length: 205 },
  (_, i) => ({
    id: `23000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    date: new Date(Date.now() - i * 1000).toISOString(),
    scenarioTitle: `Latihan ${i}`,
    consumerName: i % 2 ? "Bu Rina" : "Pak Ali",
    reviewStatus: i % 2 ? "failed" : "pending",
    messages: [
      {
        id: "m1",
        sender: "consumer",
        text: `Transkrip sesi ${i}`,
        timestamp: new Date().toISOString(),
      },
    ],
  }),
);
function mocks(): ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/ketik/settings",
      body: { success: true, data: DEFAULT_KETIK_SETTINGS },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history/summary",
      body: {
        success: true,
        data: {
          sessionsThisMonth: 205,
          reviewing: 0,
          average: null,
          focus: null,
          recent: [],
          followUps: [],
        },
      },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history",
      body: { success: true, data: history.slice(0, 20) },
    },
    {
      method: "GET",
      path: `/api/v1/ketik/history/${history[204].id}`,
      body: {
        success: true,
        data: { ...history[204], previousFinalScore: null },
      },
    },
  ];
}
async function dynamicPages(page: Page) {
  const requests: string[] = [];
  const control = {
    failExport: false,
    exportTooLarge: false,
    failDetail: false,
    slowSearch: false,
  };
  await page.route("**/api/v1/ketik/history**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/ketik/history/summary") {
      await route.fallback();
      return;
    }
    requests.push(url.pathname + url.search);
    if (url.pathname !== "/api/v1/ketik/history") {
      const item = history.find((r) => url.pathname.endsWith(r.id));
      await route.fulfill({
        status: control.failDetail ? 500 : item ? 200 : 404,
        json: {
          success: !control.failDetail,
          data: item ? { ...item, previousFinalScore: null } : null,
        },
      });
      return;
    }
    const q = url.searchParams.get("q") ?? "";
    const status = url.searchParams.get("status") ?? "all";
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    const matched = history.filter(
      (s) =>
        s.scenarioTitle.toLowerCase().includes(q.toLowerCase()) ||
        s.consumerName.toLowerCase().includes(q.toLowerCase()),
    );
    const selected = matched.filter(
      (s) =>
        status === "all" ||
        s.reviewStatus === status ||
        (status === "not_started" && s.reviewStatus === "pending"),
    );
    if (limit === 100 && control.failExport && offset > 0) {
      await route.fulfill({
        status: 500,
        json: { success: false, error: { message: "Ekspor gagal" } },
      });
      return;
    }
    if (control.slowSearch && q === "Latihan 2")
      await new Promise((r) => setTimeout(r, 350));
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: selected
            .slice(offset, offset + limit)
            .map(({ messages: _, ...s }) => s),
          nextCursor:
            offset + limit < selected.length ? String(offset + limit) : null,
          total:
            limit === 100 && control.exportTooLarge ? 10001 : selected.length,
          reviewedCount: 0,
          averageScore: null,
          counts: {
            all: matched.length,
            completed: 0,
            running: 0,
            failed: matched.filter((s) => s.reviewStatus === "failed").length,
            not_started: matched.filter((s) => s.reviewStatus === "pending")
              .length,
          },
        },
      },
    });
  });
  return { requests, control };
}

test.beforeAll(assertLocalDevOnlyTarget);
test("old deep-link loads detail independently of the first page and failed detail can retry", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${history[204].id}&tahap=telaah`,
    apiMocks: mocks(),
    waitForUrl: /\/ketik/,
  });
  await expect(
    page.getByText("Konsumen: Transkrip sesi 204", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(history[204].id));
  expectHermetic(audit);
  const { control } = await dynamicPages(page);
  control.failDetail = true;
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Sesi belum bisa dimuat");
  await expect(page).toHaveURL(new RegExp(history[204].id));
  control.failDetail = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(
    page.getByText("Konsumen: Transkrip sesi 204", { exact: true }),
  ).toBeVisible();
});

test("server pages, search, replay and full filtered CSV have honest progress/failure states", async ({
  page,
}, info) => {
  const audit = await openHermeticShell(page, {
    path: "/ketik/history",
    apiMocks: mocks(),
  });
  const { requests, control } = await dynamicPages(page);
  await page.reload();
  const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
  await expect(table.getByRole("row")).toHaveCount(21);
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(table).toContainText("Latihan 20");
  await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
  await expect(table).toContainText("Latihan 0");
  const trigger = page.getByRole("button", {
    name: "Putar ulang Latihan 0",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toContainText("Transkrip sesi 0");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  control.slowSearch = true;
  await page.getByRole("searchbox").fill("Latihan 2");
  await page.getByRole("searchbox").fill("Latihan 204");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Latihan 204");
  await page.getByRole("searchbox").fill("");
  await expect(table.getByRole("row")).toHaveCount(21);
  control.failExport = true;
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CSV belum bisa diunduh");
  expect(downloads).toBe(0);
  control.failExport = false;
  control.exportTooLarge = true;
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CSV belum bisa diunduh");
  expect(downloads).toBe(0);
  control.exportTooLarge = false;
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  const download = await downloadEvent;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.split("\r\n")).toHaveLength(206);
  expect(csv).toContain('"Latihan 204"');
  expect(requests.some((r) => r.includes("cursor=200"))).toBe(true);
  await page.getByRole("button", { name: /^Gagal/ }).click();
  await expect(table).not.toContainText("Latihan 0");
  const filteredDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  expect(
    (await readFile((await (await filteredDownload).path())!, "utf8")).split(
      "\r\n",
    ),
  ).toHaveLength(103);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath(`history-${width}.png`),
      fullPage: true,
    });
    const pager = page.getByRole("navigation", { name: "Halaman riwayat" });
    await pager.scrollIntoViewIfNeeded();
    for (const button of await pager.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: info.outputPath(`history-pager-${width}.png`),
    });
  }
  expectHermetic(audit);
});

test("account changes clear prior history counts and replay while the next account loads", async ({
  page,
}) => {
  await openHermeticShell(page, { path: "/ketik/history", apiMocks: mocks() });
  await dynamicPages(page);
  await page.reload();
  await expect(
    page.getByText("205 sesi · belum ada yang ditelaah", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Putar ulang Latihan 0", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/ketik/history?*", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [],
          total: 0,
          nextCursor: null,
          counts: {
            all: 0,
            completed: 0,
            running: 0,
            failed: 0,
            not_started: 0,
          },
          reviewedCount: 0,
          averageScore: null,
        },
      },
    });
  });
  try {
    await page.evaluate(async () => {
      const path = "/src/store/authStore.ts";
      const { useAuthStore } = await import(path);
      const state = useAuthStore.getState();
      state.setSession({
        ...state.session,
        user: { ...state.session.user, id: "account-2" },
      });
    });
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByText("Memuat riwayat…", { exact: true }),
    ).toBeAttached();
    await expect(
      page.getByText("205 sesi · belum ada yang ditelaah", { exact: true }),
    ).toBeHidden();
  } finally {
    release();
  }
  await expect(
    page.getByText("Belum ada sesi latihan", { exact: true }),
  ).toBeVisible();
});
