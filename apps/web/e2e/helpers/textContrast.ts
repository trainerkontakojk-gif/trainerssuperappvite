/**
 * Batas bawah kontras teks (WCAG 2.x, teks kecil: 4.5:1; docs/design.md §7).
 *
 * Memindai teks yang cocok dengan `selector` (default `svg text`, yaitu label
 * sumbu dan legenda grafik Recharts) dan terlihat di dalam `root`, lalu
 * mengembalikan yang rasio kontrasnya di bawah batas.
 *
 * Warna teks efektif dihitung di browser:
 *   - warna dasar = `fill` terkomputasi (SVG) atau `color` (HTML);
 *   - alfa = alfa warna dikali `opacity` elemen dan SEMUA leluhurnya (inilah
 *     yang membuat `opacity: 0.4` pada tick sumbu lolos dari pemeriksaan token);
 *   - latar = lapisan `background-color` dari elemen ke atas sampai ketemu yang
 *     opak (fallback `body`, lalu putih), dikomposit dari bawah ke atas;
 *   - teks dicampur (alpha blend) di atas latar itu, lalu dihitung rasio WCAG.
 *
 * `leafOnly` melewati elemen yang masih punya elemen anak (untuk legenda HTML).
 *
 * Batasan: `background-image`/gradien diabaikan, dan latar dibaca per lapisan
 * `background-color`. Warna dinormalisasi lewat canvas supaya format modern
 * (oklch, color-mix) ikut terbaca. Pemanggil mengganti tema dengan
 * `setDocumentTheme` sebelum memindai.
 */

import type { Locator, Page } from "@playwright/test";

export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Tema gelap = class `dark` di <html> (sama dengan useThemeMode).
 *
 * Menunggu transisi CSS selesai (animasi tak berhingga dilewati): tanpa itu
 * warna dibaca di tengah transisi dan rasio kontras yang dilaporkan palsu.
 */
export async function setDocumentTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate(async (next) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Animasi tak berhingga (spinner, ilustrasi bergerak) tidak pernah selesai.
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  }, theme);
}

export async function findLowContrastText(
  root: Locator,
  {
    minRatio = MIN_TEXT_CONTRAST,
    selector = "svg text",
    leafOnly = false,
  }: { minRatio?: number; selector?: string; leafOnly?: boolean } = {},
): Promise<string[]> {
  return root.evaluate(
    (element, { min, sel, leaf }) => {
      type Rgba = [number, number, number, number];
      const ctx = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      });
      if (!ctx) throw new Error("canvas 2d tidak tersedia");
      const draw = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data;
      };
      // getImageData sudah non-premultiplied; warna translusen (mis. lapisan
      // `bg-foreground/[0.02]`) kehilangan presisi RGB bila dibaca langsung,
      // jadi alfa dan RGB opak dibaca terpisah lewat relative color syntax.
      const parse = (css: string): Rgba => {
        const a = draw(`rgb(from ${css} 255 255 255 / alpha)`)[3];
        if (a === 0) return [0, 0, 0, 0];
        const [r, g, b] = draw(`rgb(from ${css} r g b / 1)`);
        return [r, g, b, a / 255];
      };
      const over = (top: Rgba, bottom: Rgba): Rgba => {
        const a = top[3] + bottom[3] * (1 - top[3]);
        if (a === 0) return [0, 0, 0, 0];
        const mix = (i: number) =>
          (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
        return [mix(0), mix(1), mix(2), a];
      };
      const lum = ([r, g, b]: Rgba) => {
        const ch = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
      };

      const offenders: string[] = [];
      for (const node of element.querySelectorAll(sel)) {
        const text = node.textContent?.trim();
        if (!text) continue;
        // Legenda HTML: pembungkus ber-warna seri bisa memuat span anak yang
        // sudah diberi warna token; hanya elemen daun yang menentukan.
        if (leaf && node.childElementCount > 0) continue;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          style.visibility === "hidden" ||
          style.display === "none"
        ) {
          continue;
        }

        let alpha = 1;
        const layers: Rgba[] = [];
        for (let el: Element | null = node; el; el = el.parentElement) {
          const s = getComputedStyle(el);
          alpha *= Number.parseFloat(s.opacity);
          const bg = parse(s.backgroundColor);
          if (bg[3] > 0) {
            layers.push(bg);
            if (bg[3] === 1) break;
          }
        }
        let ground: Rgba = [255, 255, 255, 1];
        for (let i = layers.length - 1; i >= 0; i--) ground = over(layers[i], ground);

        const isSvg = node instanceof SVGElement;
        const base = parse(isSvg ? style.fill : style.color);
        const fg = over([base[0], base[1], base[2], base[3] * alpha], ground);
        const [hi, lo] = [lum(fg), lum(ground)].sort((x, y) => y - x);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < min) {
          offenders.push(`${ratio.toFixed(2)}:1 <${node.tagName.toLowerCase()}> "${text.slice(0, 40)}"`);
        }
      }
      return offenders;
    },
    { min: minRatio, sel: selector, leaf: leafOnly },
  );
}
