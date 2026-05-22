export function buildHtmlReport(params: {
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
}): string {
  const donutHtml = params.chartData?.donutData
    ? `<div class="chart-card">
        <h3>Distribusi Temuan</h3>
        <p>Critical: ${params.chartData.donutData.critical} | Non-Critical: ${params.chartData.donutData.nonCritical}</p>
       </div>`
    : "";

  const paretoHtml = params.chartData?.paretoData?.length
    ? `<div class="chart-card">
        <h3>Top Parameter</h3>
        <table><tr><th>Parameter</th><th>Jumlah</th><th>Kumulatif</th></tr>
        ${params.chartData.paretoData.map((p) => `<tr><td>${p.name}</td><td>${p.count}</td><td>${p.cumulative}</td></tr>`).join("")}
        </table>
       </div>`
    : "";

  const trendHtml = params.chartData?.trendData?.length
    ? `<div class="chart-card">
        <h3>Tren Bulanan</h3>
        <table><tr><th>Periode</th><th>Total Temuan</th></tr>
        ${params.chartData.trendData.map((t) => `<tr><td>${t.month}</td><td>${t.total}</td></tr>`).join("")}
        </table>
       </div>`
    : "";

  const findingsHtml = params.keyFindings.length
    ? `<div class="section findings">
        <h2>Temuan Penting</h2>
        <ul>${params.keyFindings.map((f) => `<li>${f}</li>`).join("")}</ul>
       </div>`
    : "";

  const recHtml = params.recommendations.length
    ? `<div class="section">
        <h2>Rekomendasi</h2>
        <ul>${params.recommendations.map((r) => `<li>${r}</li>`).join("")}</ul>
       </div>`
    : "";

  const priorityHtml = params.priorityAreas.length
    ? `<div class="section">
        <h2>Area Prioritas Perbaikan</h2>
        <ul>${params.priorityAreas.map((p) => `<li>${p}</li>`).join("")}</ul>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${params.title}</title>
<style>
  @page { size: A4; margin: 2cm; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif; color: #1a1a2e;
    line-height: 1.6; padding: 40px; max-width: 210mm; margin: 0 auto;
  }
  h1 { font-size: 22px; text-align: center; margin-bottom: 4px; color: #16213e; }
  .subtitle { text-align: center; color: #666; font-size: 13px; margin-bottom: 24px; }
  .meta { text-align: center; font-size: 12px; color: #888; margin-bottom: 28px; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 15px; color: #0f3460; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
  .section p { font-size: 13px; text-align: justify; }
  ul { padding-left: 20px; }
  ul li { font-size: 13px; margin: 4px 0; }
  .chart-card { margin-bottom: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px; }
  .chart-card h3 { font-size: 14px; margin-bottom: 8px; }
  .chart-card p { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th { background: #16213e; color: #fff; padding: 6px 8px; text-align: left; }
  td { padding: 4px 8px; border-bottom: 1px solid #ddd; }
  .summary-card { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
  .stat { flex: 1; min-width: 120px; background: #f0f4ff; border-radius: 6px; padding: 12px; text-align: center; }
  .stat .num { font-size: 24px; font-weight: 700; color: #0f3460; }
  .stat .lbl { font-size: 11px; color: #666; }
  pre { white-space: pre-wrap; font-family: inherit; }
  @media print { body { padding: 0; } .section { page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>${params.title}</h1>
<p class="subtitle">Laporan Analisis Kualitas QA</p>
<p class="meta">Periode: ${params.periodLabel} &nbsp;|&nbsp; Layanan: ${params.serviceLabel} &nbsp;|&nbsp; Mode: ${params.mode}${params.agentName ? ` &nbsp;|&nbsp; Agen: ${params.agentName}` : ""}</p>

<div class="summary-card">
  <div class="stat"><div class="num">${params.totalFindings}</div><div class="lbl">Total Temuan</div></div>
  <div class="stat"><div class="num">${params.totalRows}</div><div class="lbl">Total Baris Data</div></div>
</div>

<div class="section">
  <h2>Ringkasan Eksekutif</h2>
  <pre>${params.executiveSummary}</pre>
</div>

${findingsHtml}

<div class="section">
  <h2>Analisis Skor</h2>
  <pre>${params.scoreAnalysis}</pre>
</div>

${donutHtml}
${paretoHtml}
${trendHtml}

${recHtml}
${priorityHtml}

<p style="text-align: center; font-size: 11px; color: #999; margin-top: 32px;">
  Laporan digenerate otomatis melalui Trainers SuperApp
</p>
</body>
</html>`;
}
