import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  mockTelefunVoiceServer,
  telefunMocks,
} from "./helpers/telefunFixtures";

/**
 * Telefun — isi instruksi konsumen AI dan sinyal hold (hermetic). Server
 * suara Gemini Live ditiru; spec membaca instruksi yang dikirim aplikasi di
 * pesan konfigurasi dan teks kontrol yang dikirim saat hold selesai.
 * Tipe konsumen bawaan adalah "Marah & Emosional".
 */

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
  permissions: ["microphone"],
});

const NEW_ID = "telefun-prompt-1";

function callMocks(settings: unknown = {}): ApiMock[] {
  return [
    ...telefunMocks([], settings),
    {
      method: "POST",
      path: "/api/v1/telefun/sessions",
      body: { success: true, data: { id: NEW_ID, simulationSubject: null } },
    },
    {
      method: "GET",
      path: "/api/v1/ai/usage/summary",
      body: { success: true, data: null },
    },
  ];
}

async function startCall(page: Page) {
  await page
    .getByRole("button", { name: /^Mulai simulasi/ })
    .click({ timeout: 20000 });
  const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
  const start = picker.getByRole("button", { name: "Mulai panggilan" });
  await expect(start).toBeEnabled({ timeout: 15000 });
  await start.click();
  const call = page.getByRole("region", { name: "Panggilan" });
  await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
    timeout: 20000,
  });
  return call;
}

function configuredInstructions(messages: Record<string, unknown>[]): string {
  const configure = messages.find(
    (message) => message.type === "telefun_session_configure",
  ) as { instructions?: unknown } | undefined;
  expect(typeof configure?.instructions).toBe("string");
  return configure!.instructions as string;
}

function holdEndCues(messages: Record<string, unknown>[]): string[] {
  return messages
    .map(
      (message) =>
        (message as { realtimeInput?: { text?: unknown } }).realtimeInput?.text,
    )
    .filter(
      (text): text is string =>
        typeof text === "string" &&
        text.startsWith("[TELEFUN_CONTROL:HOLD_END]"),
    );
}

