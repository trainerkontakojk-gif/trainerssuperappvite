/**
 * KETIK — landing berbasis data, ruang chat, tahap Telaah, dan halaman Riwayat
 * (hermetic). Semua `/api` dimock; mutasi data nyata tetap milik spec backend.
 *
 * Fixture settings memakai `DEFAULT_KETIK_SETTINGS` dari `@trainers/types`,
 * supaya spec gagal ketika UI menyimpang dari kontrak bersama.
 */

import { expect, test } from "@playwright/test";
import { type KetikAppSettings } from "@trainers/types";
import {
  APP_ORIGIN,
  expectHermetic,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { findTextBelowFloor } from "./helpers/typographyFloor";
import {
  REVIEWED_SESSION,
  FULL_HISTORY,
  REVIEW_DETAIL,
  FAST_SETTINGS,
  CHAT_ID,
  serverSession,
  assignedSelf,
  ketikMocks,
  telaahPath,
  open,
  openKetikSettings,
  MALFORMED_SESSION,
  MALFORMED_REVIEW_DETAIL,
} from "./helpers/ketikFlowHarness";

test.describe("KETIK ruang chat (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("waktu sesi habis: konsumen pamit dan kolom balasan tetap terbuka untuk pesan penutup", async ({
    page,
  }) => {
    const audit = await open(
      page,
      "/ketik",
      [
        assignedSelf,
        ...ketikMocks([], FAST_SETTINGS),
        {
          method: "GET",
          path: "/api/v1/ai/usage/summary",
          body: { success: true, data: null },
        },
        {
          method: "POST",
          path: "/api/v1/ketik/sessions",
          body: {
            success: true,
            data: serverSession({
              expiresAt: new Date(Date.now() + 8_000).toISOString(),
            }),
          },
        },
        {
          method: "POST",
          path: `/api/v1/ketik/sessions/${CHAT_ID}/respond`,
          body: {
            success: true,
            data: serverSession({
              consumerClosed: true,
              messages: [
                {
                  id: "pamit",
                  sender: "consumer",
                  text: "Saya ada urusan dulu, kak.",
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
          },
        },
      ],
      "agent",
    );
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .click({ timeout: 20000 });
    const room = page.getByRole("region", { name: "Ruang chat" });
    await expect(
      room.getByRole("textbox", { name: "Tulis balasan" }),
    ).toBeVisible();

    await expect(
      room.getByText("Saya ada urusan dulu, kak.", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      room.getByText(
        /Konsumen telah mengakhiri chat\. Anda masih bisa mengirim pesan penutup/,
      ),
    ).toBeVisible();
    await expect(
      room.getByRole("textbox", { name: "Tulis balasan" }),
    ).toBeEnabled();
    expectHermetic(audit);
  });

  test("mulai simulasi tidak menunggu ringkasan pemakaian AI bulan ini", async ({
    page,
  }) => {
    const audit = await open(
      page,
      "/ketik",
      [
        assignedSelf,
        ...ketikMocks([], FAST_SETTINGS),
        {
          method: "POST",
          path: "/api/v1/ketik/sessions",
          body: { success: true, data: serverSession() },
        },
      ],
      "agent",
    );
    // Ringkasan bulanan yang lambat (membaca semua log AI bulan ini) tidak
    // boleh menahan pembuatan sesi.
    await page.route("**/api/v1/ai/usage/summary**", () => {
      audit.mockedApi.push("GET /api/v1/ai/usage/summary (ditahan)");
    });

    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .click({ timeout: 20000 });

    const room = page.getByRole("region", { name: "Ruang chat" });
    await expect(
      room.getByRole("textbox", { name: "Tulis balasan" }),
    ).toBeVisible();
    expect(audit.mockedApi).toContain("POST /api/v1/ketik/sessions");
    expectHermetic(audit);
  });

  test("chat tanpa petunjuk sesi, akhiri dengan konfirmasi, lalu masuk tahap Telaah", async ({
    page,
  }) => {
    const savedAt = new Date().toISOString();
    const audit = await open(
      page,
      "/ketik",
      [
        assignedSelf,
        ...ketikMocks([], FAST_SETTINGS),
        {
          method: "GET",
          path: "/api/v1/ai/usage/summary",
          body: { success: true, data: null },
        },
        {
          method: "POST",
          path: "/api/v1/ketik/sessions",
          body: { success: true, data: serverSession() },
        },
        {
          method: "POST",
          path: `/api/v1/ketik/sessions/${CHAT_ID}/finish`,
          body: {
            success: true,
            data: {
              id: CHAT_ID,
              date: savedAt,
              scenarioTitle: "Skenario Baru",
              consumerName: "Konsumen",
              messages: [
                {
                  id: "n1",
                  sender: "agent",
                  text: "Selamat pagi, ada yang bisa dibantu?",
                  timestamp: savedAt,
                },
                {
                  id: "n2",
                  sender: "consumer",
                  text: "Iya, tagihan saya muncul dua kali.",
                  timestamp: savedAt,
                },
              ],
              reviewStatus: "pending",
            },
          },
        },
      ],
      "agent",
    );

    let activeSession = serverSession();
    await page.route(
      `**/api/v1/ketik/sessions/${CHAT_ID}/messages`,
      async (route) => {
        audit.mockedApi.push(`POST /api/v1/ketik/sessions/${CHAT_ID}/messages`);
        const body = route.request().postDataJSON();
        expect(Object.keys(body).sort()).toEqual([
          "expectedAgentVersion",
          "requestId",
          "text",
        ]);
        activeSession = serverSession({
          version: 1,
          agentVersion: 1,
          awaitingResponse: true,
          messages: [
            {
              id: body.requestId,
              sender: "agent",
              text: body.text,
              timestamp: savedAt,
            },
          ],
        });
        await route.fulfill({
          json: { success: true, data: activeSession },
        });
      },
    );
    await page.route(
      `**/api/v1/ketik/sessions/${CHAT_ID}/respond`,
      async (route) => {
        audit.mockedApi.push(`POST /api/v1/ketik/sessions/${CHAT_ID}/respond`);
        expect(Object.keys(route.request().postDataJSON())).toEqual([
          "requestId",
        ]);
        activeSession = {
          ...activeSession,
          version: 2,
          awaitingResponse: false,
          messages: [
            ...activeSession.messages,
            {
              id: "n2",
              sender: "consumer",
              text: "Iya, tagihan saya muncul dua kali.",
              timestamp: savedAt,
            },
          ],
        };
        await route.fulfill({
          json: { success: true, data: activeSession },
        });
      },
    );
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .click({ timeout: 20000 });

    const room = page.getByRole("region", { name: "Ruang chat" });
    const input = room.getByRole("textbox", { name: "Tulis balasan" });
    await expect(input).toBeVisible();

    // Tidak ada badge "Online" atau nama skenario; satu-satunya jam di layar
    // adalah timer maju yang mengukur durasi simulasi (bukan hitung mundur).
    await expect(room.getByText("Online", { exact: true })).toHaveCount(0);
    await expect(room.getByText(/^\d+:\d{2}$/)).toHaveCount(1);
    await expect(
      room.getByRole("timer", { name: "Durasi simulasi" }),
    ).toHaveText(/^00:[0-5]\d$/);

    await input.fill("Selamat pagi, ada yang bisa dibantu?");
    await input.press("Enter");
    await expect(
      room.getByText("Iya, tagihan saya muncul dua kali."),
    ).toBeVisible({
      timeout: 15000,
    });

    await page.route(`**/api/v1/ketik/history/${CHAT_ID}`, (route) => {
      audit.mockedApi.push(`GET /api/v1/ketik/history/${CHAT_ID}`);
      return route.fulfill({
        json: {
          success: true,
          data: {
            id: CHAT_ID,
            date: savedAt,
            scenarioTitle: "Skenario Baru",
            consumerName: "Konsumen",
            messages: serverSession({
              messages: [
                {
                  id: "n1",
                  sender: "agent",
                  text: "Selamat pagi, ada yang bisa dibantu?",
                  timestamp: savedAt,
                },
                {
                  id: "n2",
                  sender: "consumer",
                  text: "Iya, tagihan saya muncul dua kali.",
                  timestamp: savedAt,
                },
              ],
            }).messages,
            reviewStatus: "pending",
            previousFinalScore: null,
          },
        },
      });
    });

    // "Akhiri chat" netral dan meminta konfirmasi aplikasi.
    await room.getByRole("button", { name: "Akhiri chat" }).click();
    const confirm = page.getByRole("dialog", { name: "Akhiri chat sekarang?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Lanjutkan chat" }).click();
    await expect(confirm).toBeHidden();
    await expect(input).toBeVisible();

    await room.getByRole("button", { name: "Akhiri chat" }).click();
    await page
      .getByRole("dialog", { name: "Akhiri chat sekarang?" })
      .getByRole("button", { name: "Akhiri chat" })
      .click();

    await expect(page).toHaveURL(new RegExp(`sesi=${CHAT_ID}`));
    await expect(page).toHaveURL(/tahap=telaah/);
    await expect(
      page
        .getByRole("region", { name: "Hasil telaah" })
        .getByText("Belum ditelaah"),
    ).toBeVisible();
    await waitForMockedApi(audit, [
      `POST /api/v1/ketik/sessions/${CHAT_ID}/finish`,
    ]);
    expectHermetic(audit);
  });
});

test.describe("KETIK NIK dan email konsumen (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("Pengaturan menyimpan NIK dan email yang sengaja salah dengan catatan netral", async ({
    page,
  }) => {
    const { audit, dialog } = await openKetikSettings(page);
    await dialog.getByRole("tab", { name: /^Identitas konsumen/ }).click();

    // Contoh dari pool latihan: NIK 16 digit berakhiran 0000, email gmail.
    const example = dialog.getByRole("region", {
      name: "Contoh identitas acak",
    });
    const exampleValues = example.getByRole("definition");
    await expect(exampleValues.filter({ hasText: /^\d{12}0000$/ })).toHaveCount(
      1,
    );
    await expect(exampleValues.filter({ hasText: /@gmail\.com$/ })).toHaveCount(
      1,
    );
    await expect(example).toContainText("150 konsumen latihan");

    const nik = dialog.getByRole("textbox", { name: /^NIK/ });
    const email = dialog.getByRole("textbox", { name: /^Alamat email/ });
    const city = dialog.getByRole("textbox", { name: /^Kota asal/ });
    await nik.fill("317405120885000");
    await email.fill("budi.santoso85@gnail.com");
    await city.fill("Lampung");
    await expect(nik).toHaveAccessibleDescription(
      "15 digit, harus 16. Agen akan dinilai apakah mengonfirmasi data ini.",
    );
    await expect(email).toHaveAccessibleDescription(
      "Domain mirip gmail.com. Agen akan dinilai apakah mengonfirmasi data ini.",
    );
    await expect(city).toHaveAccessibleDescription(
      /Nama provinsi.*memastikan kota\/kabupatennya/,
    );

    const saveButton = dialog.getByRole("button", {
      name: "Simpan",
      exact: true,
    });
    await expect(saveButton).toBeEnabled();
    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        new URL(request.url()).pathname === "/api/v1/ketik/settings",
    );
    await saveButton.click();
    const saved = (await saveRequest).postDataJSON() as KetikAppSettings;
    expect(saved.identitySettings).toMatchObject({
      nik: "317405120885000",
      email: "budi.santoso85@gnail.com",
      city: "Lampung",
    });
    expectHermetic(audit);
  });

  test("panel Data konsumen menampilkan NIK dan email apa adanya, jadi sheet di layar sempit", async ({
    page,
  }) => {
    const identity = {
      name: "Budi Santoso",
      city: "Jakarta Selatan",
      phone: "081234561234",
      nik: "317405120885000",
      email: "budi.santoso85@gnail.com",
    };
    const audit = await open(
      page,
      "/ketik",
      [
        assignedSelf,
        ...ketikMocks([], FAST_SETTINGS),
        {
          method: "GET",
          path: "/api/v1/ai/usage/summary",
          body: { success: true, data: null },
        },
        {
          method: "POST",
          path: "/api/v1/ketik/sessions",
          body: {
            success: true,
            data: serverSession({
              config: { ...serverSession().config, identity },
            }),
          },
        },
      ],
      "agent",
    );
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .click({ timeout: 20000 });
    const room = page.getByRole("region", { name: "Ruang chat" });
    await expect(
      room.getByRole("textbox", { name: "Tulis balasan" }),
    ).toBeVisible();

    const toggle = room.getByRole("button", { name: "Data konsumen" });
    const panel = room.getByRole("complementary", { name: "Data konsumen" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    // Nilai utuh tanpa spasi atau tanda peringatan: agen sendiri yang menemukan.
    await expect(
      panel.getByRole("definition").filter({ hasText: "317405120885000" }),
    ).toHaveText("317405120885000");
    await expect(panel).toContainText("budi.santoso85@gnail.com");
    await expect(panel).toContainText("081234561234");
    await expect(panel.locator("mark")).toHaveCount(0);
    // Tanpa petunjuk verifikasi atau catatan "data latihan" di layar agen.
    await expect(panel).not.toContainText(
      /cocokkan|verifikasi|latihan|sungguhan/i,
    );
    for (const name of ["Salin nomor telepon", "Salin NIK", "Salin email"]) {
      await expect(panel.getByRole("button", { name })).toBeVisible();
    }
    // Header tetap ramping: kota saja, nomor pindah ke panel.
    await expect(room.locator("header")).not.toContainText("081234561234");

    await toggle.click();
    await expect(panel).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await page.setViewportSize({ width: 390, height: 844 });
    await toggle.click();
    await expect(panel).toBeVisible();
    // Sheet dari bawah selebar ruang chat.
    const box = await panel.boundingBox();
    const roomBox = await room.boundingBox();
    expect(box && roomBox).toBeTruthy();
    expect(box!.y + box!.height).toBeCloseTo(roomBox!.y + roomBox!.height, 0);
    expect(box!.width).toBeCloseTo(roomBox!.width, 0);
    await panel.getByRole("button", { name: "Tutup data konsumen" }).click();
    await expect(panel).toHaveCount(0);
    expectHermetic(audit);
  });

  test("Telaah menandai data tidak sesuai, garis konfirmasi yang terlewat, dan Verifikasi data", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(MALFORMED_SESSION.id), [
      ...ketikMocks([MALFORMED_SESSION, ...FULL_HISTORY]),
      {
        method: "GET",
        path: `/api/v1/ketik/review/${MALFORMED_SESSION.id}`,
        body: { success: true, data: MALFORMED_REVIEW_DETAIL },
      },
    ]);

    const transcript = page.getByRole("region", { name: "Percakapan" });
    const visible = transcript.getByRole("region", {
      name: "Data konsumen yang terlihat di panel agen",
    });
    await expect(visible).toBeVisible({ timeout: 20000 });
    // Nomor telepon tetap tampil setelah chat diakhiri, sama seperti di panel agen.
    await expect(visible.getByRole("definition")).toHaveCount(4);
    await expect(
      visible.getByText("Nomor telepon", { exact: true }),
    ).toBeVisible();
    await expect(
      visible.getByText("0812-1111-2222", { exact: true }),
    ).toBeVisible();
    await expect(
      visible.locator("mark", { hasText: "317405120885000" }),
    ).toBeVisible();
    await expect(
      visible.locator("mark", { hasText: /^gnail\.com$/ }),
    ).toBeVisible();
    for (const label of ["15 digit", "domain typo", "nama provinsi"]) {
      await expect(visible.getByText(label, { exact: true })).toBeVisible();
    }
    // Nilai yang sama di pesan konsumen ikut ditandai.
    await expect(
      transcript
        .getByTestId("ketik-message-3")
        .locator("mark", { hasText: "317405120885000" }),
    ).toBeVisible();
    // Garis putus-putus tepat sebelum pesan agen yang seharusnya mengonfirmasi.
    const marker = transcript.getByRole("note");
    await expect(marker).toHaveText(
      "Data tidak sesuai seharusnya dikonfirmasi di sini",
    );
    const order = await transcript
      .locator("ol > li")
      .evaluateAll((items) =>
        items.map(
          (item) =>
            item.getAttribute("role") ?? item.getAttribute("data-testid"),
        ),
      );
    expect(order).toEqual([
      "ketik-message-1",
      "ketik-message-2",
      "ketik-message-3",
      "note",
      "ketik-message-4",
    ]);

    const result = page.getByRole("region", { name: "Hasil telaah" });
    const verification = result.getByRole("region", {
      name: "Verifikasi data",
    });
    await expect(verification).toContainText("Belum dikonfirmasi");
    const row = (name: string) =>
      verification
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name, exact: true }) });
    await expect(row("NIK")).toContainText("15 digit, harus 16");
    await expect(row("NIK")).toContainText("Belum dikonfirmasi");
    await expect(row("Email")).toContainText("Domain mirip gmail.com");
    await expect(row("Domisili")).toContainText("Tidak ditanyakan");
    await row("NIK")
      .getByRole("button", { name: /Pesan 2/ })
      .click();
    await expect(transcript.getByTestId("ketik-message-2")).toHaveAttribute(
      "data-highlighted",
      "true",
    );
    expectHermetic(audit);
  });

  test("data konsumen, garis konfirmasi, dan Verifikasi data memenuhi kontras dan ukuran teks", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(MALFORMED_SESSION.id), [
      ...ketikMocks([MALFORMED_SESSION, ...FULL_HISTORY]),
      {
        method: "GET",
        path: `/api/v1/ketik/review/${MALFORMED_SESSION.id}`,
        body: { success: true, data: MALFORMED_REVIEW_DETAIL },
      },
    ]);
    const verification = page.getByRole("region", { name: "Verifikasi data" });
    await expect(verification).toBeVisible({ timeout: 20000 });
    const regions = [
      page.getByRole("region", {
        name: "Data konsumen yang terlihat di panel agen",
      }),
      page.getByRole("region", { name: "Percakapan" }).getByRole("note"),
      verification,
    ];
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      for (const region of regions) {
        const low = await findLowContrastText(region, {
          selector: "*",
          leafOnly: true,
        });
        expect(low, `${theme}: ${low.join("\n")}`).toEqual([]);
      }
    }
    for (const region of regions) {
      expect(await findTextBelowFloor(region)).toEqual([]);
    }
    expectHermetic(audit);
  });

  test("sesi lama tanpa NIK dan email menampilkan tanda kosong tanpa Verifikasi data", async ({
    page,
  }) => {
    // Domisili "Jakarta" dulu boleh diisi bebas; aturan verifikasi tidak berlaku surut.
    const legacy = {
      ...REVIEWED_SESSION,
      id: "ketik-legacy-jakarta",
      consumerCity: "Jakarta",
    };
    const audit = await open(page, telaahPath(legacy.id), [
      ...ketikMocks([legacy, ...FULL_HISTORY]),
      {
        method: "GET",
        path: `/api/v1/ketik/review/${legacy.id}`,
        body: {
          success: true,
          data: { ...REVIEW_DETAIL, sessionId: legacy.id },
        },
      },
    ]);
    const visible = page
      .getByRole("region", { name: "Percakapan" })
      .getByRole("region", {
        name: "Data konsumen yang terlihat di panel agen",
      });
    await expect(visible).toBeVisible({ timeout: 20000 });
    await expect(visible.getByRole("definition")).toHaveText([
      "Jakarta",
      "0812-1111-2222",
      "—",
      "—",
    ]);
    await expect(visible.locator("mark")).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Hasil telaah" })
        .getByTestId("ketik-final-score"),
    ).toHaveText("82");
    await expect(
      page.getByRole("region", { name: "Verifikasi data" }),
    ).toHaveCount(0);
    await expect(page.getByRole("note")).toHaveCount(0);
    expectHermetic(audit);
  });
});
