import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Landing publik split-flap (hermetic, mode tamu).
 *
 * Hero hanya berisi wordmark pada papan split-flap; papan lain (kode modul,
 * footer) mendarat saat terlihat; langkah modul menggerakkan panggung contoh.
 * Papan merender karakter lewat `data-ch`, jadi spec membaca atribut itu.
 */

const MODULES = ["ketik", "pdkt", "telefun", "ktp", "sidak", "tna"] as const;

/** Karakter diam papan, baris digabung "|". */
const boardText = (board: Locator) =>
  board.evaluate((element) =>
    [...element.querySelectorAll(".flap-row")]
      .map((row) =>
        [...row.querySelectorAll<HTMLElement>(".flap")]
          .map((flap) => flap.dataset.ch)
          .join("")
          .trim(),
      )
      .join("|"),
  );

/** Gulir pusat langkah ke garis aktivasi dan tunggu panggung mengikuti. */
async function activateStep(page: Page, name: string) {
  await page.locator(`[data-step="${name}"]`).evaluate((step) => {
    // Diukur dua kali: di mobile panggung baru menempel setelah gulir pertama.
    for (let pass = 0; pass < 2; pass += 1) {
      const stage = document.querySelector(".stage")!.getBoundingClientRect();
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

async function openGuestLanding(
  page: Page,
  reducedMotion: "reduce" | "no-preference",
) {
  await page.emulateMedia({ reducedMotion });
  const audit = await openHermeticShell(page, { path: "/", auth: false });
  console.log("[audit]", formatAudit(audit));
  return audit;
}

test.describe("Landing publik — split-flap", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("hero hanya wordmark: intro melewati nama modul, lalu mendarat; hover mengocok ulang", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const frames: string[] = [];
      (window as unknown as { __frames: string[] }).__frames = frames;
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as HTMLElement;
          if (target.matches?.(".hero .flapboard") && target.dataset.frame)
            frames.push(target.dataset.frame);
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-frame"],
      });
    });
    const audit = await openGuestLanding(page, "no-preference");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Trainers SuperApp",
    );
    const hero = page.locator(".hero");
    await expect(hero.locator("p, h2, button, a:not(.hero-cue)")).toHaveCount(
      0,
    );
    const board = hero.locator(".flapboard");
    await expect(board.locator(".flap")).toHaveCount(16);
    await expect(board).toHaveAttribute("data-state", "idle", {
      timeout: 10000,
    });
    expect(await boardText(board)).toBe("Trainers|SuperApp");
    expect(
      await page.evaluate(
        () => (window as unknown as { __frames: string[] }).__frames,
      ),
    ).toEqual(["modul-1", "modul-2", "modul-3", "wordmark"]);

    await board.hover();
    await expect(board).toHaveAttribute("data-state", "shuffling");
    await expect(board).toHaveAttribute("data-state", "idle", {
      timeout: 10000,
    });
    expect(await boardText(board)).toBe("Trainers|SuperApp");
    expectHermetic(audit);
  });

  test("papan modul dan footer mendarat saat terlihat; langkah dan tautan footer menggerakkan panggung", async ({
    page,
  }) => {
    const audit = await openGuestLanding(page, "no-preference");

    const departures = page.locator(".departures .flapboard");
    await expect(departures).toHaveCount(6);
    await expect(page.locator(".departures li").last()).toContainText(
      "Training Needs Analysis",
    );
    await departures.first().scrollIntoViewIfNeeded();
    await expect(departures.nth(2)).toHaveAttribute("data-state", "idle", {
      timeout: 10000,
    });
    expect(await boardText(departures.nth(2))).toBe("TELEFUN");

    for (const name of MODULES) await activateStep(page, name);
    await expect(page.locator(".scene.is-on")).toHaveCount(1);
    await expect(page.locator('.scene[data-scene="tna"]')).toHaveClass(/is-on/);

    const footer = page.locator(".site-footer");
    await footer.scrollIntoViewIfNeeded();
    const footerBoard = footer.locator(".flapboard");
    await expect(footerBoard).toHaveAttribute("data-state", "idle", {
      timeout: 10000,
    });
    expect(await boardText(footerBoard)).toBe("Trainers|SuperApp");
    const footerNav = page.getByRole("navigation", { name: "Navigasi footer" });
    await expect(footerNav.getByRole("link")).toHaveCount(7);
    await activateStep(page, "ketik");
    await footerNav.getByRole("link", { name: "TNA", exact: true }).click();
    await expect(page.locator(".stage")).toHaveAttribute("data-active", "tna");
    expectHermetic(audit);
  });

  test("reduced motion: semua papan langsung menampilkan teks akhir", async ({
    page,
  }) => {
    const audit = await openGuestLanding(page, "reduce");

    const hero = page.locator(".hero .flapboard");
    await expect(hero).toHaveAttribute("data-frame", "wordmark");
    await expect(hero).toHaveAttribute("data-state", "idle");
    expect(await boardText(hero)).toBe("Trainers|SuperApp");
    expect(await boardText(page.locator(".departures .flapboard").last())).toBe(
      "TNA",
    );
    expect(await boardText(page.locator(".site-footer .flapboard"))).toBe(
      "Trainers|SuperApp",
    );
    await activateStep(page, "sidak");
    await expect(page.locator(".score-value")).toHaveText("92,4");
    expectHermetic(audit);
  });

  test("tombol tamu membuka AuthModal mode masuk dan ajukan akses", async ({
    page,
  }) => {
    const audit = await openGuestLanding(page, "reduce");

    await page.getByRole("button", { name: "Masuk ke Platform" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Masuk" })).toBeVisible();

    const reopened = await openGuestLanding(page, "reduce");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Ajukan Akses" })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: "Minta Akses Baru" }),
    ).toBeVisible();
    expectHermetic(audit);
    expectHermetic(reopened);
  });

  test("tanpa overflow horizontal 320–1440 px; menu mobile menuju modul", async ({
    page,
  }) => {
    const audit = await openGuestLanding(page, "reduce");

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `tidak ada overflow di ${width}px`,
      ).toBe(true);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.getByRole("button", { name: "Buka navigasi" });
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("navigation", { name: "Navigasi mobile" })
      .getByRole("link", { name: "Modul" })
      .click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#modul$/);
    await activateStep(page, "telefun");
    expectHermetic(audit);
  });

  test("hero menyisakan judul Modul di layar pertama; tautan Scroll di bawah tengah menuju modul", async ({
    page,
  }) => {
    const audit = await openGuestLanding(page, "reduce");

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      const label = `${viewport.width}×${viewport.height}`;

      const heading = await page
        .locator("#modules-title")
        .evaluate((element) => element.getBoundingClientRect().top);
      expect(heading, `judul Modul mengintip di ${label}`).toBeLessThan(
        viewport.height - 24,
      );

      const cue = page.locator(".hero").getByRole("link", { name: /Scroll/ });
      await expect(cue).toHaveText("Scroll");
      const box = (await cue.boundingBox())!;
      expect(
        Math.abs(box.x + box.width / 2 - viewport.width / 2),
        `Scroll di tengah horizontal ${label}`,
      ).toBeLessThan(2);
      expect(box.y, `Scroll di bagian bawah hero ${label}`).toBeGreaterThan(
        viewport.height * 0.5,
      );
      expect(box.y + box.height).toBeLessThan(heading);
    }

    await page.locator(".hero-cue").click();
    await expect(page).toHaveURL(/#modul$/);
    await expect(page.locator("#modules-title")).toBeInViewport();
    expectHermetic(audit);
  });

  test("WCAG 2.1 A/AA otomatis lulus di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await openGuestLanding(page, "reduce");
    await page.evaluate(() => document.fonts.ready);

    for (const theme of ["terang", "gelap"]) {
      const toggle = page.getByRole("button", {
        name: /Gunakan tema (terang|gelap)/,
      });
      if ((await toggle.getAttribute("aria-label")) === `Gunakan tema ${theme}`)
        await toggle.click();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        ),
        `tema ${theme}`,
      ).toEqual([]);
    }
    expectHermetic(audit);
  });
});
