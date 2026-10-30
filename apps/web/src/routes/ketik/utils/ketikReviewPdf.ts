import {
  ketikTranscriptDurationSeconds,
  type KetikHistoryDetail,
  type KetikSessionReview,
  type KetikTypoFinding,
} from "@trainers/types";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import {
  createSessionReviewPdf,
  drawIdentityBlock,
  drawTranscriptAppendix,
} from "../../../utils/sessionReviewPdf";
import { FIELD_LABELS, STATUS } from "./verificationDisplay";
import {
  normalizeMessagesForDisplay,
  stripSystemTags,
} from "../lib/message-utils";
import { pointLetter, pointStatus } from "./quoteMarks";
import {
  KETIK_ASPECTS,
  KETIK_FIX_THRESHOLD,
  formatKetikDate,
  scoreVerdict,
  typoSeverityLabel,
} from "./reviewDisplay";
import { buildKetikReviewView } from "./reviewView";
import { SENDER_LABELS } from "./transcript";

export async function generateKetikReviewPdf({
  session,
  review,
  typos,
  previousScore,
  numbers,
  canRerun,
}: {
  session: KetikHistoryDetail;
  review: KetikSessionReview;
  typos: KetikTypoFinding[];
  previousScore: number | null;
  numbers: Map<string, number>;
  canRerun: boolean;
}): Promise<ArrayBuffer> {
  const view = buildKetikReviewView(session, review, previousScore);
  const participant = formatSimulationSubjectLabel(session.simulationSubject);
  const date = formatKetikDate(session.date);
  const pdf = await createSessionReviewPdf({
    title: "Hasil Telaah KETIK",
    headerLeft: "Hasil Telaah KETIK",
    headerRight: `${participant} • ${date}`,
    metadata: {
      subject: `Telaah sesi ${session.id}`,
      author: "KETIK",
      creator: "Trainers SuperApp - Hasil Telaah KETIK",
    },
  });
  const subject =
    session.simulationSubject?.type === "participant"
      ? session.simulationSubject
      : null;
  const duration = ketikTranscriptDurationSeconds(
    session.messages[0]?.timestamp,
    session.messages.at(-1)?.timestamp,
  );
  const identity: [string, string][] = [
    ["Peserta", participant],
    ...(subject?.batchName
      ? [["Batch", subject.batchName] as [string, string]]
      : []),
    ...(subject?.team ? [["Tim", subject.team] as [string, string]] : []),
    ["Tanggal sesi", date],
    ["Skenario", session.scenarioTitle],
    ["Konsumen", session.consumerName],
  ];
  if (duration !== null)
    identity.push([
      "Durasi",
      `${Math.floor(duration / 60)} menit ${duration % 60} detik`,
    ]);
  identity.push(["PDF dibuat", formatKetikDate(new Date().toISOString())]);
  drawIdentityBlock(pdf, identity);
  pdf.heading("Skor akhir", undefined, 10);
  pdf.paragraph(
    `${view.finalScore} · ${scoreVerdict(view.finalScore)}${view.change ? ` · ${view.change}` : ""}`,
    { font: "bold" },
  );
  if (view.aspects.length)
    pdf.table({
      columns: [
        { header: "Aspek", weight: 3 },
        { header: "Skor", weight: 1 },
        { header: "Penanda", weight: 2 },
      ],
      rows: view.aspects.map((a) => [
        a.label,
        String(a.score),
        a.score < KETIK_FIX_THRESHOLD ? "Perlu diperbaiki" : "",
      ]),
    });
  const section = (title: string) => pdf.heading(title, undefined, 9);
  const quote = (messageId: string, value: string, prefix = "Pesan") =>
    pdf.paragraph(
      `${numbers.has(messageId) ? `${prefix} ${numbers.get(messageId)}` : "Pesan tidak ditemukan"}: “${value}”`,
    );
  const notes = (items: typeof view.fixes) =>
    items.forEach(({ note, index }) => {
      pdf.paragraph(
        `${index + 1}. ${KETIK_ASPECTS.find((a) => a.key === note.dimension)?.label ?? note.dimension} · ${note.verdict === "fix" ? "Perlu diperbaiki" : "Sudah tepat"}`,
        { font: "bold" },
      );
      quote(note.messageId, note.quote);
      pdf.paragraph(note.note);
      if (note.verdict === "fix" && note.example)
        pdf.paragraph(`Sebaiknya: ${note.example}`);
    });
  section("Ringkasan");
  if (view.caseCore) pdf.paragraph(`Inti kasus: ${view.caseCore}`);
  if (review.aiSummary) pdf.paragraph(review.aiSummary);
  section("Perbaiki dulu");
  notes(view.fixes);
  review.weaknesses.forEach((item) => pdf.paragraph(item));
  if (!view.fixes.length && !review.weaknesses.length)
    pdf.paragraph("Belum ada temuan perbaikan yang tersedia.");
  section("Pertanyaan konsumen");
  if (!view.points)
    pdf.paragraph(
      `Belum tersedia untuk telaah ini. Penanda pertanyaan konsumen dan kalimat agen hanya ada di telaah yang dibuat setelah fitur ini dirilis.${canRerun ? " Jalankan Telaah ulang untuk melengkapinya." : ""}`,
    );
  else if (!view.points.length)
    pdf.paragraph("AI tidak menemukan pertanyaan konsumen di percakapan ini.");
  else
    view.orderedPoints.forEach(({ point, index }) => {
      pdf.paragraph(
        `${pointLetter(index)} · ${point.summary} · ${pointStatus[point.status].label}`,
        { font: "bold" },
      );
      if (point.reason) pdf.paragraph(point.reason);
      quote(point.messageId, point.quote);
      if (point.answerMessageId && point.answerQuote)
        quote(point.answerMessageId, point.answerQuote, "Dijawab di pesan");
      else pdf.paragraph("Belum ada balasan agen untuk poin ini.");
    });
  const verification = review.education?.verification;
  if (verification) {
    section("Verifikasi data");
    pdf.paragraph(STATUS[verification.status].label);
    pdf.paragraph(
      "Data konsumen di sesi ini sengaja tidak sesuai. Agen cukup menanyakan atau mengonfirmasinya sekali, walaupun konsumen tidak menjawab.",
    );
    verification.fields.forEach((field) => {
      pdf.paragraph(
        `${FIELD_LABELS[field.field]} · ${field.reason} · ${STATUS[field.status].label}`,
      );
      if (field.agentMessageId && field.agentQuote)
        quote(field.agentMessageId, field.agentQuote);
    });
  }
  section("Sudah baik");
  if (view.good.length) notes(view.good);
  else if (review.strengths.length)
    review.strengths.forEach((item) => pdf.paragraph(item));
  else
    pdf.paragraph(
      "Belum tersedia respons agen yang dinilai sudah tepat. Skor tinggi saja tidak menunjukkan kalimat mana yang sudah baik.",
    );
  section("Ejaan");
  if (!typos.length) pdf.paragraph("Tidak ada salah ketik yang ditemukan.");
  else
    typos.forEach((typo) => {
      pdf.paragraph(
        `${numbers.has(typo.messageId) ? `Pesan ${numbers.get(typo.messageId)}` : "Pesan tidak ditemukan"} · ${typoSeverityLabel(typo.severity)} · ${typo.originalWord} → ${typo.correctedWord}`,
      );
      const why = view.enriched.find(
        (item) =>
          item.messageId === typo.messageId &&
          item.originalWord === typo.originalWord,
      )?.whyWrong;
      if (why) pdf.paragraph(why);
    });
  section("Alasan skor");
  if (!view.guidance.length)
    pdf.paragraph(
      "Alasan skor berdasarkan percakapan belum tersedia untuk telaah ini.",
    );
  view.guidance.forEach((item) => {
    const verified =
      item.source === "transcript" && (item.evidence?.length ?? 0) > 0;
    pdf.paragraph(`${item.label} · ${item.score} · ${item.verdict}`, {
      font: "bold",
    });
    if (verified) {
      pdf.paragraph(`Alasan skor: ${item.diagnosis}`);
      item.evidence?.forEach((evidence) =>
        quote(evidence.messageId, evidence.quote),
      );
    } else
      pdf.paragraph(
        `Alasan skor berdasarkan percakapan belum tersedia untuk aspek ini. Panduan umum di bawah bukan penjelasan spesifik atas nilai ${item.score}.`,
      );
    pdf.paragraph(
      `${verified ? "Langkah berikutnya" : "Panduan umum"}: ${item.howToFix}`,
    );
    if (item.exampleRewrite)
      pdf.paragraph(
        `${verified ? "Contoh lebih baik" : "Contoh latihan"}: ${item.exampleRewrite}`,
      );
  });
  if (view.nextSteps.length) {
    section("Langkah berikutnya");
    view.nextSteps.forEach((item) => pdf.paragraph(item));
  }
  drawTranscriptAppendix(
    pdf,
    normalizeMessagesForDisplay(session.messages).map((message) => ({
      number: numbers.get(message.id),
      speaker: SENDER_LABELS[message.sender],
      time: new Date(message.timestamp).toLocaleString("id-ID"),
      text:
        stripSystemTags(message.text)
          .trim()
          .replace(/\[SEND_IMAGE\s*:\s*(\d+)\]/gi, (_, raw: string) => {
            const index = Number(raw);
            const attachment = session.attachments?.find(
              (item) => item.index === index,
            );
            return attachment
              ? `[Gambar: ${attachment.alt}]`
              : `Lampiran ${index + 1} tidak tersedia dalam riwayat sesi ini.`;
          }) || "(pesan kosong)",
    })),
  );
  pdf.finalize();
  return pdf.doc.output("arraybuffer") as ArrayBuffer;
}
