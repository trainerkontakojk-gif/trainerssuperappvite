import { expect, test } from "@playwright/test";
import { openHermeticShell, expectHermetic } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  id,
  session,
  base,
  openTypingChat,
} from "./helpers/ketikServerChatHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

test("consumer replies published by one response are still typed out one at a time", async ({
  page,
}) => {
  // Pesan pertama konsumen (sapaan) sudah ada, jadi balasan berikutnya memakai
  // tempo panjang/pendek sesuai panjang teks — bukan tempo sapaan.
  let live = session({
    messages: [
      {
        id: "consumer-greeting",
        sender: "consumer",
        text: "Halo kak, saya mau tanya soal laporan pinjol.",
        timestamp: new Date().toISOString(),
      },
    ],
  });
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    apiMocks: base,
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.route("**/api/v1/ketik/sessions", (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.route(`**/api/v1/ketik/sessions/${id}/messages`, async (route) => {
    const body = route.request().postDataJSON() as {
      requestId: string;
      text: string;
    };
    live = {
      ...live,
      version: live.version + 1,
      agentVersion: live.agentVersion + 1,
      awaitingResponse: true,
      messages: [
        ...live.messages,
        {
          id: body.requestId,
          sender: "agent",
          text: body.text,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    await route.fulfill({ json: { success: true, data: live } });
  });

  // Dua balasan dipublikasikan satu response, seperti hasil AI sungguhan.
  const longReply =
    "Baik Bapak, untuk laporan pinjol ilegal silakan simpan semua bukti ancaman, tangkapan layar pesan, dan nomor penagih. Jangan transfer dana apa pun, lalu laporkan melalui kanal resmi agar dapat ditindaklanjuti oleh satgas terkait.";
  const followUp = "Kalau sudah, saya bantu arahkan ke kanal pelaporannya.";
  let published = false;
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, async (route) => {
    live = {
      ...live,
      version: live.version + 2,
      awaitingResponse: false,
      messages: [
        ...live.messages,
        {
          id: "reply-long",
          sender: "consumer",
          text: longReply,
          timestamp: new Date().toISOString(),
        },
        {
          id: "reply-follow-up",
          sender: "consumer",
          text: followUp,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    await route.fulfill({ json: { success: true, data: live } });
    published = true;
  });

  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Mulai|Lanjutkan/ })
    .click();
  const room = page.getByRole("region", { name: "Ruang chat" });
  const input = room.getByRole("textbox", { name: "Tulis balasan" });
  const typing = room.getByLabel("Konsumen sedang mengetik");
  const first = room.getByText(longReply, { exact: true });
  const second = room.getByText(followUp, { exact: true });

  await input.fill(
    "Baik Bapak, simpan semua bukti ancaman dan tangkapan layar, jangan transfer dana apa pun, lalu laporkan lewat kanal resmi.",
  );
  await input.press("Enter");
  // Konsumen membaca dulu: belum ada tanda mengetik saat permintaan balasan
  // belum dikirim.
  await expect(typing).toHaveCount(0);
  await expect.poll(() => published, { timeout: 20000 }).toBe(true);

  // Sudah dipublikasikan, tetapi konsumen masih mengetik: tidak ada balasan
  // yang muncul sekaligus (balasan panjang baru tampil beberapa detik lagi).
  await expect(first).toHaveCount(0, { timeout: 1500 });
  await expect(second).toHaveCount(0);
  await expect(typing).toBeVisible();

  await expect(first).toBeVisible({ timeout: 15000 });
  // Balasan kedua menunggu tempo mengetiknya sendiri, bukan satu paket.
  await expect(second).toHaveCount(0);

  await expect(second).toBeVisible({ timeout: 8000 });
  await expect(first).toHaveCount(1);
  await expect(second).toHaveCount(1);
  await expect(typing).toHaveCount(0);
  expectHermetic(audit);
});

test("the consumer waits while the agent is still typing a follow-up", async ({
  page,
}) => {
  const chat = await openTypingChat(page);
  const { input, room } = chat;
  await input.fill("Pesan pertama");
  await input.press("Enter");
  await expect(room.getByText("Pesan pertama", { exact: true })).toBeVisible({
    timeout: 1000,
  });
  await input.pressSequentially("abcdefgh", { delay: 1000 });
  await input.press("i");
  const stoppedAt = Date.now();

  expect(chat.responseAt()).toBeNull();
  await expect.poll(() => chat.responseAt(), { timeout: 7000 }).not.toBeNull();
  const idleDelay = chat.responseAt()! - stoppedAt;
  expect(idleDelay).toBeGreaterThanOrEqual(4000);
  expect(idleDelay).toBeLessThanOrEqual(6000);
  expectHermetic(chat.audit);
});

test("clearing the draft releases the consumer", async ({ page }) => {
  const chat = await openTypingChat(page);
  await chat.input.fill("Pesan pertama");
  await chat.input.press("Enter");
  await chat.input.fill("Saya sedang menulis lanjutan");
  await page.waitForTimeout(1800);
  expect(chat.responseAt()).toBeNull();

  const clearedAt = Date.now();
  await chat.input.fill("");
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
  await chat.responseStarted;
  await chat.input.pressSequentially("abcdefgh", { delay: 1000 });
  await chat.input.press("i");
  const stoppedAt = Date.now();

  expect(await reply.count()).toBe(0);
  let revealedAt: number | null = null;
  await expect
    .poll(
      async () => {
        const count = await reply.count();
        if (count && revealedAt === null) revealedAt = Date.now();
        return count;
      },
      { timeout: 7000 },
    )
    .toBe(1);
  const idleDelay = revealedAt! - stoppedAt;
  expect(idleDelay).toBeGreaterThanOrEqual(4000);
  expect(idleDelay).toBeLessThanOrEqual(6000);
  expectHermetic(chat.audit);
});

test("realistic mode waits eight seconds after a send", async ({ page }) => {
  const initial = session();
  const chat = await openTypingChat(page, {
    initial: {
      ...initial,
      config: {
        ...initial.config,
        consumerType: { ...initial.config.consumerType, id: "custom-test" },
        responsePacingMode: "realistic",
      },
    },
  });
  await chat.input.fill("Pesan singkat");
  await chat.input.press("Enter");
  const sentAt = Date.now();

  await expect.poll(() => chat.responseAt(), { timeout: 11000 }).not.toBeNull();
  const responseDelay = chat.responseAt()! - sentAt;
  expect(responseDelay).toBeGreaterThanOrEqual(7000);
  expect(responseDelay).toBeLessThanOrEqual(10000);
  expectHermetic(chat.audit);
});
