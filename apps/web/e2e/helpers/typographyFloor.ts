/**
 * Batas bawah ukuran teks (docs/design.md §7: teks yang dibaca minimal 11px).
 *
 * Memindai setiap elemen yang punya teks langsung dan terlihat di dalam `root`,
 * termasuk `<text>` SVG grafik, lalu mengembalikan yang ukuran fontnya di bawah
 * batas. Teks yang disembunyikan dari pembaca layar (`aria-hidden`) tetap
 * dihitung: mata pengguna tetap membacanya.
 *
 * `exclude` (selector CSS) hanya untuk ilustrasi yang meniru layar lain pada
 * skala kecil, mis. mockup telepon Telefun; setiap pengecualian wajib
 * dijelaskan di spec pemanggil.
 */

import type { Locator } from "@playwright/test";

export const MIN_TEXT_PX = 11;

export async function findTextBelowFloor(
  root: Locator,
  { minPx = MIN_TEXT_PX, exclude }: { minPx?: number; exclude?: string } = {},
): Promise<string[]> {
  return root.evaluate((element, { min, skip }) => {
    const offenders: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const text = node.textContent?.trim();
      if (!parent || !text || seen.has(parent)) continue;
      if (skip && parent.closest(skip)) continue;
      seen.add(parent);
      const rect = parent.getBoundingClientRect();
      const style = getComputedStyle(parent);
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.visibility === "hidden" ||
        style.display === "none"
      ) {
        continue;
      }
      const size = Number.parseFloat(style.fontSize);
      if (size < min) {
        offenders.push(`${size}px <${parent.tagName.toLowerCase()}> "${text.slice(0, 40)}"`);
      }
    }
    return offenders;
  }, { min: minPx, skip: exclude ?? null });
}
