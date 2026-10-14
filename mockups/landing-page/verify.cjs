// Local-only browser verification for the standalone mockup; no application services.
const { createRequire } = require("node:module");
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const webRequire = createRequire(
  path.resolve(__dirname, "../../apps/web/package.json"),
);
const { chromium, expect } = webRequire("@playwright/test");
const AxeBuilder = webRequire("@axe-core/playwright").default;
const output =
  process.env.MOCKUP_SCREENSHOT_DIR ||
  path.join(os.tmpdir(), "trainers-landing-mockup");

const axe = async (page) =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations;

// Reads a split-flap board's resting characters, rows joined by "|".
const boardText = (board) =>
  board.evaluate((element) =>
    [...element.querySelectorAll(".flap-row")]
      .map((row) =>
        [...row.querySelectorAll(".flap")]
          .map((flap) => flap.dataset.ch)
          .join("")
          .trim(),
      )
      .join("|"),
  );

// Scrolls a story step's centre to the activation line and waits for the stage to follow.
// Measures twice: on mobile the stage only sticks after the first scroll moves it.
async function activateStep(page, name) {
  await page.locator(`[data-step="${name}"]`).evaluate((step) => {
    for (let pass = 0; pass < 2; pass += 1) {
      const stage = document.querySelector(".stage").getBoundingClientRect();
      const narrow = matchMedia("(max-width: 900px)").matches;
      const visibleTop = narrow ? stage.bottom : 0;
      const box = step.getBoundingClientRect();
      const middle = visibleTop + (innerHeight - visibleTop) / 2;
      scrollTo({
        top: scrollY + box.top + box.height / 2 - middle,
        behavior: "instant",
      });
    }
  });
  await expect(page.locator(".stage")).toHaveAttribute("data-active", name);
}

