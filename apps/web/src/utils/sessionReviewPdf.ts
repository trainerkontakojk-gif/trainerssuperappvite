import type { SimulationSubjectSnapshot } from "@trainers/types";
import { PdfDocument } from "./agentReportPdfLayout";
import {
  createMeasurer,
  pdfSafeText,
  wrapPdfText,
} from "./agentReportPdfText";
import {
  CONTENT_WIDTH,
  FONT,
  INK,
  INK_FAINT,
  INK_MUTE,
  MARGIN_LEFT,
  MARGIN_TOP,
  PAGE_WIDTH,
  TONE_BAD,
  TONE_OK,
  TONE_WARN,
  WASH,
  line,
  type Rgb,
} from "./agentReportPdfTheme";

export async function createSessionReviewPdf({
  title,
  headerLeft,
  headerRight,
  metadata,
}: {
  title: string;
  headerLeft: string;
  headerRight: string;
  metadata: { subject: string; author: string; creator: string };
}): Promise<PdfDocument> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  doc.setProperties({
    title: pdfSafeText(title),
    subject: pdfSafeText(metadata.subject),
    author: metadata.author,
    creator: metadata.creator,
  });
  const measure = createMeasurer(doc);
  const maxRightWidth = Math.max(
    0,
    CONTENT_WIDTH - measure(pdfSafeText(headerLeft), "normal", 8) - 13,
  );
  let right = pdfSafeText(headerRight);
  if (measure(right, "normal", 8) > maxRightWidth) {
    const separator = headerRight.lastIndexOf(" • ");
    const suffix =
      separator >= 0 ? pdfSafeText(headerRight.slice(separator)) : "";
    const prefix =
      separator >= 0 ? headerRight.slice(0, separator) : headerRight;
    let shortened = "";
    for (const character of prefix) {
      const next = shortened + character;
      if (
        measure(`${pdfSafeText(next)}...${suffix}`, "normal", 8) > maxRightWidth
      )
        break;
      shortened = next;
    }
    right = `${pdfSafeText(shortened)}...${suffix}`;
  }
  const pdf = new PdfDocument(doc, { left: headerLeft, right }, measure);
  pdf.begin();
  return pdf;
}

/** Judul seksi dengan jarak dari isi sebelumnya, kecuali di awal halaman. */
export function drawSection(pdf: PdfDocument, title: string): void {
  if (pdf.cursor > MARGIN_TOP) pdf.moveTo(pdf.cursor + 4);
  pdf.heading(title, undefined, 10, 13);
}

/** Identitas sesi sebagai kisi tiga kolom: label kecil di atas nilainya. */
export function drawIdentityBlock(
  pdf: PdfDocument,
  rows: [string, string][],
): void {
  drawSection(pdf, "Identitas");
  const columns = 3;
  const gap = 4;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  for (let start = 0; start < rows.length; start += columns) {
    const cells = rows.slice(start, start + columns).map(([label, value]) => ({
      label,
      lines: wrapPdfText(value || "-", width, pdf.measure, "bold", 9),
    }));
    const height =
      line(7) + Math.max(...cells.map((cell) => cell.lines.length)) * line(9);
    pdf.ensureSpace(height + 2);
    const top = pdf.cursor;
    cells.forEach((cell, index) => {
      const x = MARGIN_LEFT + index * (width + gap);
      pdf.doc.setFont(FONT, "normal");
      pdf.doc.setFontSize(7);
      pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
      pdf.doc.text(pdfSafeText(cell.label), x, top, { baseline: "top" });
      pdf.doc.setFont(FONT, "bold");
      pdf.doc.setFontSize(9);
      pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
      cell.lines.forEach((value, lineIndex) =>
        pdf.doc.text(value, x, top + line(7) + lineIndex * line(9), {
          baseline: "top",
        }),
      );
    });
    pdf.moveTo(top + height + 2);
  }
}

/** Baris isi temuan; kutipan (`quote`) dicetak lebih menjorok dan redup. */
export interface FindingLine {
  text: string;
  quote?: boolean;
}

const FINDING_INDENT = 4;

/**
 * Satu temuan telaah: judul tebal dengan penanda warna di kiri, isinya
 * menjorok, dan jarak ke temuan berikutnya supaya tidak menjadi dinding teks.
 */
