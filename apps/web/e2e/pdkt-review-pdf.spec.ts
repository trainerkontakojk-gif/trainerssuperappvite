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
  expectPageFooters,
  expectTextBasedPdf,
  printedReadBack,
  readPdfInfo,
  readPdfPages,
  recordDownloadBlobs,
} from "./helpers/pdfReadback";

const MAIL_AT = "2026-09-15T08:00:00.000Z";
const HISTORY_ID = "pdkt-pdf-history-1";
const MAIL_ID = "pdkt-pdf-mail-1";
const PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const inboundBody =
  "Saldo terpotong tetapi transaksi gagal.\n\nKapan saldo kembali? Mohon nomor tiket. 😀";
const reply =
  "Terima kasih, kami cek transaksinya.\nKami kabari paling lambat 2 hari kerja.";
const matchedQuote = "kami cek transaksinya";
const start = reply.indexOf(matchedQuote);
const evaluation = {
  score: 85,
  feedback: "Jawaban relevan dan jelas.",
  typos: [],
  clarityIssues: [],
  contentGaps: ["Belum menyebut kanal pengaduan resmi"],
  scoreBreakdown: {
    recipientDirectionScore: 90,
    normativeResponseScore: 70,
    clarityScore: 85,
    typoScore: 88,
    templateComplianceScore: 82,
  },
  consumerPoints: [
    {
      quote: "Kapan saldo kembali?",
      summary: "Waktu pengembalian saldo",
      status: "partial",
      reason: "Belum ada batas waktu.",
      start: inboundBody.indexOf("Kapan"),
      end: inboundBody.indexOf("Kapan") + "Kapan saldo kembali?".length,
      replyQuote: "kami",
      replyEnd: start + 4,
    },
    {
      quote: "Saldo terpotong tetapi transaksi gagal.",
      summary: "Transaksi gagal",
      status: "answered",
      reason: null,
      start: 0,
      end: "Saldo terpotong tetapi transaksi gagal.".length,
      replyQuote: "kami",
      replyEnd: start + 4,
    },
    {
      quote: "Mohon nomor tiket.",
      summary: "Nomor tiket pengaduan",
      status: "unanswered",
      reason: "Nomor tiket belum diberikan.",
      start: inboundBody.indexOf("Mohon"),
      end: inboundBody.indexOf("Mohon") + "Mohon nomor tiket.".length,
      replyQuote: null,
      replyEnd: null,
    },
  ],
  annotations: [
    {
      quote: matchedQuote,
      dimension: "normative",
      note: "Tambahkan pengantar sebelum masuk ke topik transaksi.",
      kind: "transition",
      example: "Selanjutnya, terkait transaksi Ibu, …",
      start,
      end: start + matchedQuote.length,
    },
  ],
  edu: {
    dimensionTips: { normative: "Tuliskan batas waktu tindak lanjut." },
    dimensionExplanations: {
      clarity: {
        reason: "Pembuka jelas tetapi kalimat tindak lanjut terlalu panjang.",
        quote: matchedQuote,
      },
    },
    actionItems: [
      {
        dimension: "normative",
        text: "Sebut kanal pengaduan resmi.",
        example: "Silakan hubungi 157.",
        quote: matchedQuote,
        priorityRank: 1,
      },
      { dimension: "clarity", text: "Pecah kalimat pembuka.", priorityRank: 2 },
    ],
    suggestedRewrite: {
      subject: "Re: Transaksi gagal",
      body: "Terima kasih, kami cek transaksi Ibu dalam 2 hari kerja.",
      highlights: ["dalam 2 hari kerja"],
    },
  },
  expectedAnswerAlignment: {
    category: "Hampir sesuai",
    reason: "Solusi benar tetapi tanpa batas waktu.",
  },
};
const mailDetail = {
  id: MAIL_ID,
  user_id: "user-1",
  status: "replied",
  created_at: MAIL_AT,
  last_activity_at: MAIL_AT,
  replied_at: "2026-09-15T08:20:00.000Z",
  sender_name: "Rina",
  sender_email: "rina@local.test",
  subject: "Transaksi gagal",
  snippet: inboundBody,
  history_id: HISTORY_ID,
  time_taken: 225,
  permissions: { can_delete: true },
  // Pembuat email berbeda dari pembalas: PDF mencetak pembalas.
  created_by_user: {
    id: "trainer-1",
    full_name: "Siti Pembuat",
    role: "Trainer",
    is_current_user: false,
  },
  simulationSubject: {
    type: "participant",
    participantId: "11111111-1111-4111-8111-111111111111",
    displayName: "Budi Pembalas",
    batchName: "Batch 9",
    team: "Tim Delta",
  },
  inbound_email: {
    id: "msg-1",
    from: "rina@local.test",
    to: "ojk@kontak157.go.id",
    subject: "Transaksi gagal",
    body: inboundBody,
    timestamp: MAIL_AT,
    isAgent: false,
    attachments: [PIXEL_PNG],
  },
  emails_thread: [
    {
      id: "reply-1",
      from: "agent@local.test",
      to: "rina@local.test",
      subject: "Re: Transaksi gagal",
      body: reply,
      timestamp: "2026-09-15T08:20:00.000Z",
      isAgent: true,
    },
  ],
};
type Status = "completed" | "processing" | "failed";
function mocks(status: Status = "completed"): ApiMock[] {
  const done = status === "completed";
  const history = {
    id: HISTORY_ID,
    timestamp: MAIL_AT,
    config: null,
    emails: [{ subject: mailDetail.subject }],
    evaluation: done ? evaluation : null,
    evaluationStatus: status,
    evaluation_status: status,
  };
  const {
    inbound_email: _inbound,
    emails_thread: _thread,
    ...listItem
  } = mailDetail;
  return [
    {
      method: "GET",
      path: `/api/v1/pdkt/mailbox/${MAIL_ID}`,
      body: { success: true, data: mailDetail },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/mailbox",
      body: { success: true, data: [listItem] },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/history",
      body: { success: true, data: [history] },
    },
    {
      method: "GET",
      path: `/api/v1/pdkt/history/eval/${HISTORY_ID}`,
      body: {
        success: true,
        data: {
          evaluation_status: status,
          evaluation: done ? evaluation : null,
          evaluation_error: null,
        },
      },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/settings",
      body: { success: true, data: null },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/scenarios",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/consumer-types",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/usage/summary",
      body: { success: true, data: null },
    },
  ];
}
async function open(page: Page, status: Status = "completed") {
  return openHermeticShell(page, {
    path: `/pdkt?ruang=1&sesi=${HISTORY_ID}&dari=riwayat`,
    apiMocks: mocks(status),
  });
}
const pdfButton = (page: Page) =>
  page.getByRole("button", { name: "Unduh PDF" });
