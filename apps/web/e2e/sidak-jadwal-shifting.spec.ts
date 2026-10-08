import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  DAYTIME_AGENT,
  FIXTURE_CHANNELS,
  FIXTURE_DATE,
  FIXTURE_MONTH,
  FORBIDDEN_RESPONSE_KEYS,
  dailyRows,
  NO_ACTIVITY_AGENT,
  OVERNIGHT_AGENT,
  PAGE_TITLE,
  assertLocalDevOnlyTarget,
  capturedJadwalRequests,
  expectIsolation,
  formatAudit,
  normalizedRows,
  openJadwalShifting,
  resetCapturedJadwalRequests,
} from "./helpers/sidakJadwalShiftingHarness";
import { createResponseGate } from "./helpers/responseGate";

/**
 * E2E untuk workspace `/sidak/jadwal-shifting`.
 *
 * Layer yang dibuktikan di sini adalah APA YANG DILIHAT PENGGUNA:
 *   - Role gate di navigasi dan di route (deep link), untuk `admin`/`trainer`
 *     Versus `leader`/`agent` yang TIDAK boleh masuk.
 *   - Keempat state UI: memuat, kosong, gagal, dan data + "terakhir diperbarui".
 *   - Shift yang melintasi tengah malam ditampilkan utuh.
 *   - Browser hanya memanggil API Trainers: tidak ada kontak ke WFM/GAS, tidak
 *     ada `/api` di luar allowlist, dan tidak ada operasi tulis sama sekali.
 *
 * Kontrak backend (role gate di router Hono, allowlist respons, error upstream
 * yang tidak disamarkan sebagai jadwal kosong) dibuktikan di
 * `sidak-jadwal-shifting-api.spec.ts` terhadap router asli + stub upstream.
 *
 * Isolasi: `assertLocalDevOnlyTarget` (preflight) + `installNetworkGuard`
 * fail-closed. Lihat komentar di `helpers/sidakJadwalShiftingHarness.ts`.
 */

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

const loopExitBrowserEvents = new WeakMap<
  import("@playwright/test").Page,
  { consoleErrors: string[]; pageErrors: string[] }
>();