export function drawFinding(
  pdf: PdfDocument,
  {
    title,
    tone,
    lines,
  }: { title: string; tone: ConversationTone; lines: FindingLine[] },
): void {
  const color = TONE_INK[tone];
  pdf.ensureSpace(line(9) + line(8.5) * Math.min(2, lines.length));
  pdf.doc.setFillColor(color[0], color[1], color[2]);
  pdf.doc.rect(MARGIN_LEFT, pdf.cursor + 0.4, 1, line(9) - 1.2, "F");
  pdf.paragraph(title, {
    font: "bold",
    size: 9,
    color: INK,
    indent: FINDING_INDENT,
  });
  for (const item of lines)
    pdf.paragraph(
      item.text,
      item.quote
        ? { indent: FINDING_INDENT + 3, color: INK_MUTE }
        : { indent: FINDING_INDENT },
    );
  pdf.moveTo(pdf.cursor + 2.6);
}

/** Nama pembicara agen di percakapan: nama peserta bila tercatat. */
export function conversationAgentLabel(
  subject: SimulationSubjectSnapshot | null | undefined,
): string {
  const name =
    subject?.type === "participant" || subject?.type === "self"
      ? subject.displayName?.trim()
      : "";
  return name && name !== "Diri sendiri" ? `Agen · ${name}` : "Agen";
}

/** Warna penanda telaah di bawah pesan. */
export type ConversationTone = "fix" | "partial" | "good" | "info";

/** Warna status poin konsumen, sama untuk ketiga modul. */
export const POINT_STATUS_TONE: Record<
  "answered" | "partial" | "unanswered",
  ConversationTone
> = {
  answered: "good",
  partial: "partial",
  unanswered: "fix",
};

export interface ConversationTag {
  tone: ConversationTone;
  text: string;
}

/**
 * Satu giliran percakapan dengan AI. `ai` adalah konsumen yang diperankan AI
 * (kiri), `participant` adalah agen yang berlatih (kanan), `note` adalah
 * pesan sistem atau penanda telaah di antara pesan.
 */
export type ConversationTurn =
  | {
      side: "ai" | "participant";
      label: string;
      text: string;
      tags?: ConversationTag[];
    }
  | { side: "note"; text: string; tone?: ConversationTone };

const TONE_INK: Record<ConversationTone, Rgb> = {
  fix: TONE_BAD,
  partial: TONE_WARN,
  good: TONE_OK,
  info: INK_MUTE,
};
const PARTICIPANT_FILL: Rgb = [224, 234, 250];
const BUBBLE_WIDTH = CONTENT_WIDTH * 0.76;
const BUBBLE_PAD_X = 3.2;
const BUBBLE_PAD_Y = 2.2;
const BUBBLE_TEXT = 9;
const LABEL_TEXT = 7.5;
const TAG_TEXT = 7.5;
const TAG_MIN_WIDTH = 80;

/**
 * Percakapan peserta dengan AI sebagai gelembung chat: konsumen AI di kiri,
 * agen di kanan, temuan telaah tercetak tepat di bawah pesan yang dimaksud.
 * Selalu mulai di halaman baru; gelembung panjang dipecah per halaman.
 */
