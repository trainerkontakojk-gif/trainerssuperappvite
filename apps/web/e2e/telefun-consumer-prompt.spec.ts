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

function callMocks(): ApiMock[] {
  return [
    ...telefunMocks([]),
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
    expectHermetic(audit);
  });

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
});
