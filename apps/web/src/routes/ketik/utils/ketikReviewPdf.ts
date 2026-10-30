import {
  ketikTranscriptDurationSeconds,
  type KetikHistoryDetail,
  type KetikSessionReview,
  type KetikTypoFinding,
} from "@trainers/types";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import {
  conversationAgentLabel,
  createSessionReviewPdf,
  drawConversation,
  drawIdentityBlock,
  drawFinding,
  drawSection,
  POINT_STATUS_TONE,
  type ConversationTag,
  type ConversationTurn,
  type FindingLine,
} from "../../../utils/sessionReviewPdf";
import { bullet } from "../../../utils/agentReportPdfLayout";
import { INK } from "../../../utils/agentReportPdfTheme";
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
  drawSection(pdf, "Skor akhir");
  pdf.paragraph(
    `${view.finalScore} · ${scoreVerdict(view.finalScore)}${view.change ? ` · ${view.change}` : ""}`,
    { font: "bold", size: 12, color: INK, gapAfter: 1.5 },
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
  const section = (title: string) => drawSection(pdf, title);
  const quote = (
    messageId: string,
    value: string,
    prefix = "Pesan",
  ): FindingLine => ({
    text: `${numbers.has(messageId) ? `${prefix} ${numbers.get(messageId)}` : "Pesan tidak ditemukan"}: “${value}”`,
    quote: true,
  });
  const notes = (items: typeof view.fixes) =>
    items.forEach(({ note, index }) =>
      drawFinding(pdf, {
        title: `${index + 1}. ${KETIK_ASPECTS.find((a) => a.key === note.dimension)?.label ?? note.dimension} · ${note.verdict === "fix" ? "Perlu diperbaiki" : "Sudah tepat"}`,
        tone: note.verdict === "fix" ? "fix" : "good",
        lines: [
          quote(note.messageId, note.quote),
          { text: note.note },
          ...(note.verdict === "fix" && note.example
            ? [{ text: `Sebaiknya: ${note.example}` }]
            : []),
        ],
      }),
    );
  section("Ringkasan");
  if (view.caseCore) pdf.paragraph(`Inti kasus: ${view.caseCore}`);
  if (review.aiSummary) pdf.paragraph(review.aiSummary);
  drawConversation(pdf, {
    title: "Percakapan dengan AI",
    scope: `Konsumen ${session.consumerName} diperankan AI. Penanda berwarna di bawah pesan merujuk ke hasil telaah sesudah percakapan ini.`,
    turns: conversationTurns(session, review, typos, numbers),
    empty: "Percakapan tidak tersimpan untuk sesi ini.",
  });
  section("Perbaiki dulu");
  notes(view.fixes);
  review.weaknesses.forEach((item) => bullet(pdf, item, { size: 8.5 }));
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
    view.orderedPoints.forEach(({ point, index }) =>
      drawFinding(pdf, {
        title: `${pointLetter(index)} · ${point.summary} · ${pointStatus[point.status].label}`,
        tone: POINT_STATUS_TONE[point.status],
        lines: [
          ...(point.reason ? [{ text: point.reason }] : []),
          quote(point.messageId, point.quote),
          point.answerMessageId && point.answerQuote
            ? quote(point.answerMessageId, point.answerQuote, "Dijawab di pesan")
            : { text: "Belum ada balasan agen untuk poin ini." },
        ],
      }),
    );
  const verification = review.education?.verification;
  if (verification) {
    section("Verifikasi data");
    pdf.paragraph(STATUS[verification.status].label, { font: "bold" });
    pdf.paragraph(
      "Data konsumen di sesi ini sengaja tidak sesuai. Agen cukup menanyakan atau mengonfirmasinya sekali, walaupun konsumen tidak menjawab.",
      { gapAfter: 2 },
    );
    verification.fields.forEach((field) =>
      drawFinding(pdf, {
        title: `${FIELD_LABELS[field.field]} · ${STATUS[field.status].label}`,
        tone: field.status === "confirmed" ? "good" : "partial",
        lines: [
          { text: field.reason },
          ...(field.agentMessageId && field.agentQuote
            ? [quote(field.agentMessageId, field.agentQuote)]
            : []),
        ],
      }),
    );
  }
  section("Sudah baik");
  if (view.good.length) notes(view.good);
  else if (review.strengths.length)
    review.strengths.forEach((item) => bullet(pdf, item, { size: 8.5 }));
  else
    pdf.paragraph(
      "Belum tersedia respons agen yang dinilai sudah tepat. Skor tinggi saja tidak menunjukkan kalimat mana yang sudah baik.",
    );
  section("Ejaan");
  if (!typos.length) pdf.paragraph("Tidak ada salah ketik yang ditemukan.");
  else
    typos.forEach((typo) => {
      const why = view.enriched.find(
        (item) =>
          item.messageId === typo.messageId &&
          item.originalWord === typo.originalWord,
      )?.whyWrong;
      drawFinding(pdf, {
        title: `${typo.originalWord} → ${typo.correctedWord}`,
        tone: "partial",
        lines: [
          {
            text: `${numbers.has(typo.messageId) ? `Pesan ${numbers.get(typo.messageId)}` : "Pesan tidak ditemukan"} · ${typoSeverityLabel(typo.severity)}`,
            quote: true,
          },
          ...(why ? [{ text: why }] : []),
        ],
      });
    });
  section("Alasan skor");
  if (!view.guidance.length)
    pdf.paragraph(
      "Alasan skor berdasarkan percakapan belum tersedia untuk telaah ini.",
    );
  view.guidance.forEach((item) => {
    const verified =
      item.source === "transcript" && (item.evidence?.length ?? 0) > 0;
    drawFinding(pdf, {
      title: `${item.label} · ${item.score} · ${item.verdict}`,
      tone: item.score < KETIK_FIX_THRESHOLD ? "partial" : "good",
      lines: [
        ...(verified
          ? [
              { text: `Alasan skor: ${item.diagnosis}` },
              ...(item.evidence ?? []).map((evidence) =>
                quote(evidence.messageId, evidence.quote),
              ),
            ]
          : [
              {
                text: `Alasan skor berdasarkan percakapan belum tersedia untuk aspek ini. Panduan umum di bawah bukan penjelasan spesifik atas nilai ${item.score}.`,
              },
            ]),
        {
          text: `${verified ? "Langkah berikutnya" : "Panduan umum"}: ${item.howToFix}`,
        },
        ...(item.exampleRewrite
          ? [
              {
                text: `${verified ? "Contoh lebih baik" : "Contoh latihan"}: ${item.exampleRewrite}`,
              },
            ]
          : []),
      ],
    });
  });
  if (view.nextSteps.length) {
    section("Langkah berikutnya");
    view.nextSteps.forEach((item) => bullet(pdf, item, { size: 8.5 }));
  }
  pdf.finalize();
  return pdf.doc.output("arraybuffer") as ArrayBuffer;
}