export function drawConversation(
  pdf: PdfDocument,
  {
    title,
    scope,
    turns,
    empty,
  }: {
    title: string;
    scope: string;
    turns: ConversationTurn[];
    empty: string;
  },
): void {
  // Mulai di halaman baru hanya bila sisa halaman tidak cukup untuk beberapa pesan.
  pdf.ensureSpace(70);
  if (pdf.cursor > MARGIN_TOP) pdf.moveTo(pdf.cursor + 6);
  pdf.heading(title, scope, 20, 13);
  pdf.moveTo(pdf.cursor + 2);
  if (!turns.length) {
    pdf.paragraph(empty);
    return;
  }
  const doc = pdf.doc;
  const textLine = line(BUBBLE_TEXT);
  for (const turn of turns) {
    if (turn.side === "note") {
      drawNote(pdf, turn.text, turn.tone ?? "info");
      continue;
    }
    const isAi = turn.side === "ai";
    // Paragraf (email, pesan panjang) tetap dipisah satu baris kosong.
    const lines = turn.text
      .split(/\r?\n[^\S\n]*\r?\n\s*/)
      .flatMap((paragraph, index) => [
        ...(index > 0 ? [""] : []),
        ...wrapPdfText(
          paragraph,
          BUBBLE_WIDTH - BUBBLE_PAD_X * 2,
          pdf.measure,
          "normal",
          BUBBLE_TEXT,
        ),
      ]);
    // Gelembung selebar isinya, menempel ke sisi pembicaranya.
    const width = Math.min(
      BUBBLE_WIDTH,
      Math.max(
        24,
        ...lines.map(
          (value) =>
            pdf.measure(value, "normal", BUBBLE_TEXT) + BUBBLE_PAD_X * 2,
        ),
      ),
    );
    const x = isAi ? MARGIN_LEFT : MARGIN_LEFT + CONTENT_WIDTH - width;
    // Label selalu sehalaman dengan dua baris pertama pesannya.
    pdf.ensureSpace(
      line(LABEL_TEXT) +
        BUBBLE_PAD_Y * 2 +
        textLine * Math.min(2, lines.length),
    );
    pdf.writeLine(
      turn.label,
      isAi ? x + 1 : x + width - 1,
      { font: "bold", size: LABEL_TEXT, color: INK_MUTE },
      isAi ? "left" : "right",
    );
    pdf.moveTo(pdf.cursor + 0.6);
    const fill = isAi ? WASH : PARTICIPANT_FILL;
    for (let index = 0; index < lines.length; ) {
      const fit = Math.floor((pdf.remaining - BUBBLE_PAD_Y * 2) / textLine);
      if (fit < 1) {
        pdf.ensureSpace(pdf.remaining + 1);
        continue;
      }
      const chunk = lines.slice(index, index + fit);
      const top = pdf.cursor;
      const height = chunk.length * textLine + BUBBLE_PAD_Y * 2;
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.roundedRect(x, top, width, height, 2.2, 2.2, "F");
      doc.setFont(FONT, "normal");
      doc.setFontSize(BUBBLE_TEXT);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      chunk.forEach((value, lineIndex) =>
        doc.text(
          value,
          x + BUBBLE_PAD_X,
          top + BUBBLE_PAD_Y + lineIndex * textLine,
          { baseline: "top" },
        ),
      );
      pdf.moveTo(top + height);
      index += chunk.length;
    }
    if (turn.tags?.length) {
      pdf.moveTo(pdf.cursor + 1.2);
      // Penanda agen dimulai di bawah gelembungnya bila masih cukup lebar.
      const tagX = isAi
        ? MARGIN_LEFT
        : Math.min(x, MARGIN_LEFT + CONTENT_WIDTH - TAG_MIN_WIDTH);
      for (const tag of turn.tags) drawTag(pdf, tagX, tag);
    }
    pdf.moveTo(pdf.cursor + 3.4);
  }
}

/** Penanda telaah: titik berwarna lalu teks yang membungkus di sisinya. */
function drawTag(pdf: PdfDocument, x: number, tag: ConversationTag): void {
  const indent = 3.4;
  const color = TONE_INK[tag.tone];
  const lines = wrapPdfText(
    tag.text,
    Math.min(BUBBLE_WIDTH, MARGIN_LEFT + CONTENT_WIDTH - x) - indent,
    pdf.measure,
    "normal",
    TAG_TEXT,
  );
  pdf.ensureSpace(line(TAG_TEXT));
  pdf.doc.setFillColor(color[0], color[1], color[2]);
  pdf.doc.circle(x + 1.6, pdf.cursor + line(TAG_TEXT) / 2 - 0.3, 0.9, "F");
  for (const value of lines)
    pdf.writeLine(value, x + indent, { size: TAG_TEXT, color });
  pdf.moveTo(pdf.cursor + 0.4);
}

/** Pesan sistem atau penanda di antara pesan: teks di tengah, diapit garis. */
function drawNote(
  pdf: PdfDocument,
  text: string,
  tone: ConversationTone,
): void {
  const color = tone === "info" ? INK_FAINT : TONE_INK[tone];
  const lines = wrapPdfText(
    text,
    CONTENT_WIDTH * 0.6,
    pdf.measure,
    "normal",
    TAG_TEXT,
  );
  pdf.ensureSpace(lines.length * line(TAG_TEXT) + 3.4);
  const widest = Math.max(
    ...lines.map((value) => pdf.measure(value, "normal", TAG_TEXT)),
  );
  const middle = pdf.cursor + line(TAG_TEXT) / 2 - 0.3;
  pdf.doc.setDrawColor(color[0], color[1], color[2]);
  pdf.doc.setLineWidth(0.2);
  pdf.doc.setLineDashPattern([1, 1], 0);
  pdf.doc.line(MARGIN_LEFT, middle, PAGE_WIDTH / 2 - widest / 2 - 3, middle);
  pdf.doc.line(
    PAGE_WIDTH / 2 + widest / 2 + 3,
    middle,
    MARGIN_LEFT + CONTENT_WIDTH,
    middle,
  );
  pdf.doc.setLineDashPattern([], 0);
  for (const value of lines)
    pdf.writeLine(value, PAGE_WIDTH / 2, { size: TAG_TEXT, color }, "center");
  pdf.moveTo(pdf.cursor + 3.4);
}

export function downloadPdf(bytes: ArrayBuffer, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