(async () => {
  const { mkdir } = require("node:fs/promises");
  await mkdir(output, { recursive: true });
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const filename = path.resolve(
      __dirname,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!filename.startsWith(__dirname + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(filename);
      response.setHeader(
        "Content-Type",
        filename.endsWith(".woff2") ? "font/woff2" : "text/html; charset=utf-8",
      );
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const errors = [];
    const remoteRequests = [];
    const watch = async (context) => {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.route("**/*", (route) => {
        if (route.request().url().startsWith(origin)) return route.continue();
        remoteRequests.push(route.request().url());
        return route.abort();
      });
      return page;
    };

    // Motion enabled: the split-flap board cycles module names, then lands.
    const motion = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "no-preference",
    });
    const live = await watch(motion);
    await live.addInitScript(() => {
      window.__frames = [];
      new MutationObserver((records) => {
        for (const record of records)
          if (record.target.matches?.(".hero .flapboard"))
            window.__frames.push(record.target.dataset.frame);
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-frame"],
      });
    });
    const result = await live.goto(origin);
    expect(result.status(), "Mockup HTML exists").toBe(200);
    await live.evaluate(() => document.fonts.ready);
    const board = live.locator(".hero .flapboard");
    await expect(board.locator(".flap")).toHaveCount(16);
    await expect(board).toHaveAttribute("data-state", "idle", {
      timeout: 10000,
    });
    expect(await boardText(board), "Board lands on the wordmark").toBe(
      "Trainers|SuperApp",
    );
    expect(
      await live.evaluate(() => window.__frames),
      "Intro flips through module names before the wordmark",
    ).toEqual(["modul-1", "modul-2", "modul-3", "wordmark"]);
    await live.screenshot({ path: path.join(output, "hero-motion.png") });
    await board.hover();
    await expect(board).toHaveAttribute("data-state", "shuffling");
    await expect(board).toHaveAttribute("data-state", "idle", {
      timeout: 10000,
    });
    expect(await boardText(board), "Hover reshuffle lands again").toBe(
      "Trainers|SuperApp",
    );
    const departures = live.locator(".departures .flapboard");
    await expect(departures).toHaveCount(6);
    await departures.first().scrollIntoViewIfNeeded();
    await expect(departures.nth(2)).toHaveAttribute("data-state", "idle", {
      timeout: 10000,
    });
    expect(await boardText(departures.nth(2))).toBe("TELEFUN");
    await live.screenshot({ path: path.join(output, "departures-motion.png") });
    await motion.close();

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const page = await watch(context);
    await page.goto(origin);
    await expect(page).toHaveTitle("Trainers SuperApp — Mockup Landing Page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Trainers SuperApp",
    );
    await expect(page.locator(".hero p, .hero h2, .hero button")).toHaveCount(
      0,
    );
    await page.evaluate(() => document.fonts.ready);
    const staticBoard = page.locator(".hero .flapboard");
    await expect(staticBoard).toHaveAttribute("data-frame", "wordmark");
    expect(
      await boardText(staticBoard),
      "Reduced motion shows the wordmark at once",
    ).toBe("Trainers|SuperApp");
    expect(await boardText(page.locator(".departures .flapboard").last())).toBe(
      "TNA",
    );
    expect(
      await page.locator(".departures li").allInnerTexts(),
      "Departure rows expose module code and name as text",
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Training Needs Analysis"),
      ]),
    );
    expect(await axe(page), "Dark theme accessibility").toEqual([]);
    await page.screenshot({
      path: path.join(output, "desktop-dark.png"),
      fullPage: true,
    });

    for (const name of ["ketik", "pdkt", "telefun", "ktp", "sidak", "tna"])
      await activateStep(page, name);
    await expect(page.locator('.scene[data-scene="tna"]')).toHaveClass(/is-on/);
    await expect(page.locator(".scene.is-on")).toHaveCount(1);
    await activateStep(page, "sidak");
    await expect(page.locator(".score-value")).toHaveText("92,4");
    await page.screenshot({ path: path.join(output, "stage-sidak.png") });

    await page.getByRole("button", { name: "Lihat modul TNA" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Training Needs Analysis",
    );
    await page.getByRole("button", { name: "Tutup dialog" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    const footer = page.locator(".site-footer");
    expect(
      await boardText(footer.locator(".flapboard")),
      "Footer board carries the full name",
    ).toBe("Trainers|SuperApp");
    const footerNav = page.getByRole("navigation", { name: "Navigasi footer" });
    await expect(footerNav.getByRole("link")).toHaveCount(7);
    await expect(
      footerNav.getByRole("button", { name: "Ajukan Akses" }),
    ).toBeVisible();
    await footer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "footer.png") });
    await activateStep(page, "ketik");
    await footerNav.getByRole("link", { name: "TNA", exact: true }).click();
    await expect(page.locator(".stage")).toHaveAttribute("data-active", "tna");

    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.getByRole("button", { name: "Gunakan tema terang" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await axe(page), "Light theme accessibility").toEqual([]);
    await page.screenshot({
      path: path.join(output, "desktop-light.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Gunakan tema gelap" }).click();
    await page
      .getByRole("button", { name: "Masuk ke Platform", exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      "Tidak ada data yang dikirim",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page
        .getByRole("button", { name: "Masuk ke Platform", exact: true })
        .first(),
    ).toBeFocused();

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `No overflow at ${width}px`,
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(output, "mobile-dark.png"),
      fullPage: true,
    });
    await activateStep(page, "telefun");
    await page.screenshot({ path: path.join(output, "mobile-stage.png") });
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.getByRole("button", { name: "Buka navigasi" }).click();
    await expect(
      page.getByRole("button", { name: "Buka navigasi" }),
    ).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("navigation", { name: "Navigasi mobile" })
      .getByRole("link", { name: "Modul" })
      .click();
    await expect(
      page.getByRole("button", { name: "Buka navigasi" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#modul$/);
    expect(remoteRequests, "No external requests").toEqual([]);
    expect(errors, "No browser errors").toEqual([]);

    const { pathToFileURL } = require("node:url");
    await page.unroute("**/*");
    await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Trainers SuperApp",
    );
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.fonts.check("600 16px Outfit")),
      "Local fonts load through file protocol",
    ).toBe(true);
    expect(errors, "No browser errors including direct file open").toEqual([]);
    console.log(
      `PASS: wordmark-only split-flap hero (module intro, hover reshuffle, static reduced motion), module departure board, 6-scene scroll stage, module dialog, footer board + module links, theme, auth demo dialog, mobile menu, 5 widths, WCAG automated checks in both themes, direct file open, no remote requests or console errors.\nScreenshots: ${output}`,
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
