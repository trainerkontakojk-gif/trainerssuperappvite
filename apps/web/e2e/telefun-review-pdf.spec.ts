import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  APP_ORIGIN,
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt } from "./helpers/sidakJadwalShiftingHarness";
import {
  ANNOTATED_ROW,
  FAILED_ROW,
  PENDING_ROW,
  REVIEWED_ROW,
  recordingMock,
  serveRecording,
  telefunMocks,
  type TelefunRow,
} from "./helpers/telefunFixtures";
import {
  expectPageFooters,
  expectTextBasedPdf,
  printedReadBack,
  readPdfInfo,
  readPdfPages,
  recordDownloadBlobs,
} from "./helpers/pdfReadback";

const id = REVIEWED_ROW.id;
const annotatedRow = {
  ...ANNOTATED_ROW,
  messages: (
    ANNOTATED_ROW.messages as Array<{
      speaker: string;
      text: string;
      startMs: number;
    }>
  ).map((entry, index) =>
    index === 0 ? { ...entry, text: `${entry.text}\nMohon bantu 😀` } : entry,
  ),
  simulationSubject: {
    type: "participant",
    participantId: "33000000-0000-4000-8000-000000000001",
    displayName: "Sinta Maharani",
    batchName: "Batch 7",
    team: "Tim B",
  },
};
const notes: ApiMock[] = [
  {
    method: "GET",
    path: `/api/v1/telefun/annotations/${id}`,
    body: {
      success: true,
      data: [
        {
          id: "n1",
          session_id: id,
          user_id: "user-1",
          timestamp_ms: 36000,
          category: "improvement_area",
          moment: "long_pause",
          text: "Catatan trainer: ganti eee dengan jeda.",
          is_manual: true,
          created_at: REVIEWED_ROW.created_at,
        },
      ],
    },
  },
  {
    method: "GET",
    path: `/api/v1/telefun/coaching-summary/${id}`,
    body: {
      success: true,
      data: {
        id: "s1",
        session_id: id,
        user_id: "user-1",
        recommendations: [{ text: "Latihan memberi estimasi.", priority: 5 }],
        generated_at: REVIEWED_ROW.created_at,
      },
    },
  },
];
async function open(
  page: Page,
  row: TelefunRow = annotatedRow,
  extra: ApiMock[] = notes,
) {
  return openHermeticShell(page, {
    path: `/telefun?sesi=${row.id}&tahap=telaah`,
    waitForUrl: /\/telefun/,
    apiMocks: [
      ...telefunMocks([row]),
      recordingMock(row.id),
      {
        method: "GET",
        path: `/api/v1/telefun/history/${row.id}`,
        body: { success: true, data: row },
      },
      ...extra,
    ],
    beforeNavigate: (p) => serveRecording(p),
  });
}
async function download(page: Page) {
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(result.getByTestId("telefun-voice-score")).toHaveText("7,6", {
    timeout: 20_000,
  });
  const button = page.getByRole("button", { name: "Unduh PDF" });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`pdf-button-${width}.png`),
    });
  }
  const blobReader = await recordDownloadBlobs(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PDF" }).click();
  const file = await pending;
  return {
    file,
    bytes: await readFile((await file.path())!),
    blobs: await blobReader(),
    result,
  };
}
test.beforeAll(async () => {
  await assertLocalDevOnlyTargetAt(APP_ORIGIN);
});
test("PDF Telefun memuat skor, catatan trainer dan transkrip lengkap", async ({
  page,
}, info) => {
  const audit = await open(page);
  expect(audit.mockedApi.some((x) => x.includes("/telefun/annotations/"))).toBe(
    false,
  );
  const { file, bytes, blobs, result } = await download(page);
  expect(file.suggestedFilename()).toBe(`telefun_telaah_${id}.pdf`);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(
    blobs.some((b) => b.type === "application/pdf" && b.size === bytes.length),
  ).toBe(true);
  const metadata = readPdfInfo(bytes);
  expect(metadata.Title).toContain("Telefun");
  expect(metadata.Author).toBe("Telefun");
  expect(metadata.Creator).toBe("Trainers SuperApp - Hasil Telaah Telefun");
  expect(bytes.toString("latin1")).toMatch(
    /\/MediaBox\s*\[\s*0\s+0\s+595\.\d+\s+841\.\d+/,
  );
  const pages = readPdfPages(bytes);
  expect(pages.texts.length).toBeGreaterThanOrEqual(2);
  expectTextBasedPdf(bytes, pages);
  expectPageFooters(pages.texts);
  const text = printedReadBack(pages.texts);
  for (const part of [
    "Sinta Maharani",
    "7,6",
    "Baik",
    "Ringkasan",
    "Perbaiki dulu",
    "Pertanyaan konsumen",
    "Alasan skor",
    "Sudah baik",
    "Catatan trainer",
    "Catatan trainer: ganti eee dengan jeda.",
    "Latihan memberi estimasi.",
    "Kecepatan bicara",
    "Intonasi",
    "Filler",
    "Konsumen",
    "Agen",
    "klaim asuransi saya ditolak",
    "Terus saya harus ngapain sekarang?",
    "[U+1F600]",
    "Percakapan dengan AI",
  ])
    expect(text).toContain(part);
  // Percakapan dengan AI tampil sesudah ringkasan dan sebelum rincian telaah.
  const conversationAt = text.indexOf("Percakapan dengan AI");
  expect(text.indexOf("Ringkasan")).toBeLessThan(conversationAt);
  expect(conversationAt).toBeLessThan(text.indexOf("Perbaiki dulu"));
  const conversation = text
    .slice(conversationAt, text.indexOf("Perbaiki dulu"))
    .replace(/\s+/g, " ");
  for (const part of [
    "Pesan 1 · Konsumen AI · Rina Susanti · 00.04",
    "Pesan 2 · Agen · Sinta Maharani · 00.11",
    "Terus saya harus ngapain sekarang?",
    "Poin A · Sebagian: Alasan klaim ditolak",
    "Poin B · Belum terjawab: Langkah berikutnya",
    "Catatan 1 · Sudah tepat: Menggali data perusahaan sebelum menjawab.",
    "Catatan 2 · Perlu diperbaiki: Konsumen tidak tahu berapa lama harus menunggu.",
    "Menjawab poin A",
    "Trainer · Perlu diperbaiki · Jeda panjang: Catatan trainer: ganti eee dengan jeda.",
  ])
    expect(conversation).toContain(part);
  expect(conversation).toMatch(
    /Hold \d\d\.\d\d – \d\d\.\d\d · 27 detik · dalam batas/,
  );
  // Catatan trainer menempel pada baris 00.36, bukan di akhir percakapan.
  expect(conversation.indexOf("Catatan trainer: ganti eee")).toBeLessThan(
    conversation.indexOf("Pesan 5 · Agen"),
  );
  const runs = pages.runs.flat().map((run) => run.text);
  const firstLine = runs.findIndex((run) =>
    run.includes("Halo, saya mau tanya"),
  );
  expect(firstLine).toBeGreaterThanOrEqual(0);
  expect(runs[firstLine + 1]).toContain("Mohon bantu [U+1F600]");
  await expect(result.getByText("Baik", { exact: true }).first()).toBeVisible();
  expect(audit.mockedApi.some((x) => x.includes("/telefun/annotations/"))).toBe(
    true,
  );
  await file.saveAs(info.outputPath("telefun-sample.pdf"));
  expectHermetic(audit);
});
test("telaah lama tanpa anotasi tetap menyajikan penjelasan jujur", async ({
  page,
}) => {
  const audit = await open(page, REVIEWED_ROW);
  const { bytes } = await download(page);
  expect(printedReadBack(readPdfPages(bytes).texts)).toContain(
    "Belum tersedia",
  );
  expectHermetic(audit);
});
for (const row of [
  PENDING_ROW,
  { ...PENDING_ROW, scoring_status: "processing" as const },
  FAILED_ROW,
])
  test(`status ${row.scoring_status} tidak bisa diunduh`, async ({ page }) => {
    const audit = await open(page, row, []);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result).toBeVisible();
    await expect(
      result.getByText(
        row.scoring_status === "pending"
          ? "Menunggu analisis"
          : row.scoring_status === "processing"
            ? "Sedang dianalisis"
            : "Analisis belum berhasil",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(result).not.toContainText("Skor suara");
    const button = page.getByRole("button", { name: "Unduh PDF" });
    if (await button.count()) await expect(button).toBeDisabled();
    expectHermetic(audit);
  });
test("gagal memuat catatan membatalkan unduhan dan tombol pulih", async ({
  page,
}) => {
  const failing = notes.map((n, i) =>
    i === 0
      ? {
          ...n,
          status: 500,
          body: { success: false, error: { message: "sentinel" } },
        }
      : n,
  );
  const audit = await open(page, ANNOTATED_ROW, failing);
  await expect(page.getByTestId("telefun-voice-score")).toBeVisible({
    timeout: 20_000,
  });
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  const button = page.getByRole("button", { name: "Unduh PDF" });
  await button.click();
  await expect(
    page.getByText("Catatan trainer belum bisa dimuat. Coba lagi."),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  expect(downloads).toBe(0);
  expectHermetic(audit);
});
test("gagal mengimpor jsPDF membatalkan unduhan", async ({ page }) => {
  const audit = await open(page);
  await expect(page.getByTestId("telefun-voice-score")).toBeVisible({
    timeout: 20_000,
  });
  let blocked = 0;
  await page.route("**/*jspdf*", async (route) => {
    blocked++;
    await route.abort();
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

test("panggilan lama yang hanya memiliki skor tetap dapat diunduh secara jujur", async ({
  page,
}) => {
  const audit = await open(page, { ...REVIEWED_ROW, voice_assessment: null });
  await expect(page.getByTestId("telefun-voice-score")).toHaveText("7,6", {
    timeout: 20_000,
  });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PDF" }).click();
  const bytes = await readFile((await (await pending).path())!);
  const text = printedReadBack(readPdfPages(bytes).texts);
  expect(text).toContain(
    "Rincian per aspek tidak tersimpan untuk panggilan lama ini.",
  );
  expect(text).toContain("Catatan trainer: ganti eee dengan jeda.");
  expectHermetic(audit);
});

test("PDF lama tidak diunduh bila telaah ulang dimulai saat catatan dimuat", async ({
  page,
}) => {
  const audit = await open(page);
  await expect(page.getByTestId("telefun-voice-score")).toBeVisible({
    timeout: 20_000,
  });
  let releaseNotes: (() => void) | undefined;
  let releaseRerun: (() => void) | undefined;
  let noteRequested = false;
  await page.route(`**/api/v1/telefun/annotations/${id}`, async (route) => {
    noteRequested = true;
    await new Promise<void>((resolve) => {
      releaseNotes = resolve;
    });
    await route.fallback();
  });
  await page.route(`**/api/v1/telefun/score/${id}/rerun`, async (route) => {
    await new Promise<void>((resolve) => {
      releaseRerun = resolve;
    });
    await route.fulfill({ status: 500, json: { success: false } });
  });
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  try {
    await page.getByRole("button", { name: "Unduh PDF" }).click();
    await expect.poll(() => noteRequested).toBe(true);
    await page
      .getByRole("region", { name: "Hasil telaah" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await page
      .getByRole("dialog", { name: "Telaah ulang panggilan ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await expect(
      page.getByRole("status", { name: "Telaah ulang berjalan" }),
    ).toBeVisible();
    releaseNotes?.();
    await expect(
      page.getByRole("button", { name: "Unduh PDF" }),
    ).toBeDisabled();
    await expect(
      page.waitForEvent("download", { timeout: 1500 }),
    ).rejects.toThrow();
    expect(downloads).toBe(0);
    expectHermetic(audit);
  } finally {
    releaseNotes?.();
    releaseRerun?.();
  }
});
