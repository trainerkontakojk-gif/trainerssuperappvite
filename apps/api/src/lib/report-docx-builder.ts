import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ImageRun, HeadingLevel, AlignmentType,
} from 'docx';

function cellPara(text: string, bold = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold, size: 18 })],
  });
}

function pngFromBase64(base64: string): Buffer {
  const m = base64.match(/^data:image\/\w+;base64,(.+)$/);
  return Buffer.from(m ? m[1]! : base64, 'base64');
}

export async function buildAiReportDocx(input: {
  title: string;
  periodLabel: string;
  serviceLabel: string;
  mode: 'layanan' | 'individu';
  agentName?: string;
  totalFindings: number;
  totalRows: number;
  executiveSummary: string;
  keyFindings: string[];
  scoreAnalysis: string;
  recommendations: string[];
  priorityAreas: string[];
  chartImages?: { pareto?: string | null; donut?: string | null; trend?: string | null };
}): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      text: input.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Layanan: ${input.serviceLabel}  •  Periode: ${input.periodLabel}${input.agentName ? `  •  Agen: ${input.agentName}` : ''}`,
          size: 22, italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
  );

  // 1. Executive Summary
  children.push(
    new Paragraph({
      text: '1. Ringkasan Eksekutif',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Total Temuan: ${input.totalFindings} dari ${input.totalRows} data` })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: input.executiveSummary, size: 20 })],
      spacing: { after: 200 },
    }),
  );

  // 2. Key Findings Table
  if (input.keyFindings.length > 0) {
    children.push(
      new Paragraph({
        text: '2. Temuan Utama',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 120, after: 120 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, children: [cellPara('No.', true)] }),
              new TableCell({ width: { size: 90, type: WidthType.PERCENTAGE }, children: [cellPara('Temuan', true)] }),
            ],
          }),
          ...input.keyFindings.map((f, i) =>
            new TableRow({
              children: [
                new TableCell({ children: [cellPara(String(i + 1))] }),
                new TableCell({ children: [cellPara(f)] }),
              ],
            })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 200 } }),
    );
  }

  // Charts section
  const charts = input.chartImages;
  if (charts?.pareto) {
    children.push(
      new Paragraph({
        text: 'Pareto Chart',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120, after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: pngFromBase64(charts.pareto),
            transformation: { width: 520, height: 300 },
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  if (charts?.donut) {
    children.push(
      new Paragraph({
        text: 'Distribusi Temuan',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120, after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: pngFromBase64(charts.donut),
            transformation: { width: 400, height: 280 },
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  if (charts?.trend) {
    children.push(
      new Paragraph({
        text: 'Trend',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120, after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: pngFromBase64(charts.trend),
            transformation: { width: 520, height: 300 },
          }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  // 3. Score Analysis
  children.push(
    new Paragraph({
      text: '3. Analisis Skor',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 120, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: input.scoreAnalysis, size: 20 })],
      spacing: { after: 200 },
    }),
  );

  // 4. Recommendations
  if (input.recommendations.length > 0) {
    children.push(
      new Paragraph({
        text: '4. Rekomendasi',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 120, after: 120 },
      }),
      ...input.recommendations.map(r =>
        new Paragraph({
          children: [new TextRun({ text: `• ${r}`, size: 20 })],
          spacing: { after: 80 },
          indent: { left: 720 },
        })
      ),
      new Paragraph({ spacing: { after: 120 } }),
    );
  }

  // 5. Priority Areas
  if (input.priorityAreas.length > 0) {
    children.push(
      new Paragraph({
        text: '5. Area Prioritas',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 120, after: 120 },
      }),
      ...input.priorityAreas.map((a, i) =>
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${a}`, size: 20 })],
          spacing: { after: 80 },
          indent: { left: 720 },
        })
      ),
      new Paragraph({ spacing: { after: 200 } }),
    );
  }

  // Footer
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Dokumen ini dihasilkan secara otomatis oleh AI Trainers SuperApp.',
          size: 16, italics: true, color: '94A3B8',
        }),
      ],
      spacing: { before: 300 },
    }),
  );

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
