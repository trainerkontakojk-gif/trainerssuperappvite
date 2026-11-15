// Shared by the sidak-jadwal-shifting-*.spec.ts files.
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { FIXTURE_MONTH, PAGE_TITLE } from "./sidakJadwalShiftingHarness";

export const loopExitBrowserEvents = new WeakMap<
  import("@playwright/test").Page,
  { consoleErrors: string[]; pageErrors: string[] }
>();

/** Halaman memuat judul kanonik + landmark utama, apa pun state-nya. */
export async function expectPageShell(page: import("@playwright/test").Page) {
  await expect(
    page.getByTestId("jadwal-shifting-page"),
    "shell halaman tidak dirender",
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: PAGE_TITLE, level: 1 }),
    "judul halaman tidak sama dengan label yang disepakati",
  ).toBeVisible();
}

// ═══════════════════════════════════════════════════════════════════════════
// Role gate — navigasi dan route
// ═══════════════════════════════════════════════════════════════════════════

export type RectMetrics = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ScrollerMetrics = {
  rect: RectMetrics;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  style: {
    minHeight: string;
    overflowX: string;
    overflowY: string;
    paddingTop: string;
    paddingBottom: string;
    paddingLeft: string;
    paddingRight: string;
    rowGap: string;
  };
};

export type SidebarRailMetrics = {
  visible: boolean;
  railContentHeight: number;
  railBoxHeight: number;
  overflow: number;
  rect: RectMetrics;
};

export type CalendarGeometry = {
  viewport: { width: number; height: number };
  rootFontSize: number;
  windowScrollX: number;
  windowScrollY: number;
  documentElement: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
  };
  body: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
  };
  workspace: ScrollerMetrics;
  shell: ScrollerMetrics;
  controls: ScrollerMetrics;
  slot: ScrollerMetrics;
  matrix: ScrollerMetrics;
  tabBar: { visible: boolean; rect: RectMetrics } | null;
  sidebarRail: SidebarRailMetrics;
};

/** Read-only oracle: all geometry is observed without changing scroll state. */
export async function readCalendarGeometry(
  page: import("@playwright/test").Page,
): Promise<CalendarGeometry> {
  return page.evaluate(() => {
    const rect = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const required = (selector: string, label: string): HTMLElement => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`[loop-exit] missing required ${label}: ${selector}`);
      }
      return element;
    };
    const capture = (element: HTMLElement): ScrollerMetrics => {
      const style = getComputedStyle(element);
      return {
        rect: rect(element),
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        style: {
          minHeight: style.minHeight,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          rowGap: style.rowGap,
        },
      };
    };
    const sidebarRail = required(".app-sidebar", "sidebar");
    const sidebarRailStyle = getComputedStyle(sidebarRail);
    const sidebarRailRect = rect(sidebarRail);
    const sidebarRailVisible =
      sidebarRailStyle.display !== "none" &&
      sidebarRailStyle.visibility !== "hidden" &&
      sidebarRailRect.width > 0 &&
      sidebarRailRect.height > 0;
    const railContentHeight = sidebarRailVisible ? sidebarRail.scrollHeight : 0;
    const railBoxHeight = sidebarRailVisible ? sidebarRail.clientHeight : 0;
    const workspace = required('[aria-label="Konten halaman"]', "workspace");
    const shell = required(
      '[data-testid="jadwal-shifting-calendar-shell"]',
      "calendar shell",
    );
    const controls = required(
      '[data-testid="jadwal-shifting-calendar-controls"]',
      "calendar controls",
    );
    const slot = required(
      '[data-testid="jadwal-shifting-view-calendar"]',
      "calendar slot",
    );
    const matrix = required(
      '[data-testid="jadwal-shifting-calendar"]',
      "calendar matrix",
    );
    // Sidebar dan tab bar sama-sama "Navigasi utama"; tab bar yang `fixed`.
    const tabBar =
      Array.from(
        document.querySelectorAll('[aria-label="Navigasi utama"]'),
      ).find((el) => getComputedStyle(el).position === "fixed") ?? null;
    const tabBarElement = tabBar instanceof HTMLElement ? tabBar : null;
    const tabBarRect = tabBarElement ? rect(tabBarElement) : null;
    const tabBarStyle = tabBarElement ? getComputedStyle(tabBarElement) : null;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rootFontSize: Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      ),
      windowScrollX: window.scrollX,
      windowScrollY: window.scrollY,
      documentElement: {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      body: {
        clientWidth: document.body.clientWidth,
        clientHeight: document.body.clientHeight,
        scrollWidth: document.body.scrollWidth,
        scrollHeight: document.body.scrollHeight,
      },
      workspace: capture(workspace),
      shell: capture(shell),
      controls: capture(controls),
      slot: capture(slot),
      matrix: capture(matrix),
      tabBar:
        tabBarElement && tabBarRect && tabBarStyle
          ? {
              visible:
                tabBarStyle.display !== "none" &&
                tabBarStyle.visibility !== "hidden" &&
                tabBarRect.width > 0 &&
                tabBarRect.height > 0 &&
                tabBarRect.top < window.innerHeight &&
                tabBarRect.bottom > 0,
              rect: tabBarRect,
            }
          : null,
      sidebarRail: {
        visible: sidebarRailVisible,
        railContentHeight,
        railBoxHeight,
        overflow: Math.max(0, railContentHeight - railBoxHeight),
        rect: sidebarRailRect,
      },
    };
  });
}

