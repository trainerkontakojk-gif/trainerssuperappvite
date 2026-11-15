import { expect, test } from "@playwright/test";
import {
  DAYTIME_AGENT,
  FIXTURE_CHANNELS,
  FIXTURE_DATE,
  FORBIDDEN_RESPONSE_KEYS,
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
import {
  loopExitBrowserEvents,
  expectPageShell,
} from "./helpers/sidakJadwalShiftingFixtures";

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
      // Ringkasan `/sidak` dari ronde sebelumnya memuat ulang datanya saat
      // sesi mock berganti peran; kosongkan halaman dulu supaya request itu
      // tidak masuk audit ronde berikutnya.
      await page.goto("about:blank");
      const audit = await openJadwalShifting(page, { role });
      if (expectApiCall) {
        await expect
          .poll(() => audit.mockedApi.length, {
            message: `role ${role} tidak memanggil endpoint jadwal`,
          })
          .toBeGreaterThan(0);
      }
      // Ringkasan `/sidak` membaca dashboard + direktori agen. Data itu tidak
      // relevan untuk menu jadwal, jadi dijawab kosong di sini (route ini
      // didaftarkan setelah guard, sehingga diperiksa lebih dulu).
      await page.route(
        (url) =>
          url.pathname === "/api/v1/sidak/dashboard" ||
          url.pathname === "/api/v1/sidak/agents",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                agents: [],
                batches: [],
                periodMetrics: [],
                paretoData: [],
              },
            }),
          }),
      );
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
