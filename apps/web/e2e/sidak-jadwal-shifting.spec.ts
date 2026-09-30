import { expect, test } from "@playwright/test";
import {
  DAYTIME_AGENT,
  FIXTURE_CHANNELS,
  FIXTURE_DATE,
  FIXTURE_MONTH,
  FORBIDDEN_RESPONSE_KEYS,
  groupedRows,
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

test.beforeEach(() => {
  resetCapturedJadwalRequests();
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
      .poll(
        () => capturedJadwalRequests().at(-1)?.date,
        { timeout: 10_000 },
        "tanggal yang dipilih tidak terkirim ke API",
      )
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
// 1. "Hari ini" — siapa masuk dan siapa libur, dengan pilihan bagian layanan.
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

  test("memisahkan siapa masuk dan siapa libur, lengkap dengan pilihan bagian layanan", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      // Fixture gabungan = 3 baris kerja + 1 baris OFF. Tanpa baris OFF,
      // pengelompokan tidak bisa dibedakan dari sekadar menampilkan semua.
      behavior: { kind: "data", rows: groupedRows() },
    });

    await expectPageShell(page);

    // Format pertama: dua kelompok yang tegas, bukan satu daftar datar.
    await expect(
      page.getByTestId("jadwal-shifting-masuk"),
      "kelompok masuk tidak dirender",
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-libur"),
      "kelompok libur tidak dirender",
    ).toBeVisible();

    const masukItems = page.getByTestId("jadwal-shifting-masuk-item");
    const liburItems = page.getByTestId("jadwal-shifting-libur-item");
    await expect(masukItems).toHaveCount(3);
    await expect(liburItems).toHaveCount(1);
    await expect(liburItems.first()).toContainText("Guntur Saputra");
    await expect(masukItems.first()).not.toContainText("Guntur Saputra");

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

    // Bagian layanan adalah filter scalar → satu dropdown berisi lima pilihan.
    // Memeriksatrigger saja tidak membuktikan pilihannya ada; daftar
    // opsi justru yang harus diperiksa.
    await page.getByTestId("jadwal-shifting-section-all").click();
    for (const section of TODAY_SECTION_TESTIDS) {
      await expect(
        page.getByTestId(`jadwal-shifting-section-option-${section}`),
        `pilihan bagian ${section} tidak ada di dropdown`,
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");

    expectIsolation(audit);
  });

  test("daftar dipecah per layanan, lalu per team leader dengan nama urut A–Z", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: groupedRows() },
    });
    await expectPageShell(page);

    // Fixture: Bagas (Call/Rina), Alya (Digital Chat/Rina), Citra (Email/Doni),
    // Guntur (Leader/Doni, OFF). Urutan grup = urutan bagian layanan yang
    // disepakati (Call → Digital Chat → Email → Leader), bukan urutan baris
    // dari sumber — kalau tidak, bagian yang sama terpisah-pisah.
    const masukSections = page.getByTestId("jadwal-shifting-masuk-section");
    await expect(masukSections, "grup layanan di kelompok masuk").toHaveCount(
      3,
    );
    await expect(masukSections.nth(0)).toHaveAttribute("data-section", "Call");
    await expect(masukSections.nth(1)).toHaveAttribute(
      "data-section",
      "Digital Chat",
    );
    await expect(masukSections.nth(2)).toHaveAttribute("data-section", "Email");

    // Team leader tetap jadi sub-judul DI DALAM layanan.
    await expect(
      masukSections.nth(0).getByTestId("jadwal-shifting-masuk-tl"),
    ).toContainText("TL Rina Salim");
    await expect(
      masukSections.nth(2).getByTestId("jadwal-shifting-masuk-tl"),
    ).toContainText("TL Doni Kurnia");

    // Urutan baris: layanan dulu, baru nama agen.
    const masukItems = page.getByTestId("jadwal-shifting-masuk-item");
    await expect(masukItems).toHaveCount(3);
    await expect(masukItems.nth(0)).toContainText("Bagas Prakoso");
    await expect(masukItems.nth(1)).toContainText("Alya Pranoto");
    await expect(masukItems.nth(2)).toContainText("Citra Wulandari");

    // Kelompok libur memakai struktur yang sama; Guntur ada di bagian Leader.
    const liburSections = page.getByTestId("jadwal-shifting-libur-section");
    await expect(liburSections).toHaveCount(1);
    await expect(liburSections.nth(0)).toHaveAttribute(
      "data-section",
      "Leader",
    );
    await expect(
      liburSections.nth(0).getByTestId("jadwal-shifting-libur-tl"),
    ).toContainText("TL Doni Kurnia");
    await expect(
      page.getByTestId("jadwal-shifting-libur-item").nth(0),
    ).toContainText("Guntur Saputra");

    expectIsolation(audit);
  });

  test("urutan layanan → TL → nama tetap benar walau urutan baris sumber acak", async ({
    page,
  }) => {
    // Fixture ini SENGAJA lebih keras daripada fixture grup lain: satu bagian
    // layanan punya DUA TL, dan tiap TL punya DUA agen, semuanya dikirim dalam
    // urutan yang sudah diacak. Tanpa itu, "urut A–Z" cuma diuji pada grup yang
    // isinya satu orang — urutan yang salah tidak akan pernah terdeteksi.
    const rows = [
      { nama: "Wulan Sari", tl: "Zainal Abidin", channel: "Call" },
      { nama: "Arif Budiman", tl: "Rina Salim", channel: "Call" },
      { nama: "Yusuf Maulana", tl: "Zainal Abidin", channel: "Call" },
      { nama: "Bagas Prakoso", tl: "Rina Salim", channel: "Call" },
      { nama: "Citra Wulandari", tl: "Doni Kurnia", channel: "Email" },
      { nama: "Ahmad Fauzi", tl: "Doni Kurnia", channel: "Email" },
    ].map((row) => ({
      ...row,
      shift: "H",
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
    }));

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    // Layanan tetap berurutan menurut daftar yang disepakati, bukan input.
    const sections = page.getByTestId("jadwal-shifting-masuk-section");
    await expect(sections).toHaveCount(2);
    await expect(sections.nth(0)).toHaveAttribute("data-section", "Call");
    await expect(sections.nth(1)).toHaveAttribute("data-section", "Email");

    // Di dalam Call: TL urut A–Z (Rina Salim sebelum Zainal Abidin)...
    const callGroups = sections
      .nth(0)
      .getByTestId("jadwal-shifting-masuk-group");
    await expect(callGroups).toHaveCount(2);
    await expect(callGroups.nth(0)).toHaveAttribute("data-tl", "Rina Salim");
    await expect(callGroups.nth(1)).toHaveAttribute("data-tl", "Zainal Abidin");

    // ...dan di dalam tiap TL namanya juga urut A–Z.
    await expect(
      callGroups.nth(0).getByTestId("jadwal-shifting-masuk-item"),
    ).toHaveText([/Arif Budiman/, /Bagas Prakoso/]);
    await expect(
      callGroups.nth(1).getByTestId("jadwal-shifting-masuk-item"),
    ).toHaveText([/Wulan Sari/, /Yusuf Maulana/]);

    // Urutan datar untuk seluruh daftar.
    const items = page.getByTestId("jadwal-shifting-masuk-item");
    await expect(items).toHaveCount(6);
    const expected = [
      "Arif Budiman",
      "Bagas Prakoso",
      "Wulan Sari",
      "Yusuf Maulana",
      "Ahmad Fauzi",
      "Citra Wulandari",
    ];
    for (const [index, nama] of expected.entries()) {
      await expect(items.nth(index)).toContainText(nama);
    }

    // Tabel detail memakai urutan yang persis sama.
    const detailRows = page.getByTestId("jadwal-shifting-row");
    await expect(detailRows).toHaveCount(6);
    for (const [index, nama] of expected.entries()) {
      await expect(detailRows.nth(index)).toContainText(nama);
    }

    expectIsolation(audit);
  });

  test("channel dengan kapitalisasi berbeda digabung jadi satu bagian layanan", async ({
    page,
  }) => {
    // `channel` datang apa adanya dari WFM, dan filter bagian layanan sudah
    // mencocokkan tanpa peduli huruf besar/kecil. Pengelompokan harus memakai
    // aturan yang sama: kalau tidak, "call" dan "Call" jadi DUA header untuk
    // layanan yang sama.
    const rows = [
      { nama: "Ahmad Fauzi", tl: "Rina Salim", channel: "call" },
      { nama: "Bagas Prakoso", tl: "Rina Salim", channel: "Call" },
      { nama: "Citra Wulandari", tl: "Doni Kurnia", channel: "Social Media" },
    ].map((row) => ({
      ...row,
      shift: "H",
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
    }));

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    const sections = page.getByTestId("jadwal-shifting-masuk-section");
    await expect(sections).toHaveCount(2);
    await expect(sections.nth(0)).toHaveAttribute("data-section", "Call");
    await expect(sections.nth(0)).toContainText("2 orang");
    // Bagian yang tidak ada di daftar yang disepakati tetap tampil, tapi tidak
    // menyelip di depan bagian yang bernama.
    await expect(sections.nth(1)).toHaveAttribute(
      "data-section",
      "Social Media",
    );

    const items = page.getByTestId("jadwal-shifting-masuk-item");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Ahmad Fauzi");
    await expect(items.nth(1)).toContainText("Bagas Prakoso");
    await expect(items.nth(2)).toContainText("Citra Wulandari");

    expectIsolation(audit);
  });

  test("header layanan tetap tampil ketika satu bagian layanan dipilih", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: groupedRows() },
    });
    await expectPageShell(page);

    // Header tidak boleh muncul-hilang mengikuti filter: struktur daftar harus
    // sama terbaca baik saat "Semua layanan" maupun saat satu bagian dipilih.
    await selectSection(page, "all", "email");
    const sections = page.getByTestId("jadwal-shifting-masuk-section");
    await expect(sections).toHaveCount(1);
    await expect(sections.nth(0)).toHaveAttribute("data-section", "Email");
    await expect(sections.nth(0)).toContainText("TL Doni Kurnia");
    await expect(page.getByTestId("jadwal-shifting-libur-section")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("jadwal-shifting-libur-empty")).toBeVisible();

    expectIsolation(audit);
  });

  test("baris tanpa bagian layanan tetap tampil dan dikelompokkan paling akhir", async ({
    page,
  }) => {
    const rows = [
      {
        nama: "Zulfa Ramadhani",
        tl: "Rina Salim",
        channel: "",
        shift: "H",
        shiftPrev: "",
        date: FIXTURE_DATE,
        activities: [],
      },
      {
        nama: "Ahmad Fauzi",
        tl: "Rina Salim",
        channel: "Call",
        shift: "H",
        shiftPrev: "",
        date: FIXTURE_DATE,
        activities: [],
      },
    ];

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    // `channel` kosong tetap ditampilkan (datanya ada), tapi tidak boleh
    // menyelip di antara bagian layanan yang bernama.
    const sections = page.getByTestId("jadwal-shifting-masuk-section");
    await expect(sections).toHaveCount(2);
    await expect(sections.nth(0)).toHaveAttribute("data-section", "Call");
    await expect(sections.nth(1)).toHaveAttribute("data-section", "");
    await expect(sections.nth(1)).toContainText("Tanpa layanan");
    await expect(
      page.getByTestId("jadwal-shifting-masuk-item").nth(1),
    ).toContainText("Zulfa Ramadhani");

    expectIsolation(audit);
  });

  test("agen tanpa team leader tetap tampil dan dikelompokkan paling akhir", async ({
    page,
  }) => {
    const rows = [
      {
        nama: "Zulfa Ramadhani",
        tl: "",
        channel: "Call",
        shift: "H",
        shiftPrev: "",
        date: FIXTURE_DATE,
        activities: [],
      },
      {
        nama: "Ahmad Fauzi",
        tl: "Rina Salim",
        channel: "Call",
        shift: "H",
        shiftPrev: "",
        date: FIXTURE_DATE,
        activities: [],
      },
    ];

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    // Baris tanpa TL bukan sampah yang boleh disembunyikan: ia harus tetap
    // terlihat, tapi tidak boleh menyelip di tengah grup TL yang bernama.
    const groups = page.getByTestId("jadwal-shifting-masuk-group");
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toHaveAttribute("data-tl", "Rina Salim");
    await expect(groups.nth(1)).toHaveAttribute("data-tl", "");
    await expect(groups.nth(1)).toContainText("Tanpa team leader");
    await expect(page.getByTestId("jadwal-shifting-masuk-item")).toHaveCount(2);
    await expect(
      page.getByTestId("jadwal-shifting-masuk-item").nth(1),
    ).toContainText("Zulfa Ramadhani");

    expectIsolation(audit);
  });

  test("tabel detail memakai urutan layanan → team leader yang sama dengan daftar", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: groupedRows() },
    });
    await expectPageShell(page);

    // Tabel detail adalah panel penjelas di bawah daftar. Kalau urutannya beda,
    // mata harus mencari ulang orang yang sama di dua tempat.
    const detailRows = page.getByTestId("jadwal-shifting-row");
    await expect(detailRows).toHaveCount(4);
    await expect(detailRows.nth(0)).toContainText("Bagas Prakoso");
    await expect(detailRows.nth(1)).toContainText("Alya Pranoto");
    await expect(detailRows.nth(2)).toContainText("Citra Wulandari");
    await expect(detailRows.nth(3)).toContainText("Guntur Saputra");

    expectIsolation(audit);
  });

  test("pilihan bagian menyaring kelompok masuk/libur sekaligus detail jadwal", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: groupedRows() },
    });
    await expectPageShell(page);
    await expect(page.getByTestId("jadwal-shifting-masuk-item")).toHaveCount(3);

    // Trigger dropdown menampilkan LABEL pilihan, bukan nilai internal
    // (`all`, `digital-chat`). Slug yang bocor ke teks filter adalah kebocoran
    // detail implementasi ke user.
    // `toHaveText` ikut menghitung ikon chevron, jadi yang diperiksa adalah
    // teks yang benar-benar terbaca (accessible name) dari trigger.
    await expect(
      page.getByTestId("jadwal-shifting-section-all"),
      "trigger menampilkan slug, bukan label",
    ).toContainText("Semua layanan");
    await selectSection(page, "all", "digital-chat");
    await expect(
      page.getByTestId("jadwal-shifting-section-digital-chat"),
    ).toContainText("Digital Chat");
    await selectSection(page, "digital-chat", "all");

    // Email: satu baris kerja, tanpa baris libur → kelompok libur harus
    // menyatakan kosong, bukan diam-diam menampilkan baris kerja Email.
    await selectSection(page, "all", "email");
    await expect(page.getByTestId("jadwal-shifting-masuk-item")).toHaveCount(1);
    await expect(
      page.getByTestId("jadwal-shifting-masuk-item").first(),
    ).toContainText("Citra Wulandari");
    await expect(page.getByTestId("jadwal-shifting-libur-item")).toHaveCount(0);
    await expect(
      page.getByTestId("jadwal-shifting-libur-empty"),
      "kelompok libur kosong tidak dinyatakan",
    ).toBeVisible();

    // Detail tabel ikut menyaring: tidak ada baris di luar bagian terpilih.
    const detailRows = page.getByTestId("jadwal-shifting-row");
    await expect(detailRows).toHaveCount(1);
    await expect(detailRows.first()).toContainText("Citra Wulandari");

    // Leader: justru baris liburnya yang ada.
    await selectSection(page, "email", "leader");
    await expect(page.getByTestId("jadwal-shifting-masuk-item")).toHaveCount(0);
    await expect(page.getByTestId("jadwal-shifting-libur-item")).toHaveCount(1);
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(1);

    // Kembali ke "Semua layanan" mengembalikan seluruh data.
    await selectSection(page, "leader", "all");
    await expect(page.getByTestId("jadwal-shifting-masuk-item")).toHaveCount(3);
    await expect(page.getByTestId("jadwal-shifting-libur-item")).toHaveCount(1);

    expect(
      capturedJadwalRequests().every((r) => r.method === "GET"),
      "filter bagian harus murni di klien, tanpa operasi tulis",
    ).toBe(true);
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
      page.getByTestId("jadwal-shifting-masuk"),
      "kelompok harian harus hilang saat kalender aktif",
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "Hari ini" }).click();
    await expect(
      page.getByTestId("jadwal-shifting-calendar"),
      "kalender harus hilang saat kembali ke format harian",
    ).toHaveCount(0);
    await expect(page.getByTestId("jadwal-shifting-masuk")).toBeVisible();

    expectIsolation(audit);
  });
});

test.describe("Format kalender (matriks agen × hari)", () => {
  test("barisnya agent dan kolomnya tanggal bulan terpilih, sel berisi kode shift", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", rows: groupedRows(), monthRows: MATRIX_ROWS },
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