test.describe("Telefun konsumen AI (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("konsumen marah: tidak memberi petunjuk, tidak dipaksa sabar, hold diterima dengan nada", async ({
    page,
  }) => {
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, NEW_ID, messages);
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: callMocks(),
      waitForUrl: /\/telefun/,
      expectedThirdPartyHosts: ["randomuser.me"],
    });
    console.log("[audit]", formatAudit(audit));
    await startCall(page);

    const prompt = configuredInstructions(messages);
    expect(prompt).toContain("EMOSI: MARAH/KESAL");
    // Konsumen tidak tahu jawaban benar dan tidak menuntun agen.
    expect(prompt).toContain("POSISI KONSUMEN");
    expect(prompt).toContain("Jangan pernah mengoreksi agen");
    expect(prompt).not.toContain("lanjutkan eksposisi masalah");
    expect(prompt).not.toContain("minta kepastian langkah berikutnya");
    // Hold selalu diterima, tetapi tipe marah tidak dipaksa terdengar sabar.
    expect(prompt).toContain("SELALU kamu terima");
    expect(prompt).toContain("boleh menolak SATU KALI");
    expect(prompt).not.toContain("Nggak apa-apa, silakan lanjut");
    expect(prompt).not.toContain("sabar menunggu");
    expect(prompt).not.toContain("Konsumen NORMAL akan mengikuti");
    // Marah boleh menyela tanpa tantangan Interupsi; larangan marah cukup satu batas.
    expect(prompt).not.toContain("JANGAN MENYELA AGEN");
    expect(prompt).toContain("BOLEH MENYELA");
    expect(prompt).not.toContain("teatrikal");
    expect(prompt).toContain("Empati template");
    expect(prompt).toContain("CONTOH GAYA BICARA");
    expect(prompt).not.toContain("BENIH KONSISTENSI");
    expect(prompt).not.toContain("mohon maaf");
    // Ekspresif: bahasa informal dan logat daerah boleh, tanpa membaca arahan panggung.
    expect(prompt).toContain("GAYA BAHASA DAN EKSPRESI");
    expect(prompt).toContain("lo/gue");
    expect(prompt).toContain("logat");
    expect(prompt).toContain("Jangan mengucapkan arahan panggung");
    // Marah boleh meluapkan kekesalan, bukan sekadar satu kalimat lalu diam.
    expect(prompt).toContain("BOLEH MELUAPKAN");
    expect(prompt).toContain("tidak langsung membuat emosimu reda");
    expectHermetic(audit);
  });

  test("konsumen marah: kontrak peran di atas, nada tinggi dan cepat, tetap konsumen saat dihina", async ({
    page,
  }) => {
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, NEW_ID, messages);
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: callMocks(),
      waitForUrl: /\/telefun/,
      expectedThirdPartyHosts: ["randomuser.me"],
    });
    console.log("[audit]", formatAudit(audit));
    await startCall(page);

    const prompt = configuredInstructions(messages);
    // Kontrak peran paling atas, larangan menawarkan bantuan cukup sekali.
    const head = prompt.slice(0, 900);
    expect(head).toContain("KONTRAK PERAN");
    expect(head).toContain("JANGAN PERNAH MENAWARKAN BANTUAN");
    expect(head).toContain("menjelaskan prosedur");
    expect(prompt.split("MENAWARKAN BANTUAN").length - 1).toBe(1);
    // Emosi dibaca sebelum data skenario.
    expect(prompt.indexOf("EMOSI: MARAH/KESAL")).toBeLessThan(
      prompt.indexOf("DATA SKENARIO"),
    );
    // Dihina tetap konsumen dan makin marah.
    expect(prompt).toContain("menghina");
    // Nada tinggi dan tempo cepat, tanpa arahan tempo yang menyuruh sabar.
    expect(prompt).toContain("TEMPO RESPONS (MARAH)");
    expect(prompt).not.toContain("Jangan memotong agen terlalu cepat");
    expect(prompt).not.toContain("oh begitu");
    expect(prompt).not.toContain("tunggu dengan sabar");
    // Tidak ada kata maaf yang bisa ditiru sebagai gaya bicara agen.
    expect(prompt).not.toMatch(/maaf/i);
    expect(prompt).not.toContain("ketidaknyamanan");
    expectHermetic(audit);
  });

  test("konsumen marah ngotot: solusi pertama tidak langsung diterima, patuh prosedur bukan berarti setuju", async ({
    page,
  }) => {
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, NEW_ID, messages);
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: callMocks(),
      waitForUrl: /\/telefun/,
      expectedThirdPartyHosts: ["randomuser.me"],
    });
    await startCall(page);

    const prompt = configuredInstructions(messages);
    expect(prompt).toContain("TUNTUTAN DAN PENOLAKAN SOLUSI (MARAH)");
    expect(prompt).toContain(
      "Solusi pertama dari agen JANGAN langsung diterima",
    );
    expect(prompt).toContain("bukan berarti menerima solusinya");
    expect(prompt).toContain("berat hati");
    // Tuntutan tetap dari skenario dan tidak berdebat tanpa akhir.
    expect(prompt).toContain("Jangan mengarang tuntutan");
    expect(prompt).toContain("Jangan berdebat tanpa akhir");
    // Percaya penjelasan agen tidak lagi berarti langsung menerima.
    expect(prompt).not.toContain("kamu percaya saja");
    // Domisili bawaan sudah spesifik, jadi tidak ada aturan probing domisili.
    expect(prompt).not.toContain("DOMISILI BELUM SPESIFIK");
    expectHermetic(audit);
  });

  test("domisili provinsi: konsumen menyebut Lampung dulu, kota/kabupaten spesifik hanya saat diprobing", async ({
    page,
  }) => {
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, NEW_ID, messages);
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: callMocks({
        identitySettings: {
          displayName: "Rahmat Hidayat",
          gender: "male",
          phoneNumber: "0812-1111-2222",
          city: "Lampung",
          signatureName: "",
          voiceName: "",
        },
      }),
      waitForUrl: /\/telefun/,
      expectedThirdPartyHosts: ["randomuser.me"],
    });
    await startCall(page);

    const prompt = configuredInstructions(messages);
    expect(prompt).toContain("LOKASI/DOMISILI: Lampung\n");
    const contract = prompt.indexOf("KONTRAK VERIFIKASI IDENTITAS");
    const block = prompt.indexOf("DOMISILI BELUM SPESIFIK:");
    expect(block).toBeGreaterThan(contract);
    // Kontrak verifikasi memberi ruang menjawab probing kota/kabupaten.
    expect(prompt).toContain("kecuali rincian kota/kabupaten");
    const domicile = prompt.slice(block, prompt.indexOf("\n\n", block));
    expect(domicile).toContain('"Lampung"');
    expect(domicile).toContain('"Bandar Lampung"');
    expect(domicile).toContain("sebelum agen menanyakannya");
    expect(domicile).toContain("sampai akhir panggilan");
    // Konsumen marah tetap menjawab probing, tidak menolak memberi data.
    expect(domicile).toContain("tetap jawab");
    expectHermetic(audit);
  });

  for (const consumerTypeId of ["marah", "ramah"]) {
    test(`sapaan agen netral (${consumerTypeId}): konsumen tidak menebak agen pria atau wanita`, async ({
      page,
    }) => {
      const messages: Record<string, unknown>[] = [];
      await mockTelefunVoiceServer(page, NEW_ID, messages);
      const audit = await openHermeticShell(page, {
        path: "/telefun",
        apiMocks: callMocks({ preferredConsumerTypeId: consumerTypeId }),
        waitForUrl: /\/telefun/,
        expectedThirdPartyHosts: ["randomuser.me"],
      });
      await startCall(page);

      const prompt = configuredInstructions(messages);
      expect(prompt).toContain(`EMOSI: ${consumerTypeId.toUpperCase()}`);
      const rule = prompt
        .split("\n")
        .find((line) => line.startsWith("SAPAAN UNTUK AGEN:"));
      expect(rule).toContain('"Kak"');
      expect(rule).toContain("Jangan menebak");
      // Di luar aturan itu tidak ada sapaan bergender untuk agen yang bisa ditiru.
      const rest = prompt.replace(rule!, "");
      expect(rest).not.toMatch(/\b(Mas|Mbak|Pak|Bu)\b/);
      expect(rest).toContain("KARAKTER: ");
      expectHermetic(audit);
    });
  }

  test("sinyal hold: urutan hold dan lamanya dikirim ke konsumen saat hold selesai", async ({
    page,
  }) => {
    await page.clock.install();
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, NEW_ID, messages);
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: callMocks(),
      waitForUrl: /\/telefun/,
      expectedThirdPartyHosts: ["randomuser.me"],
    });
    const call = await startCall(page);
    expect(holdEndCues(messages)).toEqual([]);

    // Hold pertama melewati batas 1 menit.
    await call.getByRole("button", { name: "Tahan" }).click();
    await expect(call.getByText("Panggilan ditahan")).toBeVisible();
    await page.clock.fastForward(62_000);
    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect.poll(() => holdEndCues(messages).length).toBe(1);

    // Hold kedua singkat.
    await call.getByRole("button", { name: "Tahan" }).click();
    await expect(call.getByText("Panggilan ditahan")).toBeVisible();
    await page.clock.fastForward(5_000);
    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect.poll(() => holdEndCues(messages).length).toBe(2);

    const [first, second] = holdEndCues(messages);
    expect(first).toContain("hold ke-1");
    expect(first).toContain("LAMA");
    expect(first).toContain("kesal");
    expect(second).toContain("hold ke-2");
    expect(second).toContain("masih wajar");
    for (const cue of [first, second]) {
      expect(cue).toContain("satu kalimat pendek");
      expect(cue).toContain("Jangan sebutkan marker");
      expect(cue).not.toMatch(/\d+\s*detik/);
    }
    expectHermetic(audit);
  });

  test("tantangan percakapan lama yang tersimpan diabaikan: tidak masuk instruksi maupun sesi", async ({
    page,
  }) => {
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, NEW_ID, messages);
    const sessionBodies: unknown[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/telefun/sessions")
      )
        sessionBodies.push(request.postDataJSON());
    });
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: callMocks({
        simulationChallengeTypes: [
          "interruption",
          "misunderstanding",
          "unclear_voice",
        ],
      }),
      waitForUrl: /\/telefun/,
      expectedThirdPartyHosts: ["randomuser.me"],
    });
    await startCall(page);

    const prompt = configuredInstructions(messages);
    expect(prompt).not.toContain("TANTANGAN PERCAKAPAN");
    expect(prompt).not.toContain("MENYELA KONDISIONAL");
    expect(prompt).not.toContain("pernyataan ambigu");
    expect(prompt).not.toContain("Minta pengulangan");
    expect(sessionBodies).toHaveLength(1);
    expect(sessionBodies[0]).not.toHaveProperty("disruption_config");
    expectHermetic(audit);
  });
});
