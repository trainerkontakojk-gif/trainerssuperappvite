import {
  TELEFUN_AGENT_NOTE_LABELS,
  type TelefunCoachingSummary,
  type TelefunReplayAnnotation,
  type TelefunTranscriptEntry,
  type VoiceQualityAssessment,
} from "@trainers/types";
import {
  pointLetter,
  pointStatus,
} from "../../../components/simulation/quoteMarks";
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
  type ConversationTone,
  type ConversationTurn,
  type FindingLine,
} from "../../../utils/sessionReviewPdf";
import type { CallRecord } from "../types";
import { CATEGORY_LABELS, momentLabel } from "./annotationDisplay";
import {
  formatCallDuration,
  formatClock,
  formatTelefunDate,
  formatTelefunScore,
  readTelefunScore,
  telefunScoreVerdict,
} from "./reviewDisplay";
import {
  buildTelefunReviewView,
  buildTelefunScoreDetails,
  orderedConsumerPoints,
  TELEFUN_PROFILE_AXES,
} from "./reviewView";

export async function generateTelefunReviewPdf({
  record,
  assessment,
  previous,
  transcript,
  annotations,
  summary,
  clockOf,
  lineStart,
  holds,
  canRerun,
}: {
  record: CallRecord;
  assessment: VoiceQualityAssessment | null | undefined;
  previous: number | null;
  transcript: readonly TelefunTranscriptEntry[];
  annotations: TelefunReplayAnnotation[];
  summary: TelefunCoachingSummary | null;
  clockOf: (ms: number) => string;
  /** Jam rekaman awal baris transkrip, sama dengan pemutar. */
  lineStart: (startMs: number) => number;
  /** Hold dalam jam sesi (`atMs`) dan label yang tampil di transkrip. */
  holds: { atMs: number; text: string }[];
  canRerun: boolean;
}): Promise<ArrayBuffer> {
  const view = assessment
    ? buildTelefunReviewView(record, assessment, previous)
    : null;
  const score = view?.score ?? readTelefunScore(record) ?? 0;
  const participant = formatSimulationSubjectLabel(record.simulationSubject);
  const date = formatTelefunDate(record.date);
  const pdf = await createSessionReviewPdf({
    title: "Hasil Telaah Telefun",
    headerLeft: "Hasil Telaah Telefun",
    headerRight: `${participant} • ${date}`,
    metadata: {
      subject: `Telaah sesi ${record.id}`,
      author: "Telefun",
      creator: "Trainers SuperApp - Hasil Telaah Telefun",
    },
  });
  const subject =
    record.simulationSubject?.type === "participant"
      ? record.simulationSubject
      : null;
  const rows: [string, string][] = [["Peserta", participant]];
  if (subject?.batchName) rows.push(["Batch", subject.batchName]);
  if (subject?.team) rows.push(["Tim", subject.team]);
  rows.push(
    ["Tanggal sesi", date],
    ["Skenario", record.scenarioTitle],
    ["Konsumen", record.consumerName],
    ["Durasi", formatCallDuration(record.duration)],
    ["PDF dibuat", formatTelefunDate(new Date().toISOString())],
  );
  drawIdentityBlock(pdf, rows);
  const section = (title: string) => drawSection(pdf, title);
  const quote = (label: string, ms: number, text: string): FindingLine => ({
    text: `${label} ${clockOf(ms)}: “${text}”`,
    quote: true,
  });
  const conversation = () =>
    drawConversation(pdf, {
      title: "Percakapan dengan AI",
      scope: `Konsumen ${record.consumerName} diperankan AI dalam panggilan suara. Penanda berwarna di bawah ucapan merujuk ke hasil telaah dan catatan trainer.`,
      turns: conversationTurns({
        record,
        transcript,
        content: assessment?.contentReview ?? null,
        annotations,
        holds,
        clockOf,
        lineStart,
      }),
      empty: "Transkrip belum tersedia untuk panggilan ini.",
    });
  section("Skor suara");
  pdf.paragraph(
    `${formatTelefunScore(score)} / 10 · ${telefunScoreVerdict(score)}${view?.change ? ` · ${view.change}` : ""}`,
    { font: "bold", size: 12, color: INK, gapAfter: 1.5 },
  );
  if (view && assessment) {
    pdf.table({
      columns: [
        { header: "Aspek", weight: 3 },
        { header: "Skor / 10", weight: 1 },
        { header: "Keterangan", weight: 3 },
      ],
      rows: view.aspects.map((aspect) => [
        aspect.label,
        aspect.score === null
          ? "Belum dinilai"
          : formatTelefunScore(aspect.score),
        aspect.raw ?? "",
      ]),
    });
    if (view.content?.caseCore || view.profile) {
      section("Ringkasan");
      if (view.content?.caseCore)
        pdf.paragraph(`Inti kasus: ${view.content.caseCore}`);
      if (view.profile) {
        pdf.paragraph(`Profil suara: ${view.profile.overallSummary}`, {
          gapAfter: 2,
        });
        const axes = TELEFUN_PROFILE_AXES.flatMap((axis) => {
          const metric = view.profile?.metrics.find((m) => m.key === axis.key);
          return metric ? [[axis.label, formatTelefunScore(metric.score)]] : [];
        });
        if (axes.length === 5)
          pdf.table({
            caption: "Profil komunikasi",
            columns: [
              { header: "Aspek", weight: 3 },
              { header: "Skor / 10", weight: 1 },
            ],
            rows: axes,
          });
      }
    }
    conversation();
    const unavailable =
      view.content === null
        ? "Transkrip percakapan tidak tersimpan, jadi isi panggilan ini tidak bisa ditelaah."
        : `Belum tersedia untuk hasil ini. Pertanyaan konsumen dan kalimat agen hanya ditelaah pada hasil yang dibuat setelah fitur ini dirilis.${canRerun ? " Jalankan Telaah ulang untuk melengkapinya." : ""}`;
    const notes = (verdict: "fix" | "good") =>
      view.content?.agentNotes.forEach((note, index) => {
        if (note.verdict !== verdict) return;
        drawFinding(pdf, {
          title: `${index + 1}. ${note.category ? TELEFUN_AGENT_NOTE_LABELS[note.category] + " · " : ""}${verdict === "fix" ? "Perlu diperbaiki" : "Sudah tepat"}`,
          tone: verdict,
          lines: [
            quote("Agen", note.startMs, note.quote),
            { text: note.note },
            ...(note.comparison
              ? [
                  quote(
                    "Pembanding",
                    note.comparison.startMs,
                    note.comparison.quote,
                  ),
                ]
              : []),
            ...(verdict === "fix" && note.example
              ? [{ text: `Kalimat yang lebih tepat: ${note.example}` }]
              : []),
          ],
        });
      });
    section("Perbaiki dulu");
    if (!view.content) pdf.paragraph(unavailable);
    else if (!view.toFix.length)
      pdf.paragraph("Tidak ada kalimat agen yang ditandai perlu diperbaiki.");
    else notes("fix");
    if (view.nextSteps.length) {
      pdf.paragraph("Langkah latihan berikutnya", {
        font: "bold",
        color: INK,
        gapAfter: 1,
      });
      view.nextSteps
        .slice(0, 3)
        .forEach((step) => bullet(pdf, step, { size: 8.5 }));
    }
    section("Pertanyaan konsumen");
    if (!view.content) pdf.paragraph(unavailable);
    else if (!view.content.consumerPoints.length)
      pdf.paragraph("AI tidak menemukan pertanyaan konsumen di panggilan ini.");
    else
      orderedConsumerPoints(view.content.consumerPoints).forEach(
        ({ point, index }) =>
          drawFinding(pdf, {
            title: `${pointLetter(index)} · ${point.summary} · ${pointStatus[point.status].label}`,
            tone: POINT_STATUS_TONE[point.status],
            lines: [
              ...(point.reason ? [{ text: point.reason }] : []),
              quote("Konsumen", point.startMs, point.quote),
              point.answerStartMs !== null && point.answerQuote
                ? quote("Dijawab di", point.answerStartMs, point.answerQuote)
                : { text: "Belum ada jawaban agen untuk pertanyaan ini." },
            ],
          }),
      );
    section("Alasan skor");
    buildTelefunScoreDetails(assessment, transcript).forEach(
      ({ aspect, metric, line, tip }) =>
        drawFinding(pdf, {
          title: `${aspect.label} · ${aspect.score === null ? "Belum dinilai" : `${formatTelefunScore(aspect.score)} / 10 · ${aspect.verdict}`}`,
          tone: "info",
          lines: [
            ...(line
              ? [{ text: `${clockOf(line.startMs)} · ${aspect.label}`, quote: true }]
              : []),
            {
              text:
                aspect.feedback ||
                "Penjelasan penilaian belum tersedia untuk aspek ini.",
            },
            ...(tip ? [{ text: `Latihan: ${tip}` }] : []),
            ...(metric?.examplePhrase
              ? [{ text: `Contoh: “${metric.examplePhrase}”` }]
              : []),
          ],
        }),
    );
    section("Sudah baik");
    if (view.good.length && view.content) notes("good");
    else if (assessment.strengths.length) {
      pdf.paragraph("Kekuatan menurut penilaian AI", {
        font: "bold",
        color: INK,
        gapAfter: 1,
      });
      assessment.strengths.forEach((item) =>
        bullet(pdf, item, { size: 8.5 }),
      );
    } else if (!view.content) pdf.paragraph(unavailable);
    else
      pdf.paragraph("Belum ada contoh ucapan agen yang ditandai sudah tepat.");
  } else {
    pdf.paragraph(
      "Rincian per aspek tidak tersimpan untuk panggilan lama ini.",
    );
    if (record.feedback) pdf.paragraph(record.feedback);
    conversation();
  }
  section("Catatan trainer");
  const recommendations = [...(summary?.recommendations ?? [])]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
  if (recommendations.length) {
    pdf.paragraph("Rekomendasi coaching", {
      font: "bold",
      color: INK,
      gapAfter: 1,
    });
    recommendations.forEach((item) => bullet(pdf, item.text, { size: 8.5 }));
    pdf.moveTo(pdf.cursor + 2);
  }
  if (!annotations.length)
    pdf.paragraph("Belum ada catatan untuk panggilan ini.");
  else
    [...annotations]
      .sort((a, b) => a.timestamp_ms - b.timestamp_ms)
      .forEach((item, index) =>
        drawFinding(pdf, {
          title: `${index + 1}. ${formatClock(item.timestamp_ms)} · ${CATEGORY_LABELS[item.category]}${item.moment ? ` · ${momentLabel(item.moment)}` : ""} · ${item.is_manual ? "Trainer" : "AI"}`,
          tone: ANNOTATION_TONE[item.category],
          lines: [{ text: item.text }],
        }),
      );
  pdf.finalize();
  return pdf.doc.output("arraybuffer") as ArrayBuffer;
}


