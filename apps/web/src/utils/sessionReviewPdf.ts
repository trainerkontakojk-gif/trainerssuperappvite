import { PdfDocument } from "./agentReportPdfLayout";
import { createMeasurer, pdfSafeText } from "./agentReportPdfText";
import { CONTENT_WIDTH } from "./agentReportPdfTheme";

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

export function drawIdentityBlock(
  pdf: PdfDocument,
  rows: [string, string][],
): void {
  pdf.heading("Identitas", undefined, 12);
  for (const [label, value] of rows) pdf.paragraph(`${label}: ${value}`);
}

export function drawTranscriptAppendix(
  pdf: PdfDocument,
  entries: {
    number: number | undefined;
    speaker: string;
    time: string;
    text: string;
  }[],
): void {
  pdf.ensureSpace(pdf.remaining + 1);
  pdf.heading("Lampiran: Transkrip", undefined, 12);
  for (const entry of entries) {
    pdf.paragraph(
      `${entry.number === undefined ? "" : `Pesan ${entry.number} · `}${entry.speaker} · ${entry.time}`,
      { font: "bold", gapAfter: 1 },
    );
    pdf.paragraph(entry.text, { gapAfter: 3 });
  }
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
