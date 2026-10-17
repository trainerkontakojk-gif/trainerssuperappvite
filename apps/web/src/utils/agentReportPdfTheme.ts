/** Geometri halaman, tipografi, dan palet warna generator PDF laporan agen. Dipecah dari `agentReportPdf.ts`. */

import { type Tone } from "./agentReportModel";

// ---------------------------------------------------------------------------
// Geometri & tipografi (mm untuk tata letak, pt untuk ukuran font)
// ---------------------------------------------------------------------------

export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;
export const MARGIN_LEFT = 16;
export const MARGIN_RIGHT = 16;
export const MARGIN_TOP = 28;
/** Posisi header halaman; selalu DI ATAS area isi supaya tidak menimpa isi. */
export const HEADER_TOP = 14;
export const HEADER_RULE = 20;
/** Batas bawah area isi; footer digambar di bawah garis ini. */
export const CONTENT_BOTTOM = PAGE_HEIGHT - 20;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

export const FONT = "helvetica";
export const LINE_FACTOR = 1.4;

export type Rgb = [number, number, number];

/** Palet yang sama dengan stylesheet laporan HTML (`agentReportHtml.ts`). */
export const INK: Rgb = [15, 23, 42];
export const INK_BODY: Rgb = [51, 65, 85];
export const INK_MUTE: Rgb = [71, 85, 105];
export const INK_FAINT: Rgb = [100, 116, 139];
export const LINE: Rgb = [226, 232, 240];
export const LINE_STRONG: Rgb = [203, 213, 225];
export const WASH: Rgb = [241, 245, 249];
export const TONE_OK: Rgb = [4, 120, 87];
export const TONE_WARN: Rgb = [180, 83, 9];
export const TONE_BAD: Rgb = [190, 18, 60];

export const mm = (points: number): number => (points * 25.4) / 72;
export const line = (size: number): number => mm(size * LINE_FACTOR);
export const toneColor = (tone: Tone | null): Rgb =>
  tone === "ok"
    ? TONE_OK
    : tone === "warn"
      ? TONE_WARN
      : tone === "bad"
        ? TONE_BAD
        : INK_BODY;
