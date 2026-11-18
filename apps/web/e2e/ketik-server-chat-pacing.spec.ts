import { expect, test } from "@playwright/test";
import { expectHermetic } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { session, openTypingChat } from "./helpers/ketikServerChatHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

test("consumer bubbles appear together after reload resumes a held response", async ({
  page,
}) => {
  await page.clock.install();
  const chat = await openTypingChat(page, {
    responseMessages: [
      { id: "first", text: "Saya sudah baca penjelasan untuk tagihan saya." },
      { id: "second", text: "Mohon dibantu untuk pengecekan selanjutnya." },
    ],
  });
  const first = chat.room.getByText(
    "Saya sudah baca penjelasan untuk tagihan saya.",
    { exact: true },
  );
  const second = chat.room.getByText(
    "Mohon dibantu untuk pengecekan selanjutnya.",
    { exact: true },
  );
  const generated = page.waitForResponse((response) =>
    response.url().endsWith("/respond"),
  );
  await chat.input.fill("Mohon tunggu, saya cek tagihannya.");
  await chat.input.press("Enter");
  await page.clock.runFor(3200);
  expect((await generated).ok()).toBe(true);
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);

  await page.reload();
  await expect(chat.room).toBeVisible();
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);
  expect(chat.responseCalls()).toBe(1);

  await page.clock.runFor(2000);
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  expect(chat.responseCalls()).toBe(1);
  expectHermetic(chat.audit);
});

test("a send during each hold restarts the realistic quiet window and only regenerates once", async ({
  page,
}) => {
  await page.clock.install();
  const initial = session();
  const chat = await openTypingChat(page, {
    initial: {
      ...initial,
      config: { ...initial.config, responsePacingMode: "realistic" },
    },
  });
  const send = async (text: string) => {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/messages"),
    );
    await chat.input.fill(text);
    await chat.input.press("Enter");
    expect((await saved).ok()).toBe(true);
    await expect(chat.room.getByText(text, { exact: true })).toBeVisible();
  };
  const stale = chat.room.getByText("Balasan untuk Satu", { exact: true });
  const fresh = chat.room.getByText("Balasan untuk Satu dan Dua", {
    exact: true,
  });
  await send("Satu");
  await page.clock.runFor(8000);
  await expect.poll(() => chat.responseCalls()).toBe(1);
  await expect(stale).toHaveCount(0);
  await send("Dua");
  await page.clock.runFor(6500);
  expect(chat.responseCalls()).toBe(1);
  await expect(stale).toHaveCount(0);
  await expect(fresh).toHaveCount(0);
  await page.clock.runFor(1500);
  await expect.poll(() => chat.responseCalls()).toBe(2);
  await send("Tiga");
  await page.clock.runFor(6500);
  expect(chat.responseCalls()).toBe(2);
  await expect(fresh).toHaveCount(0);
  await page.clock.runFor(2500);
  await expect(fresh).toBeVisible();
  await expect(stale).toHaveCount(0);
  expect(chat.responseCalls()).toBe(2);
  expectHermetic(chat.audit);
});

test("the consumer waits while the agent is still typing a follow-up", async ({
  page,
}) => {
  await page.clock.install();
  const chat = await openTypingChat(page);
  const { input, room } = chat;
  await input.fill("Pesan pertama");
  await input.press("Enter");
  await expect(room.getByText("Pesan pertama", { exact: true })).toBeVisible({
    timeout: 1000,
  });
  await input.fill("Saya masih menyiapkan pesan lanjutan");
  await page.clock.runFor(8000);

  expect(chat.responseAt()).toBeNull();
  await page.clock.runFor(4500);
  await expect.poll(() => chat.responseAt()).not.toBeNull();
  expectHermetic(chat.audit);
});

test("clearing the draft releases the consumer", async ({ page }) => {
  await page.clock.install();
  const chat = await openTypingChat(page);
  await chat.input.fill("Pesan pertama");
  await chat.input.press("Enter");
  await chat.input.fill("Saya sedang menulis lanjutan");
  await page.clock.runFor(3200);
  expect(chat.responseAt()).toBeNull();

  const clearedAt = Date.now();
  await chat.input.fill("");
  await page.clock.runFor(20);
  await expect.poll(() => chat.responseAt(), { timeout: 1500 }).not.toBeNull();
  expect(chat.responseAt()! - clearedAt).toBeLessThanOrEqual(1000);
  expectHermetic(chat.audit);
});

test("the consumer interrupts once the typing hold runs out", async ({
  page,
}) => {
  const initial = session();
  const chat = await openTypingChat(page, {
    initial: {
      ...initial,
      config: {
        ...initial.config,
        consumerType: { ...initial.config.consumerType, id: "custom-test" },
      },
    },
  });
  await chat.input.fill("Pesan pertama");
  await chat.input.press("Enter");
  const sentAt = Date.now();
  await chat.input.pressSequentially("abcdefghijklmnopqrstuv", { delay: 850 });

  await expect.poll(() => chat.responseAt(), { timeout: 1000 }).not.toBeNull();
  const responseDelay = chat.responseAt()! - sentAt;
  expect(responseDelay).toBeGreaterThanOrEqual(17000);
  expect(responseDelay).toBeLessThanOrEqual(19000);
  expect(chat.responseCalls()).toBe(1);
  expectHermetic(chat.audit);
});

test("a ready reply stays hidden while the agent types", async ({ page }) => {
  await page.clock.install();
  const initial = session({
    messages: [
      {
        id: "consumer-greeting",
        sender: "consumer",
        text: "Halo kak, saya mau tanya.",
        timestamp: new Date().toISOString(),
      },
    ],
  });
  const longReply =
    "Saya sudah membaca penjelasannya dan sedang memastikan rincian laporan ini sebelum menentukan langkah yang perlu dilakukan.";
  const chat = await openTypingChat(page, {
    initial,
    responseMessages: [{ id: "reply-ready", text: longReply }],
  });
  const reply = chat.room.getByText(longReply, { exact: true });
  await chat.input.fill("Saya jelaskan langkahnya dulu");
  await chat.input.press("Enter");
  await page.clock.runFor(3500);
  await chat.responseStarted;
  await chat.input.fill("Draf lanjutan");
  await page.clock.runFor(8000);
  await expect(reply).toHaveCount(0);
  await page.clock.runFor(4500);
  await expect(reply).toBeVisible();
  expectHermetic(chat.audit);
});

test("a hurried consumer in realistic mode still waits after a send", async ({
  page,
}) => {
  const initial = session();
  const chat = await openTypingChat(page, {
    initial: {
      ...initial,
      config: {
        ...initial.config,
        consumerType: { ...initial.config.consumerType, id: "terburu-buru" },
        responsePacingMode: "realistic",
      },
    },
  });
  await chat.input.fill("Pesan singkat");
  await chat.input.press("Enter");
  const sentAt = Date.now();

  await expect.poll(() => chat.responseAt(), { timeout: 11000 }).not.toBeNull();
  const responseDelay = chat.responseAt()! - sentAt;
  expect(responseDelay).toBeGreaterThanOrEqual(6000);
  expect(responseDelay).toBeLessThanOrEqual(10000);
  expectHermetic(chat.audit);
});
