import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type ReportParams = {
  title: string;
  periodLabel: string;
  serviceLabel: string;
  mode: string;
  agentName?: string;
  totalFindings: number;
  totalRows: number;
  executiveSummary: string;
  keyFindings: string[];
  scoreAnalysis: string;
  recommendations: string[];
  priorityAreas: string[];
  chartData?: {
    donutData?: { critical: number; nonCritical: number; total: number };
    paretoData?: { name: string; count: number; cumulative: number }[];
    trendData?: { month: string; total: number }[];
  };
};

const PAGE_WIDTH = 595.276;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_SIZE_TITLE = 18;
const FONT_SIZE_H1 = 14;
const FONT_SIZE_H2 = 12;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_SMALL = 8;
const LINE_HEIGHT = 14;
const BLUE = rgb(0.06, 0.13, 0.24);
const DARK = rgb(0.1, 0.1, 0.18);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.94, 0.94, 0.96);
const WHITE = rgb(1, 1, 1);
const TABLE_HEADER = rgb(0.06, 0.13, 0.24);

function wrapText(
  text: string,
  font: any,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawSectionTitle(
  page: any,
  font: any,
  text: string,
  y: number,
): number {
  page.drawText(text, { x: MARGIN, y, size: FONT_SIZE_H1, font, color: BLUE });
  const lineY = y - 4;
  page.drawLine({
    start: { x: MARGIN, y: lineY },
    end: { x: MARGIN + CONTENT_WIDTH, y: lineY },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  return y - 22;
}

function drawBodyText(page: any, font: any, text: string, y: number): number {
  const lines = wrapText(text, font, FONT_SIZE_BODY, CONTENT_WIDTH);
  for (const line of lines) {
    if (y < 60) return -1;
    page.drawText(line, {
      x: MARGIN,
      y,
      size: FONT_SIZE_BODY,
      font,
      color: DARK,
    });
    y -= LINE_HEIGHT;
  }
  return y - 4;
}

function drawBulletList(
  page: any,
  font: any,
  items: string[],
  y: number,
): number {
  for (const item of items) {
    if (y < 60) return -1;
    const lines = wrapText(item, font, FONT_SIZE_BODY, CONTENT_WIDTH - 12);
    page.drawText("•", {
      x: MARGIN,
      y,
      size: FONT_SIZE_BODY,
      font,
      color: DARK,
    });
    for (const line of lines) {
      if (y < 60) return -1;
      page.drawText(line, {
        x: MARGIN + 12,
        y,
        size: FONT_SIZE_BODY,
        font,
        color: DARK,
      });
      y -= LINE_HEIGHT;
    }
    y -= 2;
  }
  return y - 4;
}

function drawTable(
  page: any,
  font: any,
  headers: string[],
  rows: any[][],
  y: number,
): number {
  const colCount = headers.length;
  const colWidth = CONTENT_WIDTH / colCount;

  const headerY = y;
  page.drawRectangle({
    x: MARGIN,
    y: headerY - 16,
    width: CONTENT_WIDTH,
    height: 16,
    color: TABLE_HEADER,
  });

  let xPos = MARGIN + 4;
  for (let i = 0; i < headers.length; i++) {
    page.drawText(headers[i], {
      x: xPos,
      y: headerY - 12,
      size: FONT_SIZE_SMALL,
      font,
      color: WHITE,
    });
    xPos += colWidth;
  }
  y = headerY - 20;

  for (const row of rows) {
    if (y < 50) return -1;
    let maxHeight = 14;
    const rowY = y;
    xPos = MARGIN + 4;
    for (let i = 0; i < row.length; i++) {
      const val = String(row[i] ?? "");
      const lines = wrapText(val, font, FONT_SIZE_SMALL, colWidth - 8);
      const rowH = Math.max(lines.length * 11, 14);
      if (rowH > maxHeight) maxHeight = rowH;

      for (let j = 0; j < lines.length; j++) {
        page.drawText(lines[j], {
          x: xPos,
          y: rowY - j * 11 - 2,
          size: FONT_SIZE_SMALL,
          font,
          color: DARK,
        });
      }
      xPos += colWidth;
    }
    y -= maxHeight + 2;
  }
  return y - 6;
}

export async function buildAiReportPdf(
  params: ReportParams,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Title
  page.drawText(params.title, {
    x: MARGIN,
    y,
    size: FONT_SIZE_TITLE,
    font: boldFont,
    color: BLUE,
  });
  y -= 24;

  // Subtitle
  page.drawText("Laporan Analisis Kualitas QA", {
    x: MARGIN,
    y,
    size: FONT_SIZE_H2,
    font,
    color: GRAY,
  });
  y -= 18;

  // Metadata
  const meta = `Periode: ${params.periodLabel}  |  Layanan: ${params.serviceLabel}  |  Mode: ${params.mode}${params.agentName ? `  |  Agen: ${params.agentName}` : ""}`;
  const metaLines = wrapText(meta, font, FONT_SIZE_SMALL, CONTENT_WIDTH);
  for (const line of metaLines) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: FONT_SIZE_SMALL,
      font,
      color: GRAY,
    });
    y -= 12;
  }
  y -= 10;

  // Summary cards
  const cardWidth = CONTENT_WIDTH / 2 - 6;
  const cardY = y;
  page.drawRectangle({
    x: MARGIN,
    y: cardY - 36,
    width: cardWidth,
    height: 36,
    color: LIGHT,
  });
  page.drawText("Total Temuan", {
    x: MARGIN + 8,
    y: cardY - 24,
    size: FONT_SIZE_SMALL,
    font,
    color: GRAY,
  });
  page.drawText(String(params.totalFindings), {
    x: MARGIN + 8,
    y: cardY - 14,
    size: FONT_SIZE_H1,
    font: boldFont,
    color: BLUE,
  });

  page.drawRectangle({
    x: MARGIN + cardWidth + 12,
    y: cardY - 36,
    width: cardWidth,
    height: 36,
    color: LIGHT,
  });
  page.drawText("Total Baris Data", {
    x: MARGIN + cardWidth + 20,
    y: cardY - 24,
    size: FONT_SIZE_SMALL,
    font,
    color: GRAY,
  });
  page.drawText(String(params.totalRows), {
    x: MARGIN + cardWidth + 20,
    y: cardY - 14,
    size: FONT_SIZE_H1,
    font: boldFont,
    color: BLUE,
  });
  y = cardY - 48;

  // Executive Summary
  y -= 8;
  y = drawSectionTitle(page, boldFont, "Ringkasan Eksekutif", y);
  if (y < 60) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }
  y = drawBodyText(page, font, params.executiveSummary, y);

  // Key Findings
  if (params.keyFindings.length > 0) {
    if (y < 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= 8;
    y = drawSectionTitle(page, boldFont, "Temuan Penting", y);
    if (y < 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y = drawBulletList(page, font, params.keyFindings, y);
  }

  // Score Analysis
  if (y < 60) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }
  y -= 8;
  y = drawSectionTitle(page, boldFont, "Analisis Skor", y);
  if (y < 60) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }
  y = drawBodyText(page, font, params.scoreAnalysis, y);

  // Charts
  if (params.chartData) {
    const cd = params.chartData;

    if (cd.donutData && cd.donutData.total > 0) {
      if (y < 80) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= 8;
      y = drawSectionTitle(page, boldFont, "Distribusi Temuan", y);
      if (y < 60) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      const donutRows = [
        [
          "Critical",
          String(cd.donutData.critical),
          `${((cd.donutData.critical / cd.donutData.total) * 100).toFixed(1)}%`,
        ],
        [
          "Non-Critical",
          String(cd.donutData.nonCritical),
          `${((cd.donutData.nonCritical / cd.donutData.total) * 100).toFixed(1)}%`,
        ],
        ["Total", String(cd.donutData.total), "100%"],
      ];
      y = drawTable(
        page,
        font,
        ["Kategori", "Jumlah", "Persentase"],
        donutRows,
        y,
      );
    }

    if (cd.paretoData && cd.paretoData.length > 0) {
      if (y < 80) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= 8;
      y = drawSectionTitle(page, boldFont, "Top Parameter", y);
      if (y < 60) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      const paretoRows = cd.paretoData
        .slice(0, 10)
        .map((p) => [p.name, String(p.count), String(p.cumulative)]);
      y = drawTable(
        page,
        font,
        ["Parameter", "Jumlah", "Kumulatif"],
        paretoRows,
        y,
      );
    }

    if (cd.trendData && cd.trendData.length > 0) {
      if (y < 80) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= 8;
      y = drawSectionTitle(page, boldFont, "Tren Bulanan", y);
      if (y < 60) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      const trendRows = cd.trendData.map((t) => [t.month, String(t.total)]);
      y = drawTable(page, font, ["Periode", "Total Temuan"], trendRows, y);
    }
  }

  // Recommendations
  if (params.recommendations.length > 0) {
    if (y < 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= 8;
    y = drawSectionTitle(page, boldFont, "Rekomendasi", y);
    if (y < 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y = drawBulletList(page, font, params.recommendations, y);
  }

  // Priority Areas
  if (params.priorityAreas.length > 0) {
    if (y < 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= 8;
    y = drawSectionTitle(page, boldFont, "Area Prioritas Perbaikan", y);
    if (y < 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    drawBulletList(page, font, params.priorityAreas, y);
  }

  // Footer
  const now = new Date().toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // Use the last page for footer
  const pages = doc.getPages();
  const lastPage = pages[pages.length - 1];
  lastPage.drawText(
    `Laporan digenerate otomatis melalui Trainers SuperApp — ${now}`,
    {
      x: MARGIN,
      y: 30,
      size: FONT_SIZE_SMALL,
      font,
      color: GRAY,
    },
  );

  return await doc.save();
}