test.beforeEach(({ page }, testInfo) => {
  resetCapturedJadwalRequests();
  if (!testInfo.title.includes("[loop-exit]")) return;
  const events = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  loopExitBrowserEvents.set(page, events);
  page.on("console", (message) => {
    if (message.type() === "error") events.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => events.pageErrors.push(error.message));
});

test.afterEach(async ({ page }, testInfo) => {
  const events = loopExitBrowserEvents.get(page);
  if (!events) return;
  await testInfo.attach("browser-events.json", {
    body: JSON.stringify(
      {
        browserVersion: page.context().browser()?.version() ?? "unknown",
        consoleErrors: events.consoleErrors,
        pageErrors: events.pageErrors,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

/** Halaman memuat judul kanonik + landmark utama, apa pun state-nya. */
async function expectPageShell(page: import("@playwright/test").Page) {
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

type RectMetrics = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type ScrollerMetrics = {
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

type SidebarRailMetrics = {
  visible: boolean;
  railContentHeight: number;
  railBoxHeight: number;
  overflow: number;
  rect: RectMetrics;
};

type CalendarGeometry = {
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
async function readCalendarGeometry(
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
    const sidebarRail = required(".sidebar-rail", "sidebar rail");
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
    const tabBar = document.querySelector('[aria-label="Navigasi utama"]');
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

async function attachCalendarMetrics(
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

function expectCalendarLayoutContract(metrics: CalendarGeometry) {
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
    "document height may exceed the viewport only by measured sidebar-rail overflow",
  ).toBeLessThanOrEqual(
    metrics.viewport.height + metrics.sidebarRail.overflow + 1,
  );
  expect(
    Math.abs(documentHeightDelta - metrics.sidebarRail.overflow),
    "document overflow must match sidebar-rail overflow within 2px",
  ).toBeLessThanOrEqual(2);
  expect(
    metrics.documentElement.scrollWidth,
    "document must not scroll horizontally",
  ).toBeLessThanOrEqual(metrics.documentElement.clientWidth + 1);
  expect(
    metrics.body.scrollHeight,
    "body may exceed the viewport only by measured sidebar-rail overflow",
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

test.describe("Role gate", () => {
  for (const role of ["admin", "trainer"] as const) {
    test(`role ${role} boleh membuka halaman lewat deep link`, async ({
      page,
    }) => {
      const audit = await openJadwalShifting(page, { role });

      await expectPageShell(page);
      //Bukan redirect ke /unauthorized: halaman benar-benar dirender.
      await expect(page).toHaveURL(/\/sidak\/jadwal-shifting/);
      expectIsolation(audit);
    });
  }

  for (const role of ["leader", "agent"] as const) {
    test(`role ${role} ditolak dan tidak sampai memanggil API jadwal`, async ({
      page,
    }) => {
      const audit = await openJadwalShifting(page, { role });

      await expect(page).toHaveURL(/\/unauthorized/, { timeout: 10_000 });
      expect(
        capturedJadwalRequests(),
        `role ${role} seharusnya tidak pernah memanggil endpoint jadwal`,
      ).toEqual([]);
      // `requireApiCall: false` — justru tidak boleh ada panggilan sama sekali.
      expectIsolation(audit, { requireApiCall: false });
    });
  }

  test("menu jadwal hanya tampil untuk role yang diizinkan", async ({
    page,
  }) => {
    // Nav mobile: sub-menu SIDAK dirender datar saat drawer dibuka, jadi
    // visibilitas link bisa dibuktikan tanpa hover flyout desktop.
    // Tombol pembuka drawer di sidebar mobile adalah satu-satunya di viewport
    // sempit, jadi tidak perlu bergantung pada urutan DOM.
    // `openJadwalShifting` kembali begitu `page.goto` selesai, sedangkan
    // request jadwal baru berangkat dari efek React. `page.goto("/sidak")`
    // di bawah sering membatalkan request itu sebelum sempat tercatat, jadi
    // `expectIsolation` gagal karena NAVIGASI MEMBUNUH request — bukan karena
    // role gate-nya salah. Untuk role yang BOLEH masuk, panggilan jadwal
    // ditunggu eksplisit dulu supaya assertion-nya mengukur kontrak yang
    // dimaksud. Role yang ditolak tidak menunggu apa pun: justru tidak boleh
    // ada panggilan sama sekali.
    const openDrawer = async (role: string, expectApiCall = false) => {
      const audit = await openJadwalShifting(page, { role });
      if (expectApiCall) {
        await expect
          .poll(() => audit.mockedApi.length, {
            message: `role ${role} tidak memanggil endpoint jadwal`,
          })
          .toBeGreaterThan(0);
      }
      await page.goto("/sidak");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Buka menu navigasi" }).click();
      return audit;
    };

    const allowedAudit = await openDrawer("admin", true);
    await expect(
      page.getByRole("link", { name: PAGE_TITLE }).first(),
      "admin harus melihat link jadwal di menu",
    ).toBeVisible();

    // `capturedJadwalRequests()` bersifat global per test, dan `openDrawer("admin")`
    // di atas sudah — dan memang harus — mencatat panggilan jadwal yang sah. Jadi
    // yang dibuktikan di sini BUKAN "array kosong", melainkan "membuka halaman
    // sebagai agent tidak menambah panggilan baru". Menguhr array jadi kosong
    // akan salah gagal justru pada perilaku yang benar.
    const callsBeforeDenied = capturedJadwalRequests().length;

    const deniedAudit = await openDrawer("agent");
    await expect(
      page.getByRole("link", { name: PAGE_TITLE }),
      "role agent tidak boleh melihat link jadwal",
    ).toHaveCount(0);

    expectIsolation(allowedAudit);
    // Untuk role yang ditolak, TIDAK ADA panggilan API sama sekali — redirect
    // terjadi sebelum halaman jadwal pernah dirender.
    expectIsolation(deniedAudit, { requireApiCall: false });
    expect(
      capturedJadwalRequests().length,
      `role agent memicu panggilan endpoint jadwal:\n${formatAudit(deniedAudit)}`,
    ).toBe(callsBeforeDenied);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// State data
// ═══════════════════════════════════════════════════════════════════════════

test.describe("State data", () => {
  test("menampilkan baris jadwal dengan field yang disetujui", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });

    await expectPageShell(page);
    const rows = page.getByTestId("jadwal-shifting-row");
    await expect(rows, "baris jadwal tidak dirender").toHaveCount(3);

    // Dicari per nama, bukan per indeks: urutan tabel ditentukan
    // pengelompokan TL, bukan urutan baris dari sumber.
    for (const agent of [OVERNIGHT_AGENT, DAYTIME_AGENT, NO_ACTIVITY_AGENT]) {
      await expect(rows.filter({ hasText: agent.nama })).toHaveCount(1);
    }
    await expect(rows.filter({ hasText: OVERNIGHT_AGENT.nama })).toContainText(
      OVERNIGHT_AGENT.tl,
    );

    // Channel yang benar-benar ada di fixture harus terhitung, bukan di-hardcode.
    for (const channel of FIXTURE_CHANNELS) {
      await expect(page.getByTestId("jadwal-shifting-page")).toContainText(
        channel,
      );
    }

    expectIsolation(audit);
  });

  test("respons tidak pernah membocorkan field di luar allowlist", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(3);

    // Yang benar-benar diuji: DOM tidak boleh memuat nilai yang DITOLAK. Marker
    // diambil dari nama key terlarang, sehingga kebocoran apa pun terdeteksi.
    const body = (
      await page.getByTestId("jadwal-shifting-page").innerText()
    ).toLowerCase();
    for (const forbidden of FORBIDDEN_RESPONSE_KEYS) {
      expect(
        body,
        `halaman membocorkan key terlarang: ${forbidden}`,
      ).not.toContain(forbidden.toLowerCase());
    }
    expect(
      body,
      "halaman tidak boleh menampilkan detail kredensial/integrasi",
    ).not.toContain("sb_publishable");

    expectIsolation(audit);
  });

  test("shift lintas tengah malam ditampilkan utuh dan ditandai", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });

    const overnight = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: OVERNIGHT_AGENT.nama });
    // Label shift harus tampil apa adanya — UI tidak boleh menghitung ulang jam.
    await expect(overnight).toContainText(OVERNIGHT_AGENT.shift);
    await expect(
      overnight,
      "shift yang melintasi tengah malam harus ditandai eksplisit",
    ).toHaveAttribute("data-spans-midnight", "true");

    // Baris siang tidak boleh ikut ditandai.
    const daytime = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: DAYTIME_AGENT.nama });
    await expect(daytime).toHaveAttribute("data-spans-midnight", "false");

    expectIsolation(audit);
  });

  test("kegagalan upstream tampil sebagai state gagal, bukan jadwal kosong", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: {
        kind: "error",
        status: 502,
        code: "WFM_UNAVAILABLE",
        message: "Sumber jadwal WFM sedang tidak dapat dihubungi.",
      },
    });

    await expect(page.getByTestId("jadwal-shifting-state-error")).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-state-empty"),
      "error tidak boleh disamarkan sebagai jadwal kosong",
    ).toHaveCount(0);
    // Tidak ada baris data yang dikarang untuk menutupi kegagalan.
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(0);
    // Kegagalan harus diumumkan, bukan hanya dicetak diam-diam.
    await expect(
      page.getByRole("alert"),
      "state gagal harus diumumkan lewat live region",
    ).toBeVisible();
    // Aksi pemulihan harus ada karena ini kondisi yang bisa dicoba ulang.
    await expect(
      page.getByRole("button", { name: /coba lagi/i }),
    ).toBeVisible();

    expectIsolation(audit);
  });

  test("jadwal kosong yang sah tampil sebagai state kosong", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "empty" },
    });

    await expect(page.getByTestId("jadwal-shifting-state-empty")).toBeVisible();
    await expect(page.getByTestId("jadwal-shifting-state-error")).toHaveCount(
      0,
    );

    expectIsolation(audit);
  });

  test("kegagalan jaringan tidak menghasilkan jadwal palsu", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "network-error" },
    });

    await expect(page.getByTestId("jadwal-shifting-state-error")).toBeVisible();
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(0);

    expectIsolation(audit);
  });

  test("menampilkan waktu data terakhir diperbarui", async ({ page }) => {
    const asOf = "2026-09-28T03:00:00.000Z";
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", asOf },
    });

    const stamp = page.getByTestId("jadwal-shifting-asof");
    await expect(stamp, "tanda 'terakhir diperbarui' tidak ada").toBeVisible();
    await expect(stamp).toHaveAttribute("data-as-of", asOf);

    expectIsolation(audit);
  });

  test("hasil terpotong oleh batas backend dinyatakan terbuka", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", truncated: true },
    });

    await expect(
      page.getByTestId("jadwal-shifting-truncated"),
      "batas hasil tidak diumumkan ke pengguna",
    ).toBeVisible();

    expectIsolation(audit);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Filter tanggal
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Filter tanggal", () => {
  test("tanggal yang dipilih dikirim, dan layar mengikuti tanggal yang benar-benar di-query", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(3);

    // Kontrak intinya: filter di layar menampilkan TANGGAL YANG DIQUERY
    // backend (`data.date`), bukan "hari ini" yang dihitung UI sendiri. Kalau
    // kedua-duanya berbeda, pengguna akan membaca jadwal untuk hari yang salah.
    const input = page.getByTestId("jadwal-shifting-date-input");
    await expect(input).toHaveValue(FIXTURE_DATE);

    // Muat pertama tidak boleh meminta rentang atau "semua tanggal": kalau ada
    // `date`, isinya satu tanggal yang valid saja.
    const first = capturedJadwalRequests().at(0);
    expect(
      first,
      "halaman harus memanggil endpoint jadwal tepat satu kali saat muat",
    ).toBeDefined();
    if (first?.date) {
      expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const request of capturedJadwalRequests()) {
      expect(
        [...request.search.keys()].filter((k) => k === "date").length,
        "hanya boleh ada satu parameter date",
      ).toBeLessThanOrEqual(1);
    }

    // Pilih tanggal lain → request berikutnya harus memakai tanggal itu.
    const requested = "2026-09-29";
    await input.fill(requested);
    await input.press("Enter");
    await expect
      .poll(() => capturedJadwalRequests().at(-1)?.date, {
        timeout: 10_000,
        message: "tanggal yang dipilih tidak terkirim ke API",
      })
      .toBe(requested);

    expect(
      capturedJadwalRequests().every((r) => r.method === "GET"),
      `MVP read-only, semua request harus GET:\n${formatAudit(audit)}`,
    ).toBe(true);
    expectIsolation(audit);
  });

  test("menampilkan ulang tanggal yang sama tanpa menggantung di status memuat", async ({
    page,
  }) => {
    // Dibuka dengan `date` di URL supaya `urlDate` dan tanggal di filter sama
    // persis, dan test ini sengaja memakai tanggal yang SUDAH terpilih.
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      date: FIXTURE_DATE,
    });
    const rows = page.getByTestId("jadwal-shifting-row");
    await expect(rows, "baris jadwal tidak dirender").toHaveCount(3);

    // Kontrak yang diuji: menekan "Tampilkan" untuk tanggal yang sudah
    // terpilih berarti "muat ulang tanggal ini". Search state router tidak
    // berubah, jadi kalau halaman hanya mengandalkan navigasi, efek pemuatan
    // tidak pernah berjalan lagi — sementara state sudah di-set ke `loading`
    // saat submit, dan layar menggantung permanen di status memuat.
    const input = page.getByTestId("jadwal-shifting-date-input");
    await expect(
      input,
      "filter harus menampilkan tanggal yang di-query",
    ).toHaveValue(FIXTURE_DATE);

    // Baseline relatif, bukan angka absolut: `main.tsx` memakai StrictMode,
    // jadi efek mount boleh dieksekusi lebih dari sekali saat development.
    const before = capturedJadwalRequests().length;

    await page.getByRole("button", { name: "Tampilkan" }).click();

    // Permintaan baru untuk tanggal yang sama harus benar-benar terkirim.
    await expect
      .poll(() => capturedJadwalRequests().length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(before);

    const reload = capturedJadwalRequests().at(before);
    expect(reload?.method, "muat ulang harus tetap read-only (GET)").toBe(
      "GET",
    );
    expect(
      reload?.date,
      "muat ulang harus memakai tanggal yang sama, bukan tanggal kosong atau lain",
    ).toBe(FIXTURE_DATE);

    // Status memuat harus selesai: data kembali dan skeleton hilang.
    await expect(
      rows,
      "baris jadwal tidak kembali setelah muat ulang tanggal yang sama",
    ).toHaveCount(3);
    await expect(
      page.getByTestId("jadwal-shifting-state-loading"),
      "status memuat menggantung setelah muat ulang tanggal yang sama",
    ).toHaveCount(0);

    expect(
      capturedJadwalRequests().every((r) => r.method === "GET"),
      `MVP read-only, semua request harus GET:\n${formatAudit(audit)}`,
    ).toBe(true);
    expectIsolation(audit);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Aksesibilitas & responsif
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Aksesibilitas dan responsif", () => {
  test("tabel jadwal punya header yang terprogram dan dapat dibaca screen reader", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(3);

    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // Header harus berupa kolom nyata dengan `scope`, bukan <div> yang cuma
    // kelihatan seperti tabel.
    const headers = table.getByRole("columnheader");
    await expect(headers.first()).toBeVisible();
    expect(
      await headers.evaluateAll((cells) =>
        cells.every((cell) => cell.getAttribute("scope") === "col"),
      ),
      "semua header kolom harus punya scope=col",
    ).toBe(true);
    const headerTexts = (await headers.allInnerTexts()).join("|").toLowerCase();
    for (const expected of [
      "nama",
      "team leader",
      "channel",
      "shift",
      "jam kerja & istirahat",
    ]) {
      expect(headerTexts, `header kolom "${expected}" tidak ada`).toContain(
        expected,
      );
    }

    // Tabel punya caption yang bisa dibaca assistive tech.
    await expect(table.locator("caption")).toHaveCount(1);

    // Satu dan hanya satu <h1>.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    // Kontainer tabel yang bisa di-scroll keyboard perlu bisa difokus.
    const scrollRegion = page.getByRole("region", { name: /tabel jadwal/i });
    await expect(scrollRegion).toHaveAttribute("tabindex", "0");

    expectIsolation(audit);
  });

  test("wilayah tabel yang bernama itu sendiri yang bisa digulir keyboard", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(3);

    // 320px dipakai karena lebar tabel di titik ini benar-benar melebihi lebar
    // region. Di viewport lebih lebar tidak ada apa pun yang bisa digulir, jadi
    // test akan hijau tanpa membuktikan kontrak apa pun.
    await page.setViewportSize({ width: 320, height: 740 });
    await expectPageShell(page);

    const region = page.getByRole("region", { name: /tabel jadwal/i });

    // Kontrak intinya: yang bothered DAN bernama itu SENDIRI yang jadi scroller
    // horizontal. Kalau elemen di dalamnya yang menggulir, `tabindex` + panah
    // keyboard tidak pernah menjangkau kolom di luar layar — region tetap
    // `scrollLeft = 0` padahal tabelnya meluber.
    const geometry = await region.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
    }));
    expect(
      geometry.scrollWidth,
      `region tabel tidak meluber horizontal: ${JSON.stringify(geometry)}`,
    ).toBeGreaterThan(geometry.clientWidth);
    expect(
      geometry.scrollLeft,
      "region tabel tidak boleh mulai dalam keadaan sudah tergulir",
    ).toBe(0);

    await region.focus();
    expect(
      await region.evaluate((el) => el === document.activeElement),
      "region tabel tidak menerima fokus keyboard",
    ).toBe(true);

    await page.keyboard.press("ArrowRight");

    await expect
      .poll(() => region.evaluate((el) => el.scrollLeft), {
        message: "ArrowRight tidak menggulir region tabel",
      })
      .toBeGreaterThan(0);

    // Melempar overflow ke region tidak boleh justru meluber ke dokumen.
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      pageOverflow.scrollWidth,
      `halaman meluber horizontal: ${JSON.stringify(pageOverflow)}`,
    ).toBeLessThanOrEqual(pageOverflow.clientWidth + 1);

    expectIsolation(audit);
  });

  test("tidak meluber horizontal di layar sempit", async ({ page }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(3);

    await page.setViewportSize({ width: 360, height: 780 });
    await expectPageShell(page);

    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    // Toleransi 1px untuk pembulatan pecahan piksel pada layout fluid.
    expect(
      overflow.scrollWidth,
      `halaman meluber horizontal: ${JSON.stringify(overflow)}`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    expectIsolation(audit);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bukti isolasi
// ═══════════════════════════════════════════════════════════════════════════

test("guard memblokir host WFM/GAS dan tetap membiarkan alur halaman berjalan", async ({
  page,
}) => {
  const audit = await openJadwalShifting(page, { role: "trainer" });
  await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(3);

  // Host yang SENGAJA dicoba: boleh tercatat sebagai `blockedExternal` (itu
  // justru buktinya guard bekerja), tapi tidak boleh sampai ke jaringan nyata.
  const targets = [
    "https://script.google.com/macros/s/DEADBEEF/exec",
    "https://wfm-dash-pro.example.com/rest/v1/wfm_schedules",
  ];

  const attempts = await page.evaluate(async (urls) => {
    const results: Array<{ target: string; outcome: string }> = [];
    for (const target of urls) {
      try {
        await fetch(target, { mode: "cors" });
        results.push({ target, outcome: "tidak diblokir" });
      } catch (error) {
        results.push({
          target,
          outcome: `diblokir: ${(error as Error).name || "Error"}`,
        });
      }
    }
    return results;
  }, targets);

  for (const attempt of attempts) {
    expect(
      attempt.outcome,
      `egress ke ${attempt.target} tidak diblokir`,
    ).toMatch(/diblokir/);
  }
  for (const target of targets) {
    expect(
      audit.blockedExternal.join("\n"),
      `guard tidak mencatat ${target} sebagai host terlarang`,
    ).toContain(target);
  }

  expectIsolation(audit, { allowBlockedExternal: targets });
});

test("fixture jadwal sintetis tidak pernah menyentuh nama/api key WFM nyata", async ({
  page,
}) => {
  // Guard terakhir: apa pun yang tampil harus berasal dari fixture lokal.
  const audit = await openJadwalShifting(page, { role: "trainer" });
  await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(3);

  const text = await page.getByTestId("jadwal-shifting-page").innerText();
  for (const needle of ["script.google", "wfm_schedules", "sb_publishable"]) {
    expect(text, `UI menampilkan detail integrasi: ${needle}`).not.toContain(
      needle,
    );
  }
  // Baris harus persis baris fixture, tidak lebih.
  await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(
    normalizedRows().length,
  );

  expectIsolation(audit);
});

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
async function selectSection(
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
const TODAY_SECTION_TESTIDS = [
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
const MATRIX_ROWS = [
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

test.describe("Format hari ini", () => {
  test("aktivitas kosong memakai jam mulai dan pulang sesuai kode shift", async ({
    page,
  }) => {
    const schedule = [
      ["H", "07:45", "16:50"],
      ["S1", "06:00", "15:00"],
      ["S2", "08:00", "17:00"],
      ["S3", "13:00", "22:00"],
      ["S4", "22:00", "07:00"],
    ] as const;
    const rows = schedule.map(([shift, start, end], index) => ({
      nama: `Fallback Agent ${index + 1}`,
      tl: "Team Lead",
      channel: "Call",
      shift,
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
      expectedStart: start,
      expectedEnd: end,
    }));

    // Nilai jam ekspektasi adalah metadata fixture lokal, bukan payload API.
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: {
        kind: "data",
        rows: rows.map(
          ({ expectedStart: _start, expectedEnd: _end, ...row }) => row,
        ),
      },
    });
    await expectPageShell(page);

    for (const row of rows) {
      const activityCell = page
        .getByTestId("jadwal-shifting-row")
        .filter({ hasText: row.nama })
        .locator("td")
        .nth(5);
      await expect(activityCell).toContainText(`Mulai${row.expectedStart}`);
      await expect(activityCell).toContainText("Istirahat");
      await expect(activityCell).toContainText("Pulang");
      await expect(activityCell).toContainText(row.expectedEnd);
      await expect(activityCell.locator("dd").nth(1)).toHaveText("—");
    }
    expectIsolation(audit);
  });

  test("slot LB berurutan diringkas menjadi interval istirahat 15 menit", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: {
        kind: "data",
        rows: [
          {
            nama: "Agent Break Fixture",
            tl: "Team Lead",
            channel: "Call",
            shift: "H",
            shiftPrev: "",
            date: FIXTURE_DATE,
            activities: [17, 18, 19, 20].map((slot) => ({
              slot,
              label: "04:15",
              value: "LB",
            })),
          },
        ],
      },
    });
    await expectPageShell(page);

    const activityCell = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: "Agent Break Fixture" })
      .locator("td")
      .nth(5);
    await expect(activityCell).toContainText("Mulai");
    await expect(activityCell).toContainText("07:45");
    await expect(activityCell).toContainText("Istirahat");
    await expect(activityCell).toContainText("04:15–05:15");
    await expect(activityCell).toContainText("Pulang");
    await expect(activityCell).toContainText("16:50");
    await expect(activityCell).not.toContainText("LB");
    expectIsolation(audit);
  });

  test("Hari ini memakai tabel sebagai satu-satunya daftar", async ({
    page,
  }, testInfo) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: dailyRows() },
    });
    await expectPageShell(page);

    const table = page.getByTestId("jadwal-shifting-table");
    await expect(table).toBeVisible();
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(4);

    const todayView = page.getByTestId("jadwal-shifting-view-today");
    await expect(todayView, "format Hari ini tidak dirender").toBeVisible();
    await expect(
      todayView.locator("h2, h3, h4"),
      "panel dan subjudul pengelompokan tidak boleh tampil di luar tabel",
    ).toHaveCount(0);
    // Memeriksa heading saja tidak cukup: daftar/panel lama bisa kembali tanpa
    // heading. Jadi dua hal diperiksa terpisah — sisa testid panel lama, dan
    // daftar non-tabel (`ul`/`ol`) di dalam format Hari ini.
    await expect(
      page.locator(
        '[data-testid^="jadwal-shifting-masuk"], [data-testid^="jadwal-shifting-libur"]',
      ),
      "sisa panel Masuk/Libur tidak boleh dirender lagi",
    ).toHaveCount(0);
    await expect(
      todayView.locator("ul, ol"),
      "format Hari ini hanya boleh berisi tabel, bukan daftar",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("jadwal-shifting-row").filter({
        hasText: "Guntur Saputra",
      }),
      "baris Off tetap menjadi bagian dari tabel detail",
    ).toHaveCount(1);

    // Jika WFM tidak mengirim aktivitas, tampilkan jam shift terverifikasi;
    // jam istirahat tetap kosong karena sumber/mapping belum memberikannya.
    const fallbackRow = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: NO_ACTIVITY_AGENT.nama });
    await expect(fallbackRow).toContainText("Mulai");
    await expect(fallbackRow).toContainText("07:45");
    await expect(fallbackRow).toContainText("Istirahat");
    await expect(fallbackRow).toContainText("Pulang");
    await expect(fallbackRow).toContainText("16:50");

    // Filter bagian layanan tetap tersedia dengan lima pilihan yang sama.
    await page.getByTestId("jadwal-shifting-section-all").click();
    for (const section of TODAY_SECTION_TESTIDS) {
      await expect(
        page.getByTestId(`jadwal-shifting-section-option-${section}`),
        `pilihan bagian ${section} tidak ada di dropdown`,
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
    const screenshotPath = testInfo.outputPath("hari-ini-tabel-saja.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("hari-ini-tabel-saja", {
      path: screenshotPath,
      contentType: "image/png",
    });

    expectIsolation(audit);
  });

  test("urutan tabel mengikuti layanan, shift, TL, lalu nama dari baris acak", async ({
    page,
  }) => {
    // Input sengaja berlawanan dengan urutan yang diharapkan: bagian tak dikenal
    // muncul lebih awal, Email mendahului Call, dan semua tingkat memiliki ties
    // yang cukup agar pengurutan yang dihilangkan atau dibalik terdeteksi.
    // Layanan adalah kunci paling luar: SEMUA baris Call tampil berurutan
    // (S1 → H → S2 → S3 → S4 → Off), baru Digital Chat, Email, dan Leader.
    const rows = [
      {
        nama: "Zeta Service H",
        tl: "Rina Salim",
        channel: "Zeta Support",
        shift: "H",
      },
      { nama: "Email H", tl: "Doni Kurnia", channel: "Email", shift: "H" },
      { nama: "Shift S4", tl: "Doni Kurnia", channel: "Call", shift: "S4" },
      {
        nama: "Call Zainal H",
        tl: "Zainal Abidin",
        channel: "call",
        shift: "H",
      },
      { nama: "Off no TL", tl: "", channel: "Call", shift: "OFF" },
      { nama: "Shift S2", tl: "Doni Kurnia", channel: "Leader", shift: "S2" },
      { nama: "Call Zulu H", tl: "Rina Salim", channel: "Call", shift: "H" },
      { nama: "Blank Section H", tl: "Doni Kurnia", channel: "", shift: "H" },
      { nama: "Shift S1", tl: "Doni Kurnia", channel: "Email", shift: "S1" },
      { nama: "Call No TL H", tl: "", channel: "Call", shift: "H" },
      { nama: "Shift S3", tl: "Doni Kurnia", channel: "Email", shift: "S3" },
      { nama: "Call Leave", tl: "Rina Salim", channel: "Call", shift: "LIBUR" },
      {
        nama: "Digital H",
        tl: "Doni Kurnia",
        channel: "Digital Chat",
        shift: "H",
      },
      { nama: "Off Call", tl: "Rina Salim", channel: "Call", shift: "OFF" },
      { nama: "Leader H", tl: "Doni Kurnia", channel: "Leader", shift: "H" },
      {
        nama: "Alpha Service H",
        tl: "Rina Salim",
        channel: "Alpha Support",
        shift: "H",
      },
      {
        nama: "Digital LBR",
        tl: "Doni Kurnia",
        channel: "Digital Chat",
        shift: "LBR",
      },
      {
        nama: "Email CUTI",
        tl: "Doni Kurnia",
        channel: "Email",
        shift: "CUTI",
      },
      {
        nama: "Leader blank shift",
        tl: "Doni Kurnia",
        channel: "Leader",
        shift: "",
      },
      {
        nama: "TBCCI Label",
        tl: "Rina Salim",
        channel: "Call",
        shift: "TBCCI",
      },
      {
        nama: "Time Label",
        tl: "Rina Salim",
        channel: "Email",
        shift: "23:00 - 07:00",
      },
      { nama: "Call Arif H", tl: "Rina Salim", channel: "Call", shift: "H" },
    ].map((row) => ({
      ...row,
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
    }));

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    const detailRows = page.getByTestId("jadwal-shifting-row");
    await expect(detailRows).toHaveCount(rows.length);
    const actualOrder = await detailRows.evaluateAll((tableRows) =>
      tableRows.map(
        (row) => row.querySelector("td")?.textContent?.trim() ?? "",
      ),
    );
    expect(actualOrder).toEqual([
      // Call: shift lebih dulu di dalam layanan, baru bucket Off dan kode asing.
      "Call Arif H",
      "Call Zulu H",
      "Call Zainal H",
      "Call No TL H",
      "Shift S4",
      "Call Leave",
      "Off Call",
      "Off no TL",
      "TBCCI Label",
      // Digital Chat
      "Digital H",
      "Digital LBR",
      // Email
      "Shift S1",
      "Email H",
      "Shift S3",
      "Email CUTI",
      "Time Label",
      // Leader: H sebelum S2, dan shift kosong masuk bucket Off di belakang.
      "Leader H",
      "Shift S2",
      "Leader blank shift",
      // Bagian di luar daftar tetap tampil, di belakang dan A–Z.
      "Alpha Service H",
      "Zeta Service H",
      "Blank Section H",
    ]);

    expectIsolation(audit);
  });

  test("filter bagian menyaring tabel secara case-insensitive tanpa request baru", async ({
    page,
  }) => {
    const rows = [
      {
        nama: "Email Fixture",
        tl: "Doni Kurnia",
        channel: "Email",
        shift: "H",
      },
      {
        nama: "Leader Off Fixture",
        tl: "Doni Kurnia",
        channel: "Leader",
        shift: "OFF",
      },
      {
        nama: "Call Upper Fixture",
        tl: "Rina Salim",
        channel: "Call",
        shift: "H",
      },
      {
        nama: "Call Lower Fixture",
        tl: "Rina Salim",
        channel: "call",
        shift: "H",
      },
    ].map((row) => ({
      ...row,
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
    }));
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    const tableRows = page.getByTestId("jadwal-shifting-row");
    await expect(tableRows).toHaveCount(4);
    const initialRequests = capturedJadwalRequests().length;

    await selectSection(page, "all", "call");
    await expect(tableRows).toHaveCount(2);
    await expect(
      tableRows.filter({ hasText: "Call Upper Fixture" }),
    ).toHaveCount(1);
    await expect(
      tableRows.filter({ hasText: "Call Lower Fixture" }),
    ).toHaveCount(1);

    await selectSection(page, "call", "email");
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first()).toContainText("Email Fixture");

    await selectSection(page, "email", "leader");
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first()).toContainText("Leader Off Fixture");

    await selectSection(page, "leader", "all");
    await expect(tableRows).toHaveCount(4);
    expect(capturedJadwalRequests()).toHaveLength(initialRequests);
    expect(
      capturedJadwalRequests().every((request) => request.method === "GET"),
      "filter bagian harus murni di klien dan tetap read-only",
    ).toBe(true);
    expectIsolation(audit);
  });

  /**
   * Urutan lengkapnya: layanan → shift → JAM ISTIRAHAT → TL → nama. Fixture ini
   * sengaja membuat istirahat dan TL saling bertentangan (istirahat paling pagi
   * punya TL yang paling akhir menurut abjad), supaya terbukti istirahat benar
   * diurutkan sebelum TL, bukan sekadar kebetulan sama.
   */
  test("di dalam satu layanan: shift, lalu istirahat — yang break duluan lebih dulu", async ({
    page,
  }) => {
    const breakSlot = (slot: number) => ({ slot, label: "", value: "LB" });
    const rows = [
      { nama: "Break Siang", tl: "Rina Salim", activities: [breakSlot(48)] },
      { nama: "Tanpa Break", tl: "Rina Salim", activities: [] },
      { nama: "Break Pagi", tl: "Rina Salim", activities: [breakSlot(40)] },
      { nama: "Break Sore", tl: "Zainal Abidin", activities: [breakSlot(36)] },
    ].map((row) => ({
      ...row,
      channel: "Call",
      shift: "S2",
      shiftPrev: "",
      date: FIXTURE_DATE,
    }));

    await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    const tableRows = page.getByTestId("jadwal-shifting-row");
    await expect(tableRows).toHaveCount(4);
    const order = await tableRows.evaluateAll((rows) =>
      rows.map((row) => row.querySelector("td")?.textContent?.trim() ?? ""),
    );
    expect(
      order,
      "istirahat 09:00 → 10:00 → 12:00 → tanpa istirahat, dan urutan istirahat lebih dulu daripada TL",
    ).toEqual(["Break Sore", "Break Pagi", "Break Siang", "Tanpa Break"]);
  });

  test("[loop-exit] urutan layanan, shift, LB, TL, nama dan interval memakai satu fixture bertentangan", async ({
    page,
  }) => {
    const activity = (slot: number, value: string) => ({
      slot,
      label: "",
      value,
    });
    const contractRows = [
      {
        nama: "Unknown Z Service",
        tl: "",
        channel: "Zeta Support",
        shift: "OFF",
        activities: [],
      },
      {
        nama: "Call Foreign WFH",
        tl: "Rina",
        channel: "Call",
        shift: "WFH",
        activities: [],
      },
      {
        nama: "Leader H",
        tl: "Rina",
        channel: "Leader",
        shift: "H",
        activities: [],
      },
      {
        nama: "Off OFF",
        tl: "Team Off",
        channel: "Call",
        shift: "OFF",
        activities: [],
      },
      {
        nama: "Call Break 12 TL A",
        tl: "Ahmad",
        channel: "Call",
        shift: "H",
        activities: [activity(48, "LB")],
      },
      {
        nama: "Email H",
        tl: "Rina",
        channel: "Email",
        shift: "H",
        activities: [],
      },
      {
        nama: "Call Break Tie Z",
        tl: "Team Tie",
        channel: "call",
        shift: "H",
        activities: [activity(40, "LB")],
      },
      {
        nama: "Off LBR",
        tl: "Team Off",
        channel: "Call",
        shift: "LBR",
        activities: [],
      },
      {
        nama: "Digital S1",
        tl: "Rina",
        channel: "Digital Chat",
        shift: "S1",
        activities: [],
      },
      {
        nama: "Call No Break A",
        tl: "Ahmad",
        channel: "Call",
        shift: "H",
        activities: [],
      },
      {
        nama: "Off LIBUR",
        tl: "Team Off",
        channel: "Call",
        shift: "LIBUR",
        activities: [],
      },
      {
        nama: "Call S4",
        tl: "Rina",
        channel: "Call",
        shift: "S4",
        activities: [],
      },
      {
        nama: "Call Break 00",
        tl: "Zulu",
        channel: "Call",
        shift: "H",
        activities: [activity(1, "LB"), activity(0, "lb")],
      },
      {
        nama: "Call S2",
        tl: "Rina",
        channel: "Call",
        shift: "S2",
        activities: [],
      },
      {
        nama: "Call Foreign AUX",
        tl: "Rina",
        channel: "Call",
        shift: "AUX",
        activities: [],
      },
      {
        nama: "Off CUTI",
        tl: "Team Off",
        channel: "Call",
        shift: "CUTI",
        activities: [],
      },
      {
        nama: "Call Break Tie A",
        tl: "Team Tie",
        channel: "Call",
        shift: "H",
        activities: [activity(40, "LB")],
      },
      {
        nama: "Call Break 10 TL Z",
        tl: "Zulu",
        channel: "Call",
        shift: "H",
        activities: [activity(48, "LB"), activity(40, "LB")],
      },
      {
        nama: "Call S3",
        tl: "Rina",
        channel: "Call",
        shift: "S3",
        activities: [],
      },
      {
        nama: "Off Blank",
        tl: "Team Off",
        channel: "Call",
        shift: "",
        activities: [],
      },
      {
        nama: "Call Invalid LB",
        tl: "Zulu",
        channel: "Call",
        shift: "H",
        activities: [
          activity(-1, "LB"),
          activity(96, "LB"),
          activity(106, "LB"),
          activity(12.5, "LB"),
          activity(12, "Lunch"),
        ],
      },
      {
        nama: "Call S1 Slot Edge",
        tl: "Rina",
        channel: "Call",
        shift: "S1",
        activities: [
          activity(95, "LB"),
          activity(1, "LB"),
          activity(0, "lb"),
          activity(1, "LB"),
          activity(-1, "LB"),
          activity(96, "LB"),
          activity(106, "LB"),
          activity(12.5, "LB"),
          activity(2, "Lunch"),
        ],
      },
      {
        nama: "Call Foreign Z",
        tl: "Rina",
        channel: "Call",
        shift: "Z-X",
        activities: [],
      },
      {
        nama: "Call S1",
        tl: "Rina",
        channel: "Call",
        shift: "S1",
        activities: [],
      },
      {
        nama: "Alpha Service",
        tl: "Rina",
        channel: "Alpha Support",
        shift: "H",
        activities: [],
      },
      {
        nama: "Empty Service",
        tl: "Rina",
        channel: "",
        shift: "S1",
        activities: [],
      },
      {
        nama: "Call Foreign TBCCI",
        tl: "Rina",
        channel: "Call",
        shift: "TBCCI",
        activities: [],
      },
    ].map((row) => ({ ...row, shiftPrev: "", date: FIXTURE_DATE }));

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: contractRows },
    });
    await expectPageShell(page);

    const rows = page.getByTestId("jadwal-shifting-row");
    const actualOrder = await rows.evaluateAll((tableRows) =>
      tableRows.map(
        (row) => row.querySelector("td")?.textContent?.trim() ?? "",
      ),
    );
    expect(actualOrder).toEqual([
      "Call S1 Slot Edge",
      "Call S1",
      "Call Break 00",
      "Call Break Tie A",
      "Call Break Tie Z",
      "Call Break 10 TL Z",
      "Call Break 12 TL A",
      "Call No Break A",
      "Call Invalid LB",
      "Call S2",
      "Call S3",
      "Call S4",
      "Off Blank",
      "Off CUTI",
      "Off LBR",
      "Off LIBUR",
      "Off OFF",
      "Call Foreign AUX",
      "Call Foreign TBCCI",
      "Call Foreign WFH",
      "Call Foreign Z",
      "Digital S1",
      "Email H",
      "Leader H",
      "Alpha Service",
      "Unknown Z Service",
      "Empty Service",
    ]);

    const edgeInterval = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: "Call S1 Slot Edge" })
      .locator("td")
      .nth(5)
      .locator("dd")
      .nth(1);
    await expect(edgeInterval).toHaveText("00:00–00:30, 23:45–24:00");
    const invalidInterval = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: "Call Invalid LB" })
      .locator("td")
      .nth(5)
      .locator("dd")
      .nth(1);
    await expect(invalidInterval).toHaveText("—");
    expectIsolation(audit);
  });

  test("bisa berpindah dari format hari ini ke kalender dan kembali", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    await expectPageShell(page);

    const calendarTab = page.getByRole("tab", { name: "Kalender" });
    await expect(page.getByRole("tab", { name: "Hari ini" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("jadwal-shifting-calendar")).toHaveCount(0);

    await calendarTab.click();
    await expect(calendarTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByTestId("jadwal-shifting-calendar"),
      "format kalender tidak dirender setelah pindah tab",
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-table"),
      "tabel harian harus hilang saat kalender aktif",
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "Hari ini" }).click();
    await expect(
      page.getByTestId("jadwal-shifting-calendar"),
      "kalender harus hilang saat kembali ke format harian",
    ).toHaveCount(0);
    await expect(page.getByTestId("jadwal-shifting-table")).toBeVisible();

    expectIsolation(audit);
  });
});

