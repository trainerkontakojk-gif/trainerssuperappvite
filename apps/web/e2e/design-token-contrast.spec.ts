/**
 * Kontrak kontras token warna (plans/markdown/design-token-contrast-fix.md).
 *
 * Membaca nilai token yang benar-benar terkomputasi di browser pada tema terang
 * dan gelap, lalu memeriksa rasio kontras WCAG dan jarak hue antar-modul.
 * Hermetic: hanya origin dev-server lokal yang boleh lewat; request lain di-abort.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  APP_ORIGIN,
  assertLocalDevOnlyTarget,
} from "./helpers/sidakJadwalShiftingHarness";

type Rgb = [number, number, number];

const GROUNDS = ["--bg", "--surface", "--surface-elevated"] as const;
const TEXT_TOKENS = ["--fg3", "--module-telefun", "--module-profiler"] as const;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_MODULE_HUE_DISTANCE = 60;

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue([r, g, b]: Rgb): number {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const delta = max - Math.min(rn, gn, bn);
  if (delta === 0) return 0;
  const raw =
    max === rn
      ? ((gn - bn) / delta) % 6
      : max === gn
        ? (bn - rn) / delta + 2
        : (rn - gn) / delta + 4;
  return (raw * 60 + 360) % 360;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

async function setTheme(page: Page, theme: "light" | "dark") {
  // Sama dengan useThemeMode: tema gelap = class `dark` di <html>.
  await page.evaluate((next) => {
    document.documentElement.classList.toggle("dark", next === "dark");
  }, theme);
}

async function readTokens(page: Page, names: readonly string[]) {
  return page.evaluate((tokenNames) => {
    const probe = document.createElement("span");
    document.documentElement.appendChild(probe);
    const result: Record<string, [number, number, number]> = {};
    for (const name of tokenNames) {
      probe.style.color = `var(${name})`;
      const match = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
      if (!match) throw new Error(`token ${name} tidak terbaca`);
      result[name] = [Number(match[0]), Number(match[1]), Number(match[2])];
    }
    probe.remove();
    return result;
  }, names);
}

test.beforeAll(() => assertLocalDevOnlyTarget());

test.beforeEach(async ({ page }) => {
  const appOrigin = new URL(APP_ORIGIN).origin;
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === appOrigin
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/");
  await expect(page).toHaveTitle(/Trainers SuperApp/i);
});

for (const theme of ["light", "dark"] as const) {
  test(`token teks memenuhi kontras ${MIN_TEXT_CONTRAST}:1 di tema ${theme}`, async ({
    page,
  }) => {
    await setTheme(page, theme);
    const tokens = await readTokens(page, [...GROUNDS, ...TEXT_TOKENS]);

    const failures: string[] = [];
    for (const text of TEXT_TOKENS) {
      for (const ground of GROUNDS) {
        const ratio = contrast(tokens[text], tokens[ground]);
        if (ratio < MIN_TEXT_CONTRAST) {
          failures.push(`${text} di atas ${ground}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test(`warna Profiler terpisah dari PDKT di tema ${theme}`, async ({ page }) => {
    await setTheme(page, theme);
    const tokens = await readTokens(page, ["--module-profiler", "--module-pdkt"]);

    const distance = hueDistance(
      hue(tokens["--module-profiler"]),
      hue(tokens["--module-pdkt"]),
    );
    expect(distance).toBeGreaterThanOrEqual(MIN_MODULE_HUE_DISTANCE);
  });
}
