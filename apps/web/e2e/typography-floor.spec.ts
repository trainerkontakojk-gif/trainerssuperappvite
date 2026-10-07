/**
 * Batas bawah ukuran teks global (plans/markdown/text-size-floor.md).
 *
 * Root aplikasi 14px membuat `text-xs` Tailwind (0.75rem) jatuh ke 10.5px.
 * Spec ini membuktikan utilitas yang benar-benar dikompilasi untuk aplikasi
 * memenuhi batas 11px. Hermetic: hanya origin dev-server lokal yang boleh lewat.
 */

import { expect, test } from "@playwright/test";
import { MIN_TEXT_PX } from "./helpers/typographyFloor";
import {
  APP_ORIGIN,
  assertLocalDevOnlyTarget,
} from "./helpers/sidakJadwalShiftingHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

test(`text-xs dirender minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
  const appOrigin = new URL(APP_ORIGIN).origin;
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === appOrigin
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/");
  await expect(page).toHaveTitle(/Trainers SuperApp/i);

  const size = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.className = "text-xs";
    probe.textContent = "Contoh";
    document.body.appendChild(probe);
    const px = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return px;
  });
  expect(size).toBeGreaterThanOrEqual(MIN_TEXT_PX);
});
