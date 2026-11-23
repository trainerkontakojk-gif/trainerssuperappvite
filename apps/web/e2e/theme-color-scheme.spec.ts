import { expect, test, type Page } from "@playwright/test";

const readDom = (page: Page) =>
  page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    meta:
      document
        .querySelector('meta[name="color-scheme"]')
        ?.getAttribute("content") ?? null,
    computed: getComputedStyle(document.documentElement).colorScheme,
    stored: localStorage.getItem("theme"),
  }));

test.describe("tema: color-scheme dan override", () => {
  test.use({ colorScheme: "dark" });

  test("sistem gelap tanpa nilai tersimpan: mengikuti sistem dan tidak menulis storage", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Gunakan tema terang" }),
    ).toBeVisible();

    expect(await readDom(page)).toEqual({
      dark: true,
      meta: "light dark",
      computed: "light dark",
      stored: null,
    });
  });

  test("toggle menyimpan override literal dan menghapusnya saat sama dengan sistem", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Gunakan tema terang" }).click();
    await expect(
      page.getByRole("button", { name: "Gunakan tema gelap" }),
    ).toBeVisible();
    expect(await readDom(page)).toEqual({
      dark: false,
      meta: "light",
      computed: "light",
      stored: "light",
    });

    await page.getByRole("button", { name: "Gunakan tema gelap" }).click();
    await expect(
      page.getByRole("button", { name: "Gunakan tema terang" }),
    ).toBeVisible();
    expect(await readDom(page)).toEqual({
      dark: true,
      meta: "light dark",
      computed: "light dark",
      stored: null,
    });
  });
});

test.describe("sistem terang", () => {
  test.use({ colorScheme: "light" });

  test("override gelap menjadi color-scheme gelap", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Gunakan tema gelap" }).click();
    await expect(
      page.getByRole("button", { name: "Gunakan tema terang" }),
    ).toBeVisible();
    expect(await readDom(page)).toEqual({
      dark: true,
      meta: "dark",
      computed: "dark",
      stored: "dark",
    });
  });

  test("toggle tetap bekerja saat key tema di localStorage tidak bisa diakses", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      for (const method of ["getItem", "setItem", "removeItem"] as const) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, {
          configurable: true,
          value(this: Storage, key: string, ...rest: string[]) {
            if (key === "theme")
              throw new DOMException("blocked", "QuotaExceededError");
            return Reflect.apply(original, this, [key, ...rest]);
          },
        });
      }
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Gunakan tema gelap" }).click();
    await expect(
      page.getByRole("button", { name: "Gunakan tema terang" }),
    ).toBeVisible();
    const afterDark = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      meta: document
        .querySelector('meta[name="color-scheme"]')
        ?.getAttribute("content"),
    }));
    expect(afterDark).toEqual({ dark: true, meta: "dark" });

    await page.getByRole("button", { name: "Gunakan tema terang" }).click();
    await expect(
      page.getByRole("button", { name: "Gunakan tema gelap" }),
    ).toBeVisible();
    const afterLight = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      meta: document
        .querySelector('meta[name="color-scheme"]')
        ?.getAttribute("content"),
    }));
    expect(afterLight).toEqual({ dark: false, meta: "light dark" });
  });
});

test("skrip awal menerapkan tema tersimpan sebelum modul aplikasi dimuat", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "light" });
  await context.addInitScript(() => localStorage.setItem("theme", "dark"));
  const page = await context.newPage();
  await page.route("**/src/main.tsx*", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const dom = await readDom(page);
  expect(dom.dark).toBe(true);
  expect(dom.meta).toBe("dark");
  await context.close();
});