const ANNOTATION_TONE: Record<
  TelefunReplayAnnotation["category"],
  ConversationTone
> = {
  strength: "good",
  improvement_area: "partial",
  critical_moment: "fix",
  technique_used: "good",
};

/**
 * Baris transkrip sebagai giliran percakapan. Temuan telaah menempel pada
 * baris yang memuat kutipannya (`startMs`); catatan trainer memakai jam
 * rekaman, jadi menempel pada baris terakhir yang dimulai sebelum jam itu.
 */
function conversationTurns({
  record,
  transcript,
  content,
  annotations,
  holds,
  clockOf,
  lineStart,
}: {
  record: CallRecord;
  transcript: readonly TelefunTranscriptEntry[];
  content: VoiceQualityAssessment["contentReview"] | null;
  annotations: TelefunReplayAnnotation[];
  holds: { atMs: number; text: string }[];
  clockOf: (ms: number) => string;
  lineStart: (startMs: number) => number;
}): ConversationTurn[] {
  const agent = conversationAgentLabel(record.simulationSubject);
  const notesAt = new Map<number, TelefunReplayAnnotation[]>();
  for (const item of [...annotations].sort(
    (a, b) => a.timestamp_ms - b.timestamp_ms,
  )) {
    const entry =
      transcript.filter((line) => lineStart(line.startMs) <= item.timestamp_ms).at(-1) ??
      transcript[0];
    if (entry)
      notesAt.set(entry.startMs, [...(notesAt.get(entry.startMs) ?? []), item]);
  }
  const points = content?.consumerPoints ?? [];
  const agentNotes = content?.agentNotes ?? [];
  return transcript.flatMap((entry, index): ConversationTurn[] => {
    const isAgent = entry.speaker === "agent";
    const tags: ConversationTag[] = [];
    points.forEach((point, pointIndex) => {
      if (point.startMs === entry.startMs)
        tags.push({
          tone: POINT_STATUS_TONE[point.status],
          text: `Poin ${pointLetter(pointIndex)} · ${pointStatus[point.status].label}: ${point.summary}`,
        });
    });
    agentNotes.forEach((note, noteIndex) => {
      if (note.startMs === entry.startMs)
        tags.push({
          tone: note.verdict,
          text: `Catatan ${noteIndex + 1} · ${note.verdict === "fix" ? "Perlu diperbaiki" : "Sudah tepat"}: ${note.note}`,
        });
    });
    const answered = points.flatMap((point, pointIndex) =>
      point.answerStartMs === entry.startMs ? [pointLetter(pointIndex)] : [],
    );
    if (answered.length)
      tags.push({ tone: "info", text: `Menjawab poin ${answered.join(", ")}` });
    for (const item of notesAt.get(entry.startMs) ?? [])
      tags.push({
        tone: ANNOTATION_TONE[item.category],
        text: `${item.is_manual ? "Trainer" : "AI"} · ${CATEGORY_LABELS[item.category]}${item.moment ? ` · ${momentLabel(item.moment)}` : ""}: ${item.text}`,
      });
    const nextStart = transcript[index + 1]?.startMs ?? Number.POSITIVE_INFINITY;
    return [
      {
        side: isAgent ? "participant" : "ai",
        label: `Pesan ${index + 1} · ${isAgent ? agent : `Konsumen AI · ${record.consumerName}`} · ${clockOf(entry.startMs)}`,
        text: entry.text,
        tags,
      },
      ...holds
        .filter((hold) => hold.atMs >= entry.startMs && hold.atMs < nextStart)
        .map((hold): ConversationTurn => ({
          side: "note",
          tone: "partial",
          text: hold.text,
        })),
    ];
  });
}
