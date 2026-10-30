import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { readFile } from "node:fs/promises";
import {
  openHermeticShell,
  expectHermetic,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  expectPageFooters,
  expectTextBasedPdf,
  printedReadBack,
  readPdfInfo,
  readPdfPages,
  recordDownloadBlobs,
} from "./helpers/pdfReadback";

const id = "33000000-0000-4000-8000-000000000001";
const date = "2026-10-20T02:00:00.000Z";
const messages = [
  {
    id: "m1",
    sender: "consumer",
    text: "Tagihan saya dobel.\nMohon cek 😀",
    timestamp: date,
  },
  {
    id: "m2",
    sender: "agent",
    text: "Baik Bu, saya cek tagihn Ibu.",
    timestamp: date,
  },
  { id: "m3", sender: "consumer", text: "Tolong cepat ya.", timestamp: date },
  { id: "sys", sender: "system", text: "Sesi berlanjut.", timestamp: date },
  {
    id: "img",
    sender: "consumer",
    text: "Bukti transaksi [SEND_IMAGE:0]",
    timestamp: date,
  },
  ...Array.from({ length: 28 }, (_, i) => ({
    id: `extra${i}`,
    sender: i % 2 ? "agent" : "consumer",
    text: `Pesan tambahan ${i} untuk lampiran percakapan.`,
    timestamp: date,
  })),
];
const session = {
  id,
  date,
  scenarioTitle: "Tagihan ganda",
  consumerName: "Bu Rina",
  transcriptProvenance: "legacy",
  reviewStatus: "completed",
  finalScore: 82,
  empathyScore: 80,
  probingScore: 64,
  resolutionScore: 78,
  typoScore: 90,
  complianceScore: 85,
  previousFinalScore: 76,
  simulationSubject: {
    type: "participant",
    participantId: "p1",
    displayName: "Andi Peserta",
    batchName: "Batch 12",
    team: "Tim Alpha",
  },
  messages,
  attachments: [{ index: 0, src: "/sample.png", alt: "Bukti tagihan" }],
};
const scores = {
  final: 82,
  empathy: 80,
  probing: 64,
  resolution: 78,
  typo: 90,
  compliance: 85,
};
const education = {
  caseCore: "Tagihan tertagih dua kali.",
  dimensionGuidance: [
    {
      key: "probing",
      label: "Probing",
      score: 64,
      verdict: "Cukup",
      priorityRank: 1,
      source: "transcript",
      evidence: [{ messageId: "m2", quote: "saya cek" }],
      diagnosis: "Kurang menggali.",
      howToFix: "Tanyakan rincian.",
      exampleRewrite: "Kapan transaksi?",
    },
  ],
  overallNextSteps: ["Konfirmasi data sebelum solusi."],
  typosEnriched: [
    {
      messageId: "m2",
      originalWord: "tagihn",
      correctedWord: "tagihan",
      severity: "minor",
      whyWrong: "Huruf a tertinggal.",
    },
  ],
  consumerPoints: [
    {
      messageId: "m1",
      quote: "Tagihan saya dobel",
      summary: "Tagihan ganda",
      status: "partial",
      reason: "Belum menjelaskan penyebab.",
      answerMessageId: "m2",
      answerQuote: "saya cek tagihn Ibu",
    },
    {
      messageId: "m3",
      quote: "Tolong cepat ya",
      summary: "Penanganan cepat",
      status: "unanswered",
      reason: "Tidak ada estimasi.",
      answerMessageId: null,
      answerQuote: null,
    },
  ],
  agentNotes: [
    {
      messageId: "m2",
      quote: "saya cek tagihn Ibu",
      dimension: "resolution",
      verdict: "fix",
      note: "Belum ada estimasi.",
      example: "Saya kabari dalam 10 menit.",
    },
    {
      messageId: "m2",
      quote: "saya cek",
      dimension: "probing",
      verdict: "fix",
      note: "Belum menggali.",
      example: "Kapan transaksi terjadi?",
    },
    {
      messageId: "m2",
      quote: "Baik Bu",
      dimension: "empathy",
      verdict: "good",
      note: "Sapaan sopan.",
      example: null,
    },
  ],
  verification: {
    status: "unconfirmed",
    missedBeforeMessageId: "m2",
    fields: [
      {
        field: "email",
        value: "a@gnail.com",
        reason: "Domain mirip gmail.com",
        status: "unconfirmed",
        agentMessageId: "m2",
        agentQuote: "saya cek",
      },
    ],
  },
};
function mocks(
  status = "completed",
  legacy = false,
  participantName = "Andi Peserta",
): ApiMock[] {
  const detail = {
    sessionId: id,
    scores,
    typos: [
      {
        id: "t1",
        sessionId: id,
        messageId: "m2",
        originalWord: "tagihn",
        correctedWord: "tagihan",
        severity: "minor",
      },
    ],
    review: {
      id: "r1",
      sessionId: id,
      aiSummary: "Agen empatik, verifikasi terlambat.",
      strengths: ["Menyapa dengan nama"],
      weaknesses: ["Verifikasi terlambat"],
      coachingFocus: ["Verifikasi identitas di awal"],
      createdAt: date,
      education: legacy ? { dimensionGuidance: [] } : education,
    },
  };
  return [
    {
      method: "GET",
      path: "/api/v1/ketik/settings",
      body: { success: true, data: DEFAULT_KETIK_SETTINGS },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/assignments/self",
      body: {
        success: true,
        data: { assignment: null, recipientSettingsVersion: "absent" },
      },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history/summary",
      body: {
        success: true,
        data: {
          sessionsThisMonth: 1,
          reviewing: 0,
          average: null,
          focus: null,
          recent: [],
          followUps: [],
        },
      },
    },
    {
      method: "GET",
      path: `/api/v1/ketik/history/${id}`,
      body: {
        success: true,
        data: {
          ...session,
          simulationSubject: {
            ...session.simulationSubject,
            displayName: participantName,
          },
          reviewStatus: status === "failed-kept" ? "completed" : status,
        },
      },
    },
    {
      method: "GET",
      path: `/api/v1/ketik/review/${id}`,
      body: { success: true, data: detail },
    },
    {
      method: "GET",
      path: `/api/v1/ketik/review/status/${id}`,
      body: {
        success: true,
        data: {
          status: status === "failed-kept" ? "failed" : status,
          resultReady: status === "completed" || status === "failed-kept",
          scores:
            status === "completed" || status === "failed-kept" ? scores : null,
          previousKept: status === "failed-kept",
        },
      },
    },
  ];
}
async function open(
  page: Page,
  status = "completed",
  legacy = false,
  participantName = "Andi Peserta",
) {
  return openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: mocks(status, legacy, participantName),
  });
}
async function download(page: Page) {
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
    timeout: 20_000,
  });
  const button = page.getByRole("button", { name: "Unduh PDF" });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`pdf-button-${width}.png`),
    });
  }
  const blobs = await recordDownloadBlobs(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PDF" }).click();
  const file = await pending;
  return {
    file,
    bytes: await readFile((await file.path())!),
    blobs: await blobs(),
    result,
  };
}
test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});
test("PDF sesi memuat telaah dan transkrip dengan skor yang sama", async ({
  page,
}, testInfo) => {
  const audit = await open(page);
  const { file, bytes, blobs, result } = await download(page);
  expect(file.suggestedFilename()).toBe(`ketik_telaah_${id}.pdf`);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(
    blobs.some(
      (blob) => blob.type === "application/pdf" && blob.size === bytes.length,
    ),
  ).toBe(true);
  const info = readPdfInfo(bytes);
  expect(info.Title).toContain("KETIK");
  expect(info.Author).toBe("KETIK");
  expect(info.Subject).toBe(`Telaah sesi ${id}`);
  expect(info.Creator).toBe("Trainers SuperApp - Hasil Telaah KETIK");
  expect(bytes.toString("latin1")).toMatch(
    /\/MediaBox\s*\[\s*0\s+0\s+595\.\d+\s+841\.\d+/,
  );
  const pages = readPdfPages(bytes);
  expect(pages.texts.length).toBeGreaterThanOrEqual(2);
  expectTextBasedPdf(bytes, pages);
  expectPageFooters(pages.texts);
  const text = printedReadBack(pages.texts);
  for (const value of [
    "Andi Peserta",
    "82",
    "Baik",
    "Ringkasan",
    "Perbaiki dulu",
    "Pertanyaan konsumen",
    "Verifikasi data",
    "Sudah baik",
    "Ejaan",
    "Alasan skor",
    "Langkah berikutnya",
    "Lampiran",
    "saya cek tagihn Ibu",
    "Sebaiknya: Saya kabari dalam 10 menit.",
    "Sebagian",
    "Belum terjawab",
    "tagihn",
    "tagihan",
    "Konfirmasi data sebelum solusi.",
    "Pesan tambahan 27",
    "[Gambar: Bukti tagihan]",
    "Sesi berlanjut.",
    "[U+1F600]",
  ])
    expect(text).toContain(value);
  const appendix = pages.texts.find((pageText) =>
    pageText.includes("Lampiran: Transkrip"),
  );
  expect(appendix).toMatch(/Pesan 1 · Konsumen/);
  expect(appendix).toMatch(/Pesan 2 · Agen/);
  expect(appendix).toMatch(/Sistem .* Sesi berlanjut/);
  expect(appendix).toMatch(/Pesan 4 · Konsumen .* Bukti transaksi/);
  const runs = pages.runs.flat().map((run) => run.text);
  const firstLine = runs.findIndex((run) => run === "Tagihan saya dobel.");
  expect(firstLine).toBeGreaterThanOrEqual(0);
  expect(runs[firstLine + 1]).toContain("Mohon cek");
  expect(await result.getByTestId("ketik-final-score").innerText()).toBe("82");
  await expect(result.getByText("Baik", { exact: true }).first()).toBeVisible();
  await file.saveAs(testInfo.outputPath("ketik-sample.pdf"));
  expectHermetic(audit);
});
test("telaah lama tetap diunduh dengan penjelasan yang jujur", async ({
  page,
}) => {
  const audit = await open(page, "completed", true);
  const { bytes } = await download(page);
  expect(printedReadBack(readPdfPages(bytes).texts)).toContain(
    "Belum tersedia untuk telaah ini",
  );
  expectHermetic(audit);
});
for (const status of ["pending", "processing", "failed"])
  test(`telaah ${status} tidak dapat diunduh`, async ({ page }) => {
    const audit = await open(page, status);
    await expect(
      page.getByRole("region", { name: "Hasil telaah" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        status === "pending"
          ? "Belum ditelaah"
          : status === "processing"
            ? "Sedang ditelaah AI"
            : "Telaah belum berhasil",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 20_000 });
    const button = page.getByRole("button", { name: "Unduh PDF" });
    if (await button.count()) await expect(button).toBeDisabled();
    expectHermetic(audit);
  });
test("gagal memuat generator menampilkan error dan tidak mengunduh", async ({
  page,
}) => {
  const audit = await open(page);
  await expect(page.getByTestId("ketik-final-score")).toHaveText("82", {
    timeout: 20_000,
  });
  await page.route("**/src/routes/ketik/utils/ketikReviewPdf.ts*", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  const button = page.getByRole("button", { name: "Unduh PDF" });
  await button.click();
  await expect(
    page.getByText("PDF belum bisa dibuat. Coba lagi."),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  expect(downloads).toBe(0);
  expectHermetic(audit);
});

test("gagal memuat jsPDF tidak menghasilkan unduhan", async ({ page }) => {
  const audit = await open(page);
  await expect(page.getByTestId("ketik-final-score")).toHaveText("82", {
    timeout: 20_000,
  });
  let blocked = 0;
  await page.route("**/*jspdf*", async (route) => {
    blocked++;
    await route.abort("failed");
  });
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  const button = page.getByRole("button", { name: "Unduh PDF" });
  await button.click();
  await expect(
    page.getByText("PDF belum bisa dibuat. Coba lagi."),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  expect(blocked).toBeGreaterThan(0);
  expect(downloads).toBe(0);
  expectHermetic(audit);
});

test("unduhan nonaktif selama telaah ulang berjalan", async ({ page }) => {
  const audit = await open(page);
  await expect(page.getByTestId("ketik-final-score")).toHaveText("82", {
    timeout: 20_000,
  });
  let release: (() => void) | undefined;
  let started = false;
  await page.route("**/api/v1/ketik/review", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    started = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      status: 202,
      json: { success: true, data: { status: "queued" } },
    });
  });
  try {
    const button = page.getByRole("button", { name: "Unduh PDF" });
    await expect(button).toBeEnabled();
    await page
      .getByRole("region", { name: "Hasil telaah" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await page
      .getByRole("dialog", { name: "Telaah ulang sesi ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await expect.poll(() => started).toBe(true);
    await expect(button).toBeDisabled();
    await expect(
      page.getByRole("region", { name: "Hasil telaah" }),
    ).toContainText("Memeriksa permintaan telaah");
    expectHermetic(audit);
  } finally {
    release?.();
  }
});

test("header PDF menjaga jarak saat nama peserta panjang", async ({ page }) => {
  const participantName = "Peserta Latihan ".repeat(25).trim();
  const audit = await open(page, "completed", false, participantName);
  const { bytes } = await download(page);
  const pages = readPdfPages(bytes);
  for (const content of pages.contents) {
    const positions = [
      ...content.matchAll(
        /BT\s+[\s\S]*?([-\d.]+)\s+([-\d.]+)\s+Td\s*\([^)]*\)\s*Tj\s*ET/g,
      ),
    ];
    expect(positions.length).toBeGreaterThanOrEqual(2);
    expect(Number(positions[1][1])).toBeGreaterThan(150);
  }
  expect(printedReadBack(pages.texts).replace(/\s+/g, "")).toContain(
    participantName.replace(/\s+/g, ""),
  );
  expectHermetic(audit);
});

test("hasil lama yang dipertahankan setelah telaah ulang gagal tidak dapat diunduh", async ({
  page,
}) => {
  const audit = await open(page, "failed-kept");
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
    timeout: 20_000,
  });
  await expect(result).toContainText("Hasil sebelumnya tetap ditampilkan");
  await expect(page.getByRole("button", { name: "Unduh PDF" })).toBeDisabled();
  expectHermetic(audit);
});

test("unduhan menunggu hasil telaah selesai dimuat", async ({ page }) => {
  let release: (() => void) | undefined;
  let requested = false;
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: mocks(),
    beforeNavigate: async (target) => {
      await target.route(`**/api/v1/ketik/review/${id}`, async (route) => {
        requested = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.fallback();
      });
    },
  });
  try {
    await expect.poll(() => requested, { timeout: 20_000 }).toBe(true);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result).toContainText("Memuat hasil telaah");
    const button = page.getByRole("button", { name: "Unduh PDF" });
    await expect(button).toBeDisabled();
    release?.();
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await expect(button).toBeEnabled();
    expectHermetic(audit);
  } finally {
    release?.();
  }
});
