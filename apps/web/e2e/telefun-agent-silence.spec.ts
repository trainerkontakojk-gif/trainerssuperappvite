import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  expectHermetic,
  openHermeticShell,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  mockTelefunAvatar,
  mockTelefunVoiceServer,
  telefunMocks,
} from "./helpers/telefunFixtures";

const SESSION_ID = "telefun-agent-silence-1";
const fixtureDir = mkdtempSync(path.join(tmpdir(), "telefun-agent-silence-"));
const silentMicWavPath = path.join(fixtureDir, "silent-mic.wav");

function createSilentMicWav(sampleRate = 16_000, seconds = 12): Buffer {
  const samples = sampleRate * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

writeFileSync(silentMicWavPath, createSilentMicWav());
test.afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${silentMicWavPath}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
  permissions: ["microphone"],
});

function callMocks(settings: unknown = {}) {
  return [
    ...telefunMocks([], settings),
    {
      method: "POST" as const,
      path: "/api/v1/telefun/sessions",
      body: {
        success: true,
        data: { id: SESSION_ID, simulationSubject: null },
      },
    },
    {
      method: "GET" as const,
      path: "/api/v1/ai/usage/summary",
      body: { success: true, data: null },
    },
  ];
}

async function openTelefun(page: Page) {
  return openHermeticShell(page, {
    path: "/telefun",
    apiMocks: callMocks({
      preferredConsumerTypeId: "marah",
      identitySettings: {
        displayName: "Sari Wulandari",
        gender: "female",
        phoneNumber: "0812-1111-2222",
        city: "Jakarta",
        signatureName: "",
        voiceName: "",
      },
    }),
    waitForUrl: /\/telefun/,
    beforeNavigate: (target) => mockTelefunAvatar(target),
  });
}

async function startCall(page: Page) {
  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
  const start = picker.getByRole("button", { name: "Mulai panggilan" });
  await expect(start).toBeEnabled({ timeout: 15000 });
  await start.click();
  return page.getByRole("region", { name: "Panggilan" });
}

function installInputWorkletProbe() {
  const OriginalAudioWorkletNode = window.AudioWorkletNode;
  class CapturedAudioWorkletNode extends OriginalAudioWorkletNode {
    constructor(...args: ConstructorParameters<typeof AudioWorkletNode>) {
      super(...args);
      (window as any).__telefunInputWorklet = this;
    }
  }
  window.AudioWorkletNode = CapturedAudioWorkletNode;
}

function agentSilenceCues(messages: Record<string, unknown>[]) {
  return messages
    .map((message, index) => ({
      index,
      text: (message as { realtimeInput?: { text?: unknown } }).realtimeInput
        ?.text,
    }))
    .filter(
      (entry): entry is { index: number; text: string } =>
        typeof entry.text === "string" &&
        entry.text.startsWith("[TELEFUN_CONTROL:AGENT_SILENT]"),
    );
}

function setupPrompt(messages: Record<string, unknown>[]): string {
  const setupMessage = messages.find((message) => "setup" in message);
  const setup = setupMessage?.setup as
    | { systemInstruction?: { parts?: Array<{ text?: unknown }> } }
    | undefined;
  return (
    setup?.systemInstruction?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("\n") ?? ""
  );
}

function isToneNote(message: Record<string, unknown>): boolean {
  const clientContent = message.clientContent as
    | { turns?: Array<{ parts?: Array<{ text?: unknown }> }> }
    | undefined;
  return (
    clientContent?.turns
      ?.flatMap((turn) => turn.parts ?? [])
      .some(
        (part) =>
          typeof part.text === "string" &&
          part.text.startsWith("[TELEFUN_CONTROL:TONE]"),
      ) ?? false
  );
}

function openingAudioResponse() {
  return {
    sampleRateHz: 24000,
    chunks: [new Uint8Array(480 * 2)],
    transport: "inline" as const,
    afterFirstInput: true,
  };
}

async function pauseClockBeforeModelTurn(page: Page): Promise<void> {
  const pauseAt = await page.evaluate(() => Date.now() + 100);
  await page.clock.pauseAt(pauseAt);
}

test.describe("Telefun teguran saat agen diam (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("diam 5 detik memicu satu teguran dengan catatan TONE; bicara lalu diam memulai jeda baru", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.addInitScript(installInputWorkletProbe);
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, SESSION_ID, messages, {
      audioResponse: openingAudioResponse(),
      beforeAudioResponse: () => pauseClockBeforeModelTurn(page),
    });
    const audit = await openTelefun(page);
    const call = await startCall(page);
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    expect(setupPrompt(messages)).toContain(
      "[TELEFUN_CONTROL:AGENT_SILENT]",
    );

    await page.clock.fastForward(4_900);
    expect(agentSilenceCues(messages)).toHaveLength(0);
    await page.clock.fastForward(100);
    await expect.poll(() => agentSilenceCues(messages)).toHaveLength(1);
    const firstCue = agentSilenceCues(messages)[0]!;
    expect(isToneNote(messages[firstCue.index - 1]!)).toBe(true);

    await page.clock.fastForward(5_000);
    expect(agentSilenceCues(messages)).toHaveLength(1);
    await page.evaluate(() => {
      const worklet = (window as any).__telefunInputWorklet as AudioWorkletNode;
      const receive = worklet?.port.onmessage;
      if (typeof receive !== "function") throw new Error("input worklet not ready");
      const speech = new Float32Array(1024);
      for (let index = 0; index < speech.length; index += 1) {
        speech[index] = 0.25 * Math.sin((2 * Math.PI * 440 * index) / 16_000);
      }
      receive({ data: speech } as MessageEvent);
      receive({ data: new Float32Array(1024) } as MessageEvent);
    });

    await page.clock.fastForward(4_900);
    expect(agentSilenceCues(messages)).toHaveLength(1);
    await page.clock.fastForward(100);
    await expect.poll(() => agentSilenceCues(messages)).toHaveLength(2);
    const secondCue = agentSilenceCues(messages)[1]!;
    expect(isToneNote(messages[secondCue.index - 1]!)).toBe(true);
    expectHermetic(audit);
  });

  test("tidak menagih agen selama hold", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    const messages: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, SESSION_ID, messages, {
      audioResponse: openingAudioResponse(),
      beforeAudioResponse: () => pauseClockBeforeModelTurn(page),
    });
    const audit = await openTelefun(page);
    const call = await startCall(page);
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    await call.getByRole("button", { name: "Tahan", exact: true }).click();
    await expect(call.getByText("Panggilan ditahan")).toBeVisible();
    await page.clock.fastForward(6_000);

    expect(agentSilenceCues(messages)).toHaveLength(0);
    expectHermetic(audit);
  });
});
