import type {
  PdktEvaluationResult,
  PdktMailboxDetailItem,
} from "@trainers/types";
import { pointStatus } from "../../../components/simulation/quoteMarks";
import { PDKT_DIMENSION_LABELS } from "../../../lib/pdkt-dimensions";
import {
  consumerPointReplyEnd,
  noteNumberForQuote,
  numberReplyNotes,
  placeConsumerPoints,
} from "../../../lib/pdkt-reply-marks";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { bullet } from "../../../utils/agentReportPdfLayout";
import { INK } from "../../../utils/agentReportPdfTheme";
import {
  conversationAgentLabel,
  createSessionReviewPdf,
  drawConversation,
  drawFinding,
  drawIdentityBlock,
  drawSection,
  POINT_STATUS_TONE,
  type ConversationTag,
  type FindingLine,
} from "../../../utils/sessionReviewPdf";
import { isPdfAttachment } from "./detectMimeType";
import {
  formatPdktEmailDate,
  PDKT_NO_SUBJECT,
  readAgentReply,
  readInboundEmail,
} from "./emailDisplay";
import {
  formatPdktDuration,
  PDKT_INCOMPLETE_REVIEW,
  pdktOtherFindings,
  pdktRankedActionItems,
  pdktReviewDimensionRows,
  pdktScoreGrade,
} from "./reviewSummary";