/** Pesan sesi sebagai giliran percakapan, lengkap dengan penanda telaahnya. */
function conversationTurns(
  session: KetikHistoryDetail,
  review: KetikSessionReview,
  typos: KetikTypoFinding[],
  numbers: Map<string, number>,
): ConversationTurn[] {
  const education = review.education;
  const verification = education?.verification;
  const missedBefore =
    verification && verification.status !== "confirmed"
      ? verification.missedBeforeMessageId
      : null;
  const agent = conversationAgentLabel(session.simulationSubject);
  const turns: ConversationTurn[] = [];
  for (const message of normalizeMessagesForDisplay(session.messages)) {
    const text = messageText(session, message.text);
    if (message.sender === "system") {
      turns.push({ side: "note", text });
      continue;
    }
    if (message.id === missedBefore)
      turns.push({
        side: "note",
        tone: "partial",
        text:
          verification?.status === "not_asked"
            ? "Data seharusnya diminta dan dikonfirmasi di sini"
            : "Data tidak sesuai seharusnya dikonfirmasi di sini",
      });
    const isAgent = message.sender === "agent";
    const tags: ConversationTag[] = [];
    (education?.consumerPoints ?? []).forEach((point, index) => {
      if (point.messageId === message.id)
        tags.push({
          tone: POINT_STATUS_TONE[point.status],
          text: `Poin ${pointLetter(index)} · ${pointStatus[point.status].label}: ${point.summary}`,
        });
    });
    (education?.agentNotes ?? []).forEach((note, index) => {
      if (note.messageId === message.id)
        tags.push({
          tone: note.verdict === "fix" ? "fix" : "good",
          text: `Catatan ${index + 1} · ${note.verdict === "fix" ? "Perlu diperbaiki" : "Sudah tepat"}: ${note.note}`,
        });
    });
    const answered = (education?.consumerPoints ?? []).flatMap(
      (point, index) =>
        point.answerMessageId === message.id ? [pointLetter(index)] : [],
    );
    if (answered.length)
      tags.push({ tone: "info", text: `Menjawab poin ${answered.join(", ")}` });
    for (const typo of typos)
      if (typo.messageId === message.id)
        tags.push({
          tone: "partial",
          text: `Ejaan: ${typo.originalWord} → ${typo.correctedWord}`,
        });
    const clock = conversationClock(message.timestamp);
    turns.push({
      side: isAgent ? "participant" : "ai",
      label: [
        numbers.has(message.id) ? `Pesan ${numbers.get(message.id)}` : null,
        isAgent ? agent : `Konsumen AI · ${session.consumerName}`,
        clock,
      ]
        .filter(Boolean)
        .join(" · "),
      text,
      tags,
    });
  }
  return turns;
}

/** Teks pesan tanpa tag sistem; lampiran gambar ditulis sebagai teks. */
function messageText(session: KetikHistoryDetail, raw: string): string {
  return (
    stripSystemTags(raw)
      .trim()
      .replace(/\[SEND_IMAGE\s*:\s*(\d+)\]/gi, (_, value: string) => {
        const index = Number(value);
        const attachment = session.attachments?.find(
          (item) => item.index === index,
        );
        return attachment
          ? `[Gambar: ${attachment.alt}]`
          : `Lampiran ${index + 1} tidak tersedia dalam riwayat sesi ini.`;
      }) || "(pesan kosong)"
  );
}

/** "09.05" dari waktu ISO, atau null bila tidak valid. */
function conversationClock(value: string | undefined): string | null {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : null;
}