async function download(page: Page) {
  await expect(
    page
      .getByRole("region", { name: "Ringkasan skor" })
      .getByTestId("pdkt-review-score"),
  ).toHaveText("85", { timeout: 20_000 });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await pdfButton(page).boundingBox();
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
  await pdfButton(page).click();
  const file = await pending;
  return {
    file,
    bytes: await readFile((await file.path())!),
    blobs: await blobReader(),
  };
}
test.beforeAll(async () => {
  await assertLocalDevOnlyTargetAt(APP_ORIGIN);
});
test("PDF PDKT memuat skor, email konsumen dari AI, dan balasan peserta", async ({
  page,
}, info) => {
  const audit = await open(page);
  const { file, bytes, blobs } = await download(page);
  expect(file.suggestedFilename()).toBe(`pdkt_telaah_${HISTORY_ID}.pdf`);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(
    blobs.some((b) => b.type === "application/pdf" && b.size === bytes.length),
  ).toBe(true);
  const metadata = readPdfInfo(bytes);
  expect(metadata.Title).toContain("PDKT");
  expect(metadata.Author).toBe("PDKT");
  expect(metadata.Subject).toBe(`Telaah sesi ${HISTORY_ID}`);
  expect(metadata.Creator).toBe("Trainers SuperApp - Hasil Telaah PDKT");
  expect(bytes.toString("latin1")).toMatch(
    /\/MediaBox\s*\[\s*0\s+0\s+595\.\d+\s+841\.\d+/,
  );
  const pages = readPdfPages(bytes);
  expect(pages.texts.length).toBeGreaterThanOrEqual(2);
  expectTextBasedPdf(bytes, pages);
  expectPageFooters(pages.texts);
  const text = printedReadBack(pages.texts);
  for (const part of [
    "Budi Pembalas",
    "Batch 9",
    "Transaksi gagal",
    "85 dari 100 · Baik",
    "Hampir sesuai",
    "Solusi benar tetapi tanpa batas waktu.",
    "Rincian skor",
    "Jawaban relevan dan jelas.",
    "Perbaiki dulu",
    "Sebut kanal pengaduan resmi.",
    "Silakan hubungi 157.",
    "Poin konsumen",
    "Catatan pada balasan",
    "Tambahkan pengantar sebelum masuk ke topik transaksi.",
    "Temuan lain",
    "Belum menyebut kanal pengaduan resmi",
    "Contoh balasan yang lebih baik",
    "Terima kasih, kami cek transaksi Ibu dalam 2 hari kerja.",
    "Waktu pengerjaan",
    "3 menit 45 detik",
    "[U+1F600]",
  ])
    expect(text).toContain(part);
  // Pembalas yang dipilih, bukan pembuat email.
  expect(text).not.toContain("Siti Pembuat");
  // Interaksi dengan AI: email konsumen buatan AI dan balasan peserta, utuh.
  const conversationAt = text.indexOf("Percakapan dengan AI");
  expect(conversationAt).toBeGreaterThan(-1);
  expect(conversationAt).toBeLessThan(text.indexOf("Perbaiki dulu"));
  const conversation = text
    .slice(conversationAt, text.indexOf("Perbaiki dulu"))
    .replace(/\s+/g, " ");
  for (const part of [
    "Email konsumen AI · Rina",
    "Saldo terpotong tetapi transaksi gagal.",
    "Kapan saldo kembali? Mohon nomor tiket.",
    "Lampiran (1): Lampiran 1 (gambar)",
    "Poin A · Terjawab: Transaksi gagal",
    "Poin B · Sebagian: Waktu pengembalian saldo",
    "Poin C · Belum terjawab: Nomor tiket pengaduan",
    "Balasan · Agen · Budi Pembalas",
    "Terima kasih, kami cek transaksinya.",
    "Kami kabari paling lambat 2 hari kerja.",
    "Catatan 1 · Kalimat penghubung: Tambahkan pengantar sebelum masuk ke topik transaksi.",
    "Menjawab poin A, B",
  ])
    expect(conversation).toContain(part);
  // Baris baru di balasan dipertahankan.
  const runs = pages.runs.flat().map((run) => run.text);
  const replyLine = runs.findIndex((run) =>
    run.includes("Terima kasih, kami cek transaksinya."),
  );
  expect(replyLine).toBeGreaterThanOrEqual(0);
  expect(runs[replyLine + 1]).toContain("Kami kabari paling lambat");
  await file.saveAs(info.outputPath("pdkt-sample.pdf"));
  expectHermetic(audit);
});
for (const status of ["processing", "failed"] as const) {
  test(`telaah ${status} tidak bisa diunduh`, async ({ page }) => {
    const audit = await open(page, status);
    await expect(
      page.getByRole("heading", { name: "Balasan untuk Rina" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(pdfButton(page)).toBeDisabled();
    expectHermetic(audit);
  });
}
test("gagal memuat jsPDF menampilkan error tanpa unduhan dan tombol pulih", async ({
  page,
}) => {
  const audit = await open(page);
  await expect(
    page
      .getByRole("region", { name: "Ringkasan skor" })
      .getByTestId("pdkt-review-score"),
  ).toHaveText("85", { timeout: 20_000 });
  let blocked = 0;
  await page.route("**/*jspdf*", async (route) => {
    blocked++;
    await route.abort("failed");
  });
  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });
  await pdfButton(page).click();
  await expect(page.getByText("PDF belum bisa dibuat. Coba lagi.")).toBeVisible(
    { timeout: 20_000 },
  );
  await expect(pdfButton(page)).toBeEnabled();
  expect(blocked).toBeGreaterThan(0);
  expect(downloaded).toBe(false);
  expectHermetic(audit);
});