export async function generatePdktReviewPdf({
  item,
  result,
}: {
  item: PdktMailboxDetailItem;
  result: PdktEvaluationResult;
}): Promise<ArrayBuffer> {
  const sessionId = item.history_id ?? item.id;
  // Atribusi mengikuti pembalas yang dipilih saat membalas, bukan pembuat email.
  const participant = formatSimulationSubjectLabel(item.simulationSubject);
  const date = formatPdktEmailDate(item.replied_at ?? item.created_at);
  const pdf = await createSessionReviewPdf({
    title: "Hasil Telaah PDKT",
    headerLeft: "Hasil Telaah PDKT",
    headerRight: `${participant} • ${date}`,
    metadata: {
      subject: `Telaah sesi ${sessionId}`,
      author: "PDKT",
      creator: "Trainers SuperApp - Hasil Telaah PDKT",
    },
  });
  const subject =
    item.simulationSubject?.type === "participant"
      ? item.simulationSubject
      : null;
  const inbound = readInboundEmail(item);
  const replyBody = readAgentReply(item);
  const replyEmail = (
    Array.isArray(item.emails_thread) ? item.emails_thread : []
  ).find((email) => email?.isAgent);
  const identity: [string, string][] = [["Peserta", participant]];
  if (subject?.batchName) identity.push(["Batch", subject.batchName]);
  if (subject?.team) identity.push(["Tim", subject.team]);
  identity.push(
    ["Tanggal balasan", date],
    ["Konsumen", item.sender_name],
    ["Subjek email", item.subject || PDKT_NO_SUBJECT],
  );
  if (item.time_taken)
    identity.push(["Waktu pengerjaan", formatPdktDuration(item.time_taken)]);
  identity.push(["PDF dibuat", formatPdktEmailDate(new Date().toISOString())]);
  drawIdentityBlock(pdf, identity);

  const section = (title: string) => drawSection(pdf, title);
  const score = Math.max(0, Math.min(100, Math.round(result.score)));
  section("Skor total");
  pdf.paragraph(`${score} dari 100 · ${pdktScoreGrade(score)}`, {
    font: "bold",
    size: 12,
    color: INK,
    gapAfter: 1.5,
  });
  const alignment = result.expectedAnswerAlignment;
  if (alignment) {
    pdf.paragraph(`Kesesuaian dengan kunci jawaban: ${alignment.category}`, {
      font: "bold",
    });
    pdf.paragraph(alignment.reason, { gapAfter: 2 });
  }
  const dimensions = pdktReviewDimensionRows(result);
  if (dimensions.length)
    pdf.table({
      caption: "Rincian skor",
      columns: [
        { header: "Aspek", weight: 3 },
        { header: "Skor", weight: 1 },
        { header: "Penanda", weight: 2 },
      ],
      rows: dimensions.map((row) => [
        row.label,
        String(row.value),
        row.low ? "Perlu perbaikan" : "",
      ]),
    });
  const feedback = result.feedback?.trim();
  if (feedback) {
    section("Catatan AI");
    pdf.paragraph(feedback);
  }

  const points = placeConsumerPoints(
    result.consumerPoints,
    inbound.body,
    () => null,
  ).points;
  const notes = numberReplyNotes(result.annotations, replyBody);
  const consumerTags: ConversationTag[] = points.map((point) => ({
    tone: POINT_STATUS_TONE[point.status],
    text: `Poin ${point.letter} · ${pointStatus[point.status].label}: ${point.summary}`,
  }));
  if (inbound.attachments.length)
    consumerTags.unshift({
      tone: "info",
      text: `Lampiran (${inbound.attachments.length}): ${inbound.attachments
        .map(
          (attachment, index) =>
            `Lampiran ${index + 1} (${isPdfAttachment(attachment) ? "PDF" : "gambar"})`,
        )
        .join(", ")}`,
    });
  const replyTags: ConversationTag[] = notes.map((note) => ({
    tone: "fix",
    text: `Catatan ${note.number} · ${noteKind(note)}: ${note.note}`,
  }));
  const answered = points.flatMap((point) =>
    consumerPointReplyEnd(point, replyBody) === null ? [] : [point.letter],
  );
  if (answered.length)
    replyTags.push({
      tone: "info",
      text: `Menjawab poin ${answered.join(", ")}`,
    });
  const inboundDate = formatPdktEmailDate(
    readTimestamp(item.inbound_email) ?? item.created_at,
  );
  const replyDate = formatPdktEmailDate(
    replyEmail?.timestamp ?? item.replied_at ?? "",
  );
  drawConversation(pdf, {
    title: "Percakapan dengan AI",
    scope: `Email konsumen ${item.sender_name} dibuat oleh AI; di bawahnya balasan peserta apa adanya. Penanda berwarna merujuk ke hasil telaah sesudah percakapan ini.`,
    turns: [
      ...(inbound.body
        ? [
            {
              side: "ai" as const,
              label: [`Email konsumen AI · ${item.sender_name}`, inboundDate]
                .filter(Boolean)
                .join(" · "),
              text: `Subjek: ${item.subject || PDKT_NO_SUBJECT}\n\n${inbound.body}`,
              tags: consumerTags,
            },
          ]
        : []),
      ...(replyBody
        ? [
            {
              side: "participant" as const,
              label: [
                `Balasan · ${conversationAgentLabel(item.simulationSubject)}`,
                replyDate,
              ]
                .filter(Boolean)
                .join(" · "),
              text: replyBody,
              tags: replyTags,
            },
          ]
        : []),
    ],
    empty: "Email dan balasan tidak tersimpan untuk sesi ini.",
  });

  const quote = (text: string): FindingLine => ({
    text: `Di balasan Anda: “${text}”`,
    quote: true,
  });
  section("Perbaiki dulu");
  const actions = pdktRankedActionItems(result);
  if (!actions.length)
    pdf.paragraph("Belum ada langkah perbaikan untuk telaah ini.");
  else {
    pdf.paragraph(
      "Langkah tanpa kutipan merupakan saran umum, bukan bukti kesalahan pada kalimat tertentu.",
      { gapAfter: 2 },
    );
    actions.forEach((action, index) => {
      const number = noteNumberForQuote(notes, replyBody, action.quote);
      drawFinding(pdf, {
        title: `${index === 0 ? "Perbaiki ini dulu" : `Langkah ${index + 1}`}: ${action.text}`,
        tone: index === 0 ? "fix" : "partial",
        lines: [
          ...(action.quote
            ? [
                {
                  text: `Di balasan Anda: “${action.quote}”${number === null ? "" : ` · catatan ${number}`}`,
                  quote: true,
                },
              ]
            : []),
          ...(action.example ? [{ text: `Contoh: “${action.example}”` }] : []),
          { text: `Aspek: ${PDKT_DIMENSION_LABELS[action.dimension]}` },
        ],
      });
    });
  }

  section("Poin konsumen");
  if (!result.consumerPoints?.length)
    pdf.paragraph(PDKT_INCOMPLETE_REVIEW.points.text);
  else
    points.forEach((point) =>
      drawFinding(pdf, {
        title: `${point.letter} · ${point.summary} · ${pointStatus[point.status].label}`,
        tone: POINT_STATUS_TONE[point.status],
        lines: [
          { text: `Di email konsumen: “${point.quote}”`, quote: true },
          ...(point.reason ? [{ text: point.reason }] : []),
        ],
      }),
    );

  section("Catatan pada balasan");
  if (!result.annotations) pdf.paragraph(PDKT_INCOMPLETE_REVIEW.marks.text);
  else if (!notes.length)
    pdf.paragraph("AI tidak menandai kalimat di balasan ini.");
  else
    notes.forEach((note) =>
      drawFinding(pdf, {
        title: `${note.number}. ${note.note}`,
        tone: "fix",
        lines: [
          quote(note.quote),
          ...(note.example ? [{ text: `Contoh: “${note.example}”` }] : []),
          {
            text: `${noteKind(note)}${note.marked ? "" : " · Tidak ditandai di balasan"}`,
          },
        ],
      }),
    );

  if (dimensions.length) {
    section("Alasan skor");
    dimensions.forEach((row) =>
      drawFinding(pdf, {
        title: `${row.label} · ${row.value}${row.low ? " · Perlu perbaikan" : ""}`,
        tone: row.low ? "partial" : "good",
        lines: [
          { text: row.description },
          ...(row.explanation
            ? [
                { text: `Alasan penilaian: ${row.explanation.reason}` },
                quote(row.explanation.quote),
              ]
            : [
                {
                  text: "Alasan penilaian dengan kutipan belum tersedia untuk aspek ini. Telaah ulang dapat melengkapinya.",
                },
              ]),
          ...(row.tip ? [{ text: `Saran latihan: ${row.tip}` }] : []),
        ],
      }),
    );
  }

  const otherFindings = pdktOtherFindings(result);
  if (otherFindings.length) {
    section("Temuan lain");
    otherFindings.forEach((finding) =>
      bullet(pdf, `${finding.kind}: ${finding.text}`, { size: 8.5 }),
    );
  }

  const rewrite = result.edu?.suggestedRewrite;
  if (rewrite?.body) {
    section("Contoh balasan yang lebih baik");
    if (rewrite.subject)
      pdf.paragraph(`Subjek: ${rewrite.subject}`, { font: "bold" });
    pdf.paragraph(rewrite.body);
  }

  pdf.finalize();
  return pdf.doc.output("arraybuffer") as ArrayBuffer;
}

/** Jenis catatan seperti di layar: kalimat penghubung atau aspek penilaian. */
function noteKind(note: { kind?: string; dimension: string }): string {
  return note.kind === "transition"
    ? "Kalimat penghubung"
    : (PDKT_DIMENSION_LABELS[
        note.dimension as keyof typeof PDKT_DIMENSION_LABELS
      ] ?? note.dimension);
}

function readTimestamp(email: unknown): string | null {
  const value = (email as { timestamp?: unknown } | null)?.timestamp;
  return typeof value === "string" ? value : null;
}
