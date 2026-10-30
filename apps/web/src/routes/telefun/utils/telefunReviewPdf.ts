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
import {
  createSessionReviewPdf,
  drawIdentityBlock,
  drawTranscriptAppendix,
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
  canRerun,
}: {
  record: CallRecord;
  assessment: VoiceQualityAssessment | null | undefined;
  previous: number | null;
  transcript: readonly TelefunTranscriptEntry[];
  annotations: TelefunReplayAnnotation[];
  summary: TelefunCoachingSummary | null;
  clockOf: (ms: number) => string;
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
  const section = (title: string) => pdf.heading(title, undefined, 9);
  const quote = (label: string, ms: number, text: string) =>
    pdf.paragraph(`${label} ${clockOf(ms)}: “${text}”`);
  section("Skor suara");
  pdf.paragraph(
    `${formatTelefunScore(score)} / 10 · ${telefunScoreVerdict(score)}${view?.change ? ` · ${view.change}` : ""}`,
    { font: "bold" },
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
        pdf.paragraph(`Profil suara: ${view.profile.overallSummary}`);
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
    const unavailable =
      view.content === null
        ? "Transkrip percakapan tidak tersimpan, jadi isi panggilan ini tidak bisa ditelaah."
        : `Belum tersedia untuk hasil ini. Pertanyaan konsumen dan kalimat agen hanya ditelaah pada hasil yang dibuat setelah fitur ini dirilis.${canRerun ? " Jalankan Telaah ulang untuk melengkapinya." : ""}`;
    const notes = (verdict: "fix" | "good") =>
      view.content?.agentNotes.forEach((note, index) => {
        if (note.verdict !== verdict) return;
        pdf.paragraph(
          `${index + 1}. ${note.category ? TELEFUN_AGENT_NOTE_LABELS[note.category] + " · " : ""}${verdict === "fix" ? "Perlu diperbaiki" : "Sudah tepat"}`,
          { font: "bold" },
        );
        quote("Agen", note.startMs, note.quote);
        pdf.paragraph(note.note);
        if (note.comparison)
          quote("Pembanding", note.comparison.startMs, note.comparison.quote);
        if (verdict === "fix" && note.example)
          pdf.paragraph(`Kalimat yang lebih tepat: ${note.example}`);
      });
    section("Perbaiki dulu");
    if (!view.content) pdf.paragraph(unavailable);
    else if (!view.toFix.length)
      pdf.paragraph("Tidak ada kalimat agen yang ditandai perlu diperbaiki.");
    else notes("fix");
    if (view.nextSteps.length) {
      pdf.paragraph("Langkah latihan berikutnya", { font: "bold" });
      view.nextSteps.slice(0, 3).forEach((step) => pdf.paragraph(step));
    }
    section("Pertanyaan konsumen");
    if (!view.content) pdf.paragraph(unavailable);
    else if (!view.content.consumerPoints.length)
      pdf.paragraph("AI tidak menemukan pertanyaan konsumen di panggilan ini.");
    else
      orderedConsumerPoints(view.content.consumerPoints).forEach(
        ({ point, index }) => {
          pdf.paragraph(
            `${pointLetter(index)} · ${point.summary} · ${pointStatus[point.status].label}`,
            { font: "bold" },
          );
          if (point.reason) pdf.paragraph(point.reason);
          quote("Konsumen", point.startMs, point.quote);
          if (point.answerStartMs !== null && point.answerQuote)
            quote("Dijawab di", point.answerStartMs, point.answerQuote);
          else pdf.paragraph("Belum ada jawaban agen untuk pertanyaan ini.");
        },
      );
    section("Alasan skor");
    buildTelefunScoreDetails(assessment, transcript).forEach(
      ({ aspect, metric, line, tip }) => {
        pdf.paragraph(
          `${aspect.label} · ${aspect.score === null ? "Belum dinilai" : `${formatTelefunScore(aspect.score)} / 10 · ${aspect.verdict}`}`,
          { font: "bold" },
        );
        if (line) pdf.paragraph(`${clockOf(line.startMs)} · ${aspect.label}`);
        pdf.paragraph(
          aspect.feedback ||
            "Penjelasan penilaian belum tersedia untuk aspek ini.",
        );
        if (tip) pdf.paragraph(`Latihan: ${tip}`);
        if (metric?.examplePhrase)
          pdf.paragraph(`Contoh: “${metric.examplePhrase}”`);
      },
    );
    section("Sudah baik");
    if (view.good.length && view.content) notes("good");
    else if (assessment.strengths.length) {
      pdf.paragraph("Kekuatan menurut penilaian AI", { font: "bold" });
      assessment.strengths.forEach((item) => pdf.paragraph(item));
    } else if (!view.content) pdf.paragraph(unavailable);
    else
      pdf.paragraph("Belum ada contoh ucapan agen yang ditandai sudah tepat.");
  } else {
    pdf.paragraph(
      "Rincian per aspek tidak tersimpan untuk panggilan lama ini.",
    );
    if (record.feedback) pdf.paragraph(record.feedback);
  }
  section("Catatan trainer");
  const recommendations = [...(summary?.recommendations ?? [])]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
  if (recommendations.length) {
    pdf.paragraph("Rekomendasi coaching", { font: "bold" });
    recommendations.forEach((item) => pdf.paragraph(item.text));
  }
  if (!annotations.length)
    pdf.paragraph("Belum ada catatan untuk panggilan ini.");
  else
    [...annotations]
      .sort((a, b) => a.timestamp_ms - b.timestamp_ms)
      .forEach((item, index) => {
        pdf.paragraph(
          `${index + 1}. ${formatClock(item.timestamp_ms)} · ${CATEGORY_LABELS[item.category]}${item.moment ? ` · ${momentLabel(item.moment)}` : ""} · ${item.is_manual ? "Trainer" : "AI"}`,
          { font: "bold" },
        );
        pdf.paragraph(item.text);
      });
  drawTranscriptAppendix(
    pdf,
    transcript.map((entry, index) => ({
      number: index + 1,
      speaker: entry.speaker === "agent" ? "Agen" : "Konsumen",
      time: clockOf(entry.startMs),
      text: entry.text,
    })),
  );
  pdf.finalize();
  return pdf.doc.output("arraybuffer") as ArrayBuffer;
}