export async function attachCalendarMetrics(
  testInfo: import("@playwright/test").TestInfo,
  name: string,
  metrics: unknown,
) {
  const outputPath = testInfo.outputPath(name);
  await writeFile(outputPath, `${JSON.stringify(metrics, null, 2)}\n`);
  await testInfo.attach(name, {
    path: outputPath,
    contentType: "application/json",
  });
}

export function expectCalendarLayoutContract(metrics: CalendarGeometry) {
  expect(metrics.windowScrollX).toBe(0);
  expect(metrics.windowScrollY).toBe(0);
  for (const [label, target] of [
    ["workspace", metrics.workspace],
    ["calendar shell", metrics.shell],
  ] as const) {
    expect(
      target.scrollHeight,
      `${label} must not scroll vertically`,
    ).toBeLessThanOrEqual(target.clientHeight + 1);
    expect(
      target.scrollWidth,
      `${label} must not scroll horizontally`,
    ).toBeLessThanOrEqual(target.clientWidth + 1);
    expect(target.scrollTop, `${label} scrollTop must stay zero`).toBe(0);
    expect(target.scrollLeft, `${label} scrollLeft must stay zero`).toBe(0);
  }
  const documentHeightDelta =
    metrics.documentElement.scrollHeight - metrics.viewport.height;
  expect(
    metrics.documentElement.scrollHeight,
    "document height may exceed the viewport only by measured sidebar overflow",
  ).toBeLessThanOrEqual(
    metrics.viewport.height + metrics.sidebarRail.overflow + 1,
  );
  expect(
    Math.abs(documentHeightDelta - metrics.sidebarRail.overflow),
    "document overflow must match sidebar overflow within 2px",
  ).toBeLessThanOrEqual(2);
  expect(
    metrics.documentElement.scrollWidth,
    "document must not scroll horizontally",
  ).toBeLessThanOrEqual(metrics.documentElement.clientWidth + 1);
  expect(
    metrics.body.scrollHeight,
    "body may exceed the viewport only by measured sidebar overflow",
  ).toBeLessThanOrEqual(
    metrics.viewport.height + metrics.sidebarRail.overflow + 1,
  );
  expect(
    metrics.body.scrollWidth,
    "body must not scroll horizontally",
  ).toBeLessThanOrEqual(metrics.body.clientWidth + 1);
  expect(metrics.windowScrollX).toBe(0);
  expect(metrics.windowScrollY).toBe(0);

  expect(metrics.shell.style.paddingTop).toBe("16px");
  expect(metrics.shell.style.paddingBottom).toBe("16px");
  expect(metrics.shell.style.paddingLeft).toBe("16px");
  expect(metrics.shell.style.paddingRight).toBe("16px");
  expect(metrics.shell.style.rowGap).toBe("8px");
  const availableHeight =
    metrics.shell.clientHeight -
    Number.parseFloat(metrics.shell.style.paddingTop) -
    Number.parseFloat(metrics.shell.style.paddingBottom);
  expect(metrics.controls.rect.height).toBeLessThanOrEqual(
    availableHeight / 2 + 1,
  );
  expect(metrics.slot.rect.height).toBeGreaterThanOrEqual(
    availableHeight / 2 - 8 - 1,
  );
  expect(metrics.matrix.clientHeight).toBeGreaterThanOrEqual(64);
  expect(metrics.matrix.style.minHeight).toBe("0px");
  expect(["auto", "scroll"]).toContain(metrics.matrix.style.overflowX);
  expect(["auto", "scroll"]).toContain(metrics.matrix.style.overflowY);

  const { rect: matrix } = metrics.matrix;
  const { rect: workspace } = metrics.workspace;
  expect(matrix.left).toBeGreaterThanOrEqual(workspace.left - 1);
  expect(matrix.right).toBeLessThanOrEqual(workspace.right + 1);
  expect(matrix.top).toBeGreaterThanOrEqual(workspace.top - 1);
  expect(matrix.bottom).toBeLessThanOrEqual(workspace.bottom + 1);
  expect(workspace.bottom - matrix.bottom).toBeGreaterThanOrEqual(15);
  expect(workspace.bottom - matrix.bottom).toBeLessThanOrEqual(17);
  if (metrics.tabBar?.visible) {
    expect(matrix.bottom).toBeLessThanOrEqual(metrics.tabBar.rect.top + 1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Dua format tampilan
//
// 1. "Hari ini" — satu tabel detail dengan pilihan bagian layanan.
// 2. "Kalender" — MATRIKS agen × hari, bukan grid tanggal 7 kolom. Barisnya
//    agent (nama + team leader), kolomnya tanggal-tanggal bulan terpilih, tiap
//    sel berisi kode shift apa adanya (H / S1–S4 / TBCCI / CUTI / OFF), dan
//    kolom kanan menghitung rekap dari kode yang benar-benar terbaca.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pilih bagian layanan lewat dropdown.
 *
 * Filter bagian adalah satu nilai scalar, jadi UI-nya `Select` — membuka
 * trigger lalu memilih itemnya. `trigger` yang di-klik adalah bagian yang
 * SEDANG aktif, dan item pilihannya punya testid `...-option-<slug>`.
 */
export async function selectSection(
  page: import("@playwright/test").Page,
  current: string,
  next: string,
) {
  await page.getByTestId(`jadwal-shifting-section-${current}`).click();
  await page.getByTestId(`jadwal-shifting-section-option-${next}`).click();
  await expect(
    page.getByTestId(`jadwal-shifting-section-${next}`),
    `dropdown bagian tidak berubah ke ${next}`,
  ).toBeVisible();
}

/** Lima pilihan bagian yang disepakati untuk tampilan harian. */
export const TODAY_SECTION_TESTIDS = [
  "all",
  "call",
  "digital-chat",
  "email",
  "leader",
] as const;

/**
 * Fixture matriks: satu agen dengan kombinasi semua kode shift yang benar-benar
 * ada di WFM, plus agen kedua supaya rekap per baris bisa dibandingkan.
 *
 * Tanpa semua kode, legendanya tidak teruji; tanpa agen kedua, rekap bisa
 * "benar" hanya karena kebetulan cocok untuk satu baris.
 */
export const MATRIX_ROWS = [
  {
    nama: "Alya Pranoto",
    tl: "Rina Salim",
    channel: "Call",
    shift: "H",
    date: "2026-09-01",
  },
  {
    nama: "Alya Pranoto",
    tl: "Rina Salim",
    channel: "Call",
    shift: "OFF",
    date: "2026-09-02",
  },
  {
    nama: "Alya Pranoto",
    tl: "Rina Salim",
    channel: "Call",
    shift: "CUTI",
    date: "2026-09-03",
  },
  {
    nama: "Alya Pranoto",
    tl: "Rina Salim",
    channel: "Call",
    shift: "TBCCI",
    date: "2026-09-04",
  },
  {
    nama: "Alya Pranoto",
    tl: "Rina Salim",
    channel: "Call",
    shift: "S2",
    date: "2026-09-07",
  },
  {
    nama: "Bagas Prakoso",
    tl: "Doni Kurnia",
    channel: "Call",
    shift: "H",
    date: "2026-09-01",
  },
  {
    nama: "Bagas Prakoso",
    tl: "Doni Kurnia",
    channel: "Call",
    shift: "S1",
    date: "2026-09-02",
  },
  {
    nama: "Bagas Prakoso",
    tl: "Doni Kurnia",
    channel: "Call",
    shift: "H",
    date: "2026-09-03",
  },
  {
    nama: "Bagas Prakoso",
    tl: "Doni Kurnia",
    channel: "Call",
    shift: "OFF",
    date: "2026-09-04",
  },
  {
    nama: "Bagas Prakoso",
    tl: "Doni Kurnia",
    channel: "Call",
    shift: "H",
    date: "2026-09-07",
  },
  {
    // Tanggal di luar bulan terpilih: harus TIDAK muncul sebagai kolom.
    nama: "Bagas Prakoso",
    tl: "Doni Kurnia",
    channel: "Call",
    shift: "H",
    date: "2026-10-02",
  },
  {
    // Channel lain: harus hilang saat bagian Call dipilih.
    nama: "Citra Wulandari",
    tl: "Doni Kurnia",
    channel: "Email",
    shift: "H",
    date: "2026-09-01",
  },
] as const;

/**
 * Fixture kalender yang benar-benar meluber: 30 agen × 30 hari, sehingga tabel
 * lebih lebar dan lebih tinggi dari layar. Dipakai untuk membuktikan perilaku
 * gulir (horizontal maupun vertikal), bukan untuk menguji isi sel.
 */
export const BIG_MATRIX_ROWS = Array.from({ length: 30 }, (_, agentIndex) =>
  Array.from({ length: 30 }, (_, dayIndex) => ({
    nama: `Agen Uji ${String(agentIndex + 1).padStart(2, "0")}`,
    tl: `TL Uji ${String((agentIndex % 4) + 1)}`,
    channel: "Call",
    shift: dayIndex % 7 === 0 ? "OFF" : "S2",
    date: `${FIXTURE_MONTH}-${String(dayIndex + 1).padStart(2, "0")}`,
  })),
).flat();