/**
 * Fixture kalender yang benar-benar meluber: 30 agen × 30 hari, sehingga tabel
 * lebih lebar dan lebih tinggi dari layar. Dipakai untuk membuktikan perilaku
 * gulir (horizontal maupun vertikal), bukan untuk menguji isi sel.
 */
const BIG_MATRIX_ROWS = Array.from({ length: 30 }, (_, agentIndex) =>
  Array.from({ length: 30 }, (_, dayIndex) => ({
    nama: `Agen Uji ${String(agentIndex + 1).padStart(2, "0")}`,
    tl: `TL Uji ${String((agentIndex % 4) + 1)}`,
    channel: "Call",
    shift: dayIndex % 7 === 0 ? "OFF" : "S2",
    date: `${FIXTURE_MONTH}-${String(dayIndex + 1).padStart(2, "0")}`,
  })),
).flat();

test.describe("Format kalender (matriks agen × hari)", () => {
  test("barisnya agent dan kolomnya tanggal bulan terpilih, sel berisi kode shift", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });

    await expectPageShell(page);
    const grid = page.getByTestId("jadwal-shifting-calendar");
    await expect(grid, "matriks kalender tidak dirender").toBeVisible();
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "September 2026",
    );

    // Baris = agent, bukan tanggal. Dua agen pada bagian Call.
    const agentRows = page.getByTestId("jadwal-shifting-matrix-row");
    await expect(agentRows, "baris agent tidak dirender").toHaveCount(2);
    await expect(agentRows.nth(0)).toContainText("Alya Pranoto");
    await expect(agentRows.nth(1)).toContainText("Bagas Prakoso");
    // Team leader tampil sebagai metadata baris, bukan kolom tersendiri.
    await expect(agentRows.nth(0)).toContainText("Rina Salim");

    // Kolom = tanggal. September 2026 mulai Selasa; tanggal di luar bulan
    // (2026-10-02) tidak boleh jadi kolom.
    await expect(
      page.getByTestId("jadwal-shifting-matrix-col-2026-09-01"),
      "kolom 1 September tidak ada",
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-matrix-col-2026-09-30"),
      "kolom 30 September tidak ada",
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-matrix-col-2026-10-02"),
      "tanggal di luar bulan tidak boleh jadi kolom",
    ).toHaveCount(0);

    // Sel berisi kode shift apa adanya, dan rekap dihitung dari kode itu.
    const alyaDay1 = page.getByTestId(
      "jadwal-shifting-cell-Alya_Pranoto-2026-09-01",
    );
    await expect(alyaDay1, "sel 1 September Alya tidak dirender").toHaveText(
      "H",
    );
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-02"),
    ).toHaveText("OFF");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-03"),
    ).toHaveText("CUTI");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-04"),
    ).toHaveText("TBCCI");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-07"),
    ).toHaveText("S2");

    // Tanggal tanpa baris untuk agen itu → sel kosong, bukan "—".
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-05"),
      "sel tanpa jadwal tidak dirender",
    ).toHaveText("");

    expectIsolation(audit);
  });

  test("rekap per baris menghitung CUTI, OFF, TBCCI, dan jumlah hari kerja", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);

    // Rekap adalah milik satu baris agen, jadi di-scope ke baris itu — bukan
    // dikumpulkan lintas semua sel. Empat kolom rekap = empat sel per baris.
    const alyaRow = page.getByTestId("jadwal-shifting-matrix-row").nth(0);
    await expect(
      alyaRow.getByTestId("jadwal-shifting-matrix-summary"),
      "satu blok rekap per baris agen",
    ).toHaveCount(1);
    // Empat angka harus tetap dipisah testid masing-masing.
    for (const field of ["cuti", "off", "tbcc", "work"] as const) {
      await expect(
        alyaRow.getByTestId(`jadwal-shifting-summary-${field}`),
        `angka rekap ${field} tidak ada di dalam blok rekap`,
      ).toHaveCount(1);
    }

    // Alya: H, OFF, CUTI, TBCCI, S2 → cuti 1, off 1, tbcc 1, kerja 3.
    // TBCCI ikut terhitung hari kerja: kodenya berarti jadwal kerja (dibaca
    // sebagai sel hijau pada matriks acuan), bukan hari tanpa duty. Menghilangkannya
    // dari rekap akan membuat Training Days selalu 0.
    const alya = alyaRow;
    await expect(
      alya.getByTestId("jadwal-shifting-summary-cuti"),
      "rekap CUTI Alya salah",
    ).toHaveText("1");
    await expect(
      alya.getByTestId("jadwal-shifting-summary-off"),
      "rekap OFF Alya salah",
    ).toHaveText("1");
    await expect(
      alya.getByTestId("jadwal-shifting-summary-tbcc"),
      "rekap TBCCI Alya salah",
    ).toHaveText("1");
    await expect(
      alya.getByTestId("jadwal-shifting-summary-work"),
      "jumlah hari kerja Alya salah",
    ).toHaveText("3");

    // Bagas (bulan September saja): H, S1, H, OFF, H → cuti 0, off 1, tbcc 0,
    // kerja 4 (H + S1 + H + H). Baris 2026-10-02 di luar bulan tidak dihitung.
    const bagas = page.getByTestId("jadwal-shifting-matrix-row").nth(1);
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-cuti"),
      "rekap CUTI Bagas salah",
    ).toHaveText("0");
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-off"),
      "rekap OFF Bagas salah",
    ).toHaveText("1");
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-tbcc"),
      "rekap TBCCI Bagas salah",
    ).toHaveText("0");
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-work"),
      "jumlah hari kerja Bagas salah",
    ).toHaveText("4");
  });

  test("pencarian nama menyaring baris dan kolom rekap ikut menyesuaikan", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);
    await expect(page.getByTestId("jadwal-shifting-matrix-row")).toHaveCount(2);

    await page.getByTestId("jadwal-shifting-agent-search").fill("alya");
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row"),
      "pencarian nama tidak menyaring baris",
    ).toHaveCount(1);
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row").first(),
    ).toContainText("Alya Pranoto");
    await expect(
      page.getByTestId("jadwal-shifting-matrix-summary"),
      "kolom rekap tidak menyesuaikan jumlah baris hasil pencarian",
    ).toHaveCount(1);

    // Pencarian tidak boleh memicu pembacaan baru ke upstream.
    expect(
      capturedJadwalRequests().every((r) => r.method === "GET"),
      "pencarian nama harus murni di klien",
    ).toBe(true);
  });

  test("bagian Email menukar isi matriks dan bukan menampilkan sisa bagian Call", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);
    await expect(page.getByTestId("jadwal-shifting-matrix-row")).toHaveCount(2);

    // Default kalender = Call; membuka selector harus menandai bagian aktif,
    // bukan selalu "semua".
    await selectSection(page, "call", "email");
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row"),
      "baris dari bagian lain masih tampil",
    ).toHaveCount(1);
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row").first(),
    ).toContainText("Citra Wulandari");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Citra_Wulandari-2026-09-01"),
    ).toHaveText("H");
  });

  test("navigasi bulan mengirim bulan yang diminta ke API dan tetap hanya-baca", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "September 2026",
    );

    const monthCalls = () =>
      capturedJadwalRequests().filter((r) => r.path.endsWith("/month"));

    await page.getByTestId("jadwal-shifting-month-next").click();
    await expect
      .poll(() => monthCalls().at(-1)?.month, { timeout: 10_000 })
      .toBe("2026-10");
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "Oktober 2026",
    );
    // Data bulan berikutnya benar-benar mengikuti bulan yang diminta.
    await expect(
      page.getByTestId("jadwal-shifting-cell-Bagas_Prakoso-2026-10-02"),
    ).toHaveText("H");

    await page.getByTestId("jadwal-shifting-month-prev").click();
    await expect
      .poll(() => monthCalls().at(-1)?.month, { timeout: 10_000 })
      .toBe(FIXTURE_MONTH);
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "September 2026",
    );

    expect(
      monthCalls().every((r) => r.method === "GET"),
      "kalender harus selalu GET",
    ).toBe(true);
    expectIsolation(audit);
  });

  const LOOP_EXIT_VIEWPORTS = [
    { width: 1280, height: 800 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 480, height: 800 },
    { width: 390, height: 844 },
    { width: 1280, height: 400 },
    { width: 1280, height: 300 },
    { width: 390, height: 400 },
  ] as const;
  const LOOP_EXIT_FONT_SIZES = [14, 20, 28] as const;

  for (const viewport of LOOP_EXIT_VIEWPORTS) {
    test(`[loop-exit] ${viewport.width}×${viewport.height} at font 14/20/28px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const audit = await openJadwalShifting(page, {
        view: "calendar",
        month: FIXTURE_MONTH,
        behavior: { kind: "data", monthRows: BIG_MATRIX_ROWS },
      });
      await expectPageShell(page);
      await expect(page.getByTestId("jadwal-shifting-calendar")).toBeVisible();
      const fontStyle = await page.addStyleTag({
        content: `html { font-size: ${LOOP_EXIT_FONT_SIZES[0]}px !important; }`,
      });

      for (const rootFontSize of LOOP_EXIT_FONT_SIZES) {
        await fontStyle.evaluate((style, fontSize) => {
          style.textContent = `html { font-size: ${fontSize}px !important; }`;
        }, rootFontSize);
        await expect
          .poll(() =>
            page.evaluate(() =>
              Number.parseFloat(
                getComputedStyle(document.documentElement).fontSize,
              ),
            ),
          )
          .toBe(rootFontSize);

        const metrics = await readCalendarGeometry(page);
        await attachCalendarMetrics(
          testInfo,
          `layout-metrics-${rootFontSize}px.json`,
          {
            browserVersion: page.context().browser()?.version() ?? "unknown",
            expectedFontSize: rootFontSize,
            metrics,
          },
        );
        expect(metrics.viewport).toEqual(viewport);
        expect(metrics.rootFontSize).toBe(rootFontSize);
        expect(metrics.matrix.scrollWidth).toBeGreaterThan(
          metrics.matrix.clientWidth,
        );
        expect(metrics.matrix.scrollHeight).toBeGreaterThan(
          metrics.matrix.clientHeight,
        );
        expectCalendarLayoutContract(metrics);
      }
      expectIsolation(audit);
    });
  }

  test("[loop-exit] matriks dan kontrol benar-benar menggulir; keyboard mencapai filter dan Hari ini", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: BIG_MATRIX_ROWS },
    });
    await expectPageShell(page);
    const controls = page.getByTestId("jadwal-shifting-calendar-controls");
    const matrix = page.getByTestId("jadwal-shifting-calendar");
    await expect(matrix).toBeVisible();
    await page.addStyleTag({
      content: "html { font-size: 28px !important; }",
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
          ),
        ),
      )
      .toBe(28);

    const initial = await readCalendarGeometry(page);
    expectCalendarLayoutContract(initial);
    const mobileScreenshotPath = testInfo.outputPath(
      "calendar-mobile-large-text.png",
    );
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    await testInfo.attach("calendar-mobile-large-text.png", {
      path: mobileScreenshotPath,
      contentType: "image/png",
    });
    expect(initial.matrix.scrollWidth).toBeGreaterThan(
      initial.matrix.clientWidth,
    );
    expect(initial.matrix.scrollHeight).toBeGreaterThan(
      initial.matrix.clientHeight,
    );
    expect(["auto", "scroll"]).toContain(initial.matrix.style.overflowX);
    expect(["auto", "scroll"]).toContain(initial.matrix.style.overflowY);
    expect(initial.controls.scrollHeight).toBeGreaterThan(
      initial.controls.clientHeight,
    );
    expect(["auto", "scroll"]).toContain(initial.controls.style.overflowX);
    expect(["auto", "scroll"]).toContain(initial.controls.style.overflowY);

    expect(initial.matrix.scrollLeft).toBe(0);
    expect(initial.matrix.scrollTop).toBe(0);
    expect(initial.controls.scrollTop).toBe(0);
    await matrix.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => matrix.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await expect
      .poll(() => matrix.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    await controls.focus();
    await page.keyboard.press("End");
    await expect
      .poll(() => controls.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const noteParagraphs = controls
      .getByTestId("jadwal-shifting-calendar-notes")
      .locator("p");
    await noteParagraphs.nth(0).scrollIntoViewIfNeeded();
    await expect(noteParagraphs.nth(0)).toBeInViewport();
    await noteParagraphs.nth(1).scrollIntoViewIfNeeded();
    await expect(noteParagraphs.nth(1)).toBeInViewport();

    const afterScroll = await readCalendarGeometry(page);
    expectCalendarLayoutContract(afterScroll);
    expect(afterScroll.matrix.scrollLeft).toBeGreaterThan(
      initial.matrix.scrollLeft,
    );
    expect(afterScroll.matrix.scrollTop).toBeGreaterThan(
      initial.matrix.scrollTop,
    );
    expect(afterScroll.controls.scrollTop).toBeGreaterThan(
      initial.controls.scrollTop,
    );
    expect(
      Math.abs(afterScroll.matrix.rect.height - initial.matrix.rect.height),
    ).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 480, height: 800 });
    await page.addStyleTag({
      content: "html { font-size: 20px !important; }",
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
          ),
        ),
      )
      .toBe(20);
    const afterResize = await readCalendarGeometry(page);
    expectCalendarLayoutContract(afterResize);
    await attachCalendarMetrics(testInfo, "scroll-metrics.json", {
      initial,
      afterScroll,
      afterResize,
    });

    await controls.evaluate((el) => {
      el.scrollTop = 0;
    });
    const agentSearch = page.getByTestId("jadwal-shifting-agent-search");
    await agentSearch.focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByTestId("jadwal-shifting-section-call"),
    ).toBeFocused();
    await expect(
      page.getByTestId("jadwal-shifting-section-call"),
    ).toBeInViewport();

    const calendarTab = page.getByRole("tab", { name: "Kalender" });
    await calendarTab.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Hari ini" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("jadwal-shifting-table")).toBeVisible();

    expectIsolation(audit);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`[loop-exit] sticky corner and identity stay opaque in ${theme} mode`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const audit = await openJadwalShifting(page, {
        view: "calendar",
        month: FIXTURE_MONTH,
        behavior: { kind: "data", monthRows: BIG_MATRIX_ROWS },
      });
      const matrix = page.getByTestId("jadwal-shifting-calendar");
      await expect(matrix).toBeVisible();
      await page.evaluate((isDark) => {
        document.documentElement.classList.toggle("dark", isDark);
      }, theme === "dark");
      await matrix.evaluate((el) => {
        el.scrollLeft = 240;
        el.scrollTop = 220;
      });
      await expect
        .poll(() => matrix.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      await expect
        .poll(() => matrix.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);

      const stickyMetrics = await page.evaluate(() => {
        const matrixElement = document.querySelector<HTMLElement>(
          '[data-testid="jadwal-shifting-calendar"]',
        );
        const corner = matrixElement?.querySelector<HTMLElement>(
          "thead th:first-child",
        );
        const rowHeads = Array.from(
          matrixElement?.querySelectorAll<HTMLElement>("tbody th") ?? [],
        );
        const rowHead = rowHeads.find((candidate) => {
          const box = candidate.getBoundingClientRect();
          const region = matrixElement?.getBoundingClientRect();
          return Boolean(
            region && box.bottom > region.top + 32 && box.top < region.bottom,
          );
        });
        const sampleAlpha = (element: HTMLElement | undefined) => {
          if (!element) return null;
          const color = getComputedStyle(element).backgroundColor;
          if (!color || !CSS.supports("color", color)) return null;
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext("2d");
          if (!context) return null;
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return {
            color,
            alpha: context.getImageData(0, 0, 1, 1).data[3],
            opacity: Number.parseFloat(getComputedStyle(element).opacity),
          };
        };
        if (!matrixElement || !corner || !rowHead) return null;
        const matrixRect = matrixElement.getBoundingClientRect();
        const cornerRect = corner.getBoundingClientRect();
        const rowRect = rowHead.getBoundingClientRect();
        const style = getComputedStyle(matrixElement);
        const borderTop = Number.parseFloat(style.borderTopWidth);
        const borderLeft = Number.parseFloat(style.borderLeftWidth);
        const x = rowRect.left + Math.min(12, rowRect.width / 2);
        const y = rowRect.top + rowRect.height / 2;
        const hit = document.elementsFromPoint(x, y);
        return {
          corner: sampleAlpha(corner),
          rowHead: sampleAlpha(rowHead),
          cornerTopDelta: Math.abs(
            cornerRect.top - (matrixRect.top + borderTop),
          ),
          rowHeadLeftDelta: Math.abs(
            rowRect.left - (matrixRect.left + borderLeft),
          ),
          hitIdentity: hit.some(
            (element) => rowHead === element || rowHead.contains(element),
          ),
          matrixRect: {
            left: matrixRect.left,
            top: matrixRect.top,
            right: matrixRect.right,
            bottom: matrixRect.bottom,
          },
          hitPoint: { x, y },
        };
      });
      expect(
        stickyMetrics,
        "corner/row identity metrics must exist",
      ).not.toBeNull();
      expect(stickyMetrics?.corner?.alpha).toBe(255);
      expect(stickyMetrics?.rowHead?.alpha).toBe(255);
      expect(stickyMetrics?.corner?.opacity).toBe(1);
      expect(stickyMetrics?.rowHead?.opacity).toBe(1);
      expect(stickyMetrics?.cornerTopDelta).toBeLessThanOrEqual(2);
      expect(stickyMetrics?.rowHeadLeftDelta).toBeLessThanOrEqual(2);
      expect(stickyMetrics?.hitIdentity).toBe(true);

      const screenshotPath = testInfo.outputPath(`sticky-overlap-${theme}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await testInfo.attach(`sticky-overlap-${theme}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
      await attachCalendarMetrics(
        testInfo,
        `sticky-${theme}.json`,
        stickyMetrics,
      );
      expectIsolation(audit);
    });
  }

  test("[loop-exit] loading calendar states occupy the bounded result slot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    // Respons bulan ditahan sampai dilepas, jadi state loading stabil
    // berapa pun lambatnya runner.
    const gate = createResponseGate();
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "data",
        holdUntil: gate.promise,
        monthRows: MATRIX_ROWS,
      },
    });
    const slot = page.getByTestId("jadwal-shifting-view-calendar");
    const loading = page.getByTestId("jadwal-shifting-month-state-loading");
    await expect(loading).toBeVisible();
    await expect(slot).toBeVisible();
    // Kalender baru dirender setelah data tiba, bukan saat loading.
    await expect(page.getByTestId("jadwal-shifting-calendar")).toHaveCount(0);
    gate.release();
    await expect(page.getByTestId("jadwal-shifting-calendar")).toBeVisible();
    await expect(loading).toHaveCount(0);
    expectIsolation(audit);
  });

  test("[loop-exit] error calendar state stays reachable in the result slot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "error",
        status: 502,
        code: "WFM_UNAVAILABLE",
        message: "Sumber jadwal WFM sedang tidak dapat dihubungi.",
      },
    });
    const slot = page.getByTestId("jadwal-shifting-view-calendar");
    await expect(slot).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-month-state-error"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /coba lagi/i }),
    ).toBeVisible();
    expectIsolation(audit);
  });

  test("[loop-exit] empty calendar state stays reachable in the result slot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "empty" },
    });
    await expect(
      page.getByTestId("jadwal-shifting-view-calendar"),
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-month-state-empty"),
    ).toBeVisible();
    expectIsolation(audit);
  });

  test("[loop-exit] truncated warning and no-results state remain reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "data",
        truncated: true,
        monthRows: MATRIX_ROWS,
      },
    });
    const controls = page.getByTestId("jadwal-shifting-calendar-controls");
    await expect(controls).toBeVisible();
    const warning = page.getByTestId("jadwal-shifting-month-truncated");
    await expect(warning).toBeVisible();
    await warning.scrollIntoViewIfNeeded();
    await expect(warning).toBeInViewport();
    const requestCount = capturedJadwalRequests().length;
    await page
      .getByTestId("jadwal-shifting-agent-search")
      .fill("no matching agent");
    await expect(page.getByText("Tidak ada agen yang cocok")).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-view-calendar"),
    ).toBeVisible();
    expect(capturedJadwalRequests()).toHaveLength(requestCount);
    expect(await controls.evaluate((el) => el.scrollHeight)).toBeGreaterThan(
      await controls.evaluate((el) => el.clientHeight),
    );
    expectIsolation(audit);
  });

  test("kode shift yang tidak dikenal tetap ditampilkan utuh, bukan dianggap libur", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "data",
        monthRows: [
          {
            nama: "Sari Melati",
            tl: "Yusuf Hakim",
            channel: "Call",
            shift: "WFH",
            date: "2026-09-01",
          },
          {
            nama: "Sari Melati",
            tl: "Yusuf Hakim",
            channel: "Call",
            shift: "",
            date: "2026-09-02",
          },
        ],
      },
    });
    await expectPageShell(page);

    // Kode tak dikenal: tampil utuh. Tidak boleh hilang atau jadi "libur" —
    // kehilangan kode shift lebih berbahaya daripada warna yang meleset.
    await expect(
      page.getByTestId("jadwal-shifting-cell-Sari_Melati-2026-09-01"),
    ).toHaveText("WFH");
    // Rekap tidak boleh menghitung kode tak dikenal sebagai CUTI/OFF.
    const summary = page.getByTestId("jadwal-shifting-matrix-row").first();
    await expect(
      summary.getByTestId("jadwal-shifting-summary-cuti"),
    ).toHaveText("0");
    await expect(summary.getByTestId("jadwal-shifting-summary-off")).toHaveText(
      "0",
    );
    // Shift kosong = tidak ada shift, jadi bukan hari kerja.
    await expect(
      page.getByTestId("jadwal-shifting-cell-Sari_Melati-2026-09-02"),
    ).toHaveText("");
    await expect(
      summary.getByTestId("jadwal-shifting-summary-work"),
    ).toHaveText("1");
  });
});
