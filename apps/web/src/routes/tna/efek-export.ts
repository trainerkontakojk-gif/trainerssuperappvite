import type { EfekChartPoint, EfekProgramReport } from "@trainers/types";
import { SERVICE_LABELS } from "../../lib/scoring";
import type { EfekReportSearch } from "../../router";
import {
  STATUS_LABELS,
  chartGeometry,
  fmt,
  fmtDelta,
  monthLabel,
  monthShort,
  offsetText,
  sessionStatusLabel,
} from "./efek-report-format";
import { sessionDates } from "./utils";

/**
 * EFEK phase 3: one self-contained, printable HTML file for a program report,
 * built in the browser from the report the page already loaded. Every value
 * from the database goes through `esc`, so names cannot inject markup.
 */

const esc = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function chartSvg(
  title: string,
  points: EfekChartPoint[],
  pick: (p: EfekChartPoint) => [number | null, number | null],
  participants: string,
  comparison: string,
) {
  const g = chartGeometry(points, pick);
  return `<figure class="chart"><figcaption>${esc(title)}</figcaption>
<p class="legend"><span class="sw solid"></span>${esc(participants)} <span class="sw dash"></span>${esc(comparison)} <span class="sw band"></span>Bulan pelatihan</p>
<svg viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="${esc(title)}">
${g.band ? `<rect x="${g.band.x}" y="${g.band.y}" width="${g.band.width}" height="${g.band.height}" fill="#0e74901a"/>` : ""}
${g.grid.map((l) => `<line x1="${l.x1}" x2="${l.x2}" y1="${l.y}" y2="${l.y}" stroke="#e5e5e5"/><text x="${l.labelX}" y="${l.y + 3}" text-anchor="end">${esc(l.label)}</text>`).join("")}
${g.ticks.map((t) => `<text x="${t.x}" y="${t.y}" text-anchor="middle">${esc(t.label)}</text>`).join("")}
<path d="${g.comparison}" fill="none" stroke="#7c7c7c" stroke-width="2" stroke-dasharray="5 4"/>
<path d="${g.participants}" fill="none" stroke="#0e7490" stroke-width="2.5"/>
${g.dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="3.5" fill="#0e7490"/>`).join("")}
</svg></figure>`;
}

const STYLE = `
*{box-sizing:border-box}body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0a0a0a;background:#fff;margin:0 auto;max-width:1040px;padding:32px 24px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px}h3{font-size:14px;margin:18px 0 6px}
.meta{color:#555;margin:0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:16px}
.stat{border:1px solid #e5e5e5;border-radius:8px;padding:10px 12px}.stat b{display:block;font-size:20px}.stat span{color:#555;font-size:12px}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:12px}.chart{margin:0;border:1px solid #e5e5e5;border-radius:8px;padding:12px}
.chart figcaption{font-weight:600}.chart svg{width:100%;height:auto}.chart text{font-size:10px;fill:#707070}
.legend{font-size:12px;color:#555;margin:4px 0}.sw{display:inline-block;width:14px;margin:0 4px 3px 10px;vertical-align:middle}
.sw.solid{border-top:2px solid #0e7490}.sw.dash{border-top:2px dashed #7c7c7c}.sw.band{height:10px;background:#0e749026}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:12.5px;vertical-align:top}
th{background:#f5f5f5;color:#555;font-size:11.5px}td.n,th.n{text-align:right}.up{color:#15803d}.down{color:#b91c1c}.muted{color:#707070}
.chip{display:inline-block;border-radius:99px;padding:1px 8px;font-size:11px;font-weight:600;background:#f0f0ef;margin-right:4px}
ul{margin:6px 0;padding-left:20px;color:#333}
@media print{body{padding:0;max-width:none}.charts{grid-template-columns:1fr 1fr}h2{break-after:avoid}tr,figure,.month{break-inside:avoid}}
@media (max-width:700px){.charts{grid-template-columns:1fr}}
`;

const tone = (n: number | null) =>
  n === null || Math.abs(n) < 1 ? "" : n > 0 ? "up" : "down";

export function buildEfekProgramHtml(
  report: EfekProgramReport,
  search: EfekReportSearch,
  now = new Date(),
) {
  const p = report.program;
  const service = SERVICE_LABELS[p.service_type];
  const session = report.sessions.find((s) => s.id === search.session);
  const filters = [
    `Jendela banding ${report.window} bulan`,
    `Tahun sesi: ${search.year ?? "semua"}`,
    `Tim: ${search.tim ?? "semua"}`,
    `Sesi: ${session?.title ?? "semua"}`,
  ];
  const stat = (value: string, label: string, cls = "") =>
    `<div class="stat"><b class="${cls}">${esc(value)}</b><span>${esc(label)}</span></div>`;
  const participantsLabel = `Peserta ${p.name}`;
  const comparisonLabel = `Agent ${service} lain`;

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EFEK ${esc(p.name)} · Laporan</title><style>${STYLE}</style></head><body>
<h1>EFEK · ${esc(p.name)} · layanan ${esc(service)}</h1>
<p class="meta">Evaluasi Efektivitas dan Kinerja. Dibuat ${esc(DATE.format(now))} · Data SIDAK sampai ${esc(monthLabel(report.data_until))}</p>
<p class="meta">${filters.map(esc).join(" · ")}</p>
<div class="grid">
${stat(fmtDelta(p.avg_delta), "poin QA rata-rata", tone(p.avg_delta))}
${stat(`${p.naik} / ${p.stabil} / ${p.turun}`, "naik / stabil / turun")}
${stat(`${p.evaluated} dari ${p.participants}`, "bisa dievaluasi")}
${stat(fmtDelta(p.avg_relative_delta), "Δ relatif agent lain", tone(p.avg_relative_delta))}
${stat(`${fmt(p.findings_per_session_before)} → ${fmt(p.findings_per_session_after)}`, "temuan per sesi audit")}
</div>
<h2>Cara hitung</h2>
<ul>
<li>Sebelum: rata-rata skor QA bulanan SIDAK pada ${report.window} bulan yang sudah selesai sebelum bulan pelatihan. Sesudah: ${report.window} bulan yang sudah selesai setelahnya.</li>
<li>Bulan pelatihan dan bulan yang masih berjalan tidak dihitung.</li>
<li>Naik atau turun bila berubah 1 poin atau lebih. Data tipis bila hanya 1 bulan, atau kurang dari 5 sesi audit, di salah satu sisi.</li>
<li>Δ relatif = perubahan peserta dikurangi perubahan agent ${esc(service)} lain yang tidak ikut ${esc(p.name)} pada bulan yang sama.</li>
</ul>
<h2>Grafik relatif bulan pelatihan</h2>
<div class="charts">
${chartSvg("Skor QA rata-rata", report.chart, (c) => [c.score, c.comparison_score], participantsLabel, comparisonLabel)}
${chartSvg("Temuan per sesi audit", report.chart, (c) => [c.findings_per_session, c.comparison_findings_per_session], participantsLabel, comparisonLabel)}
</div>
<h2>Sesi pelatihan</h2>
<table><thead><tr><th>Sesi</th><th>Tanggal</th><th class="n">Peserta</th><th class="n">Dievaluasi</th><th class="n">Rerata Δ skor</th><th>Status</th></tr></thead><tbody>
${report.sessions
  .map(
    (s) =>
      `<tr><td>${esc(s.title)}</td><td>${esc(sessionDates(s))}</td><td class="n">${s.participants}</td><td class="n">${s.evaluated}</td><td class="n ${tone(s.avg_delta)}">${esc(fmtDelta(s.avg_delta))}</td><td>${esc(sessionStatusLabel(s))}</td></tr>`,
  )
  .join("\n")}
</tbody></table>
<h2>Peserta</h2>
<table><thead><tr><th>Peserta</th><th>Sesi</th><th>Temuan per sesi sebelum → sesudah</th><th>Skor QA sebelum → sesudah</th><th class="n">Δ skor</th><th class="n">Δ relatif</th><th>Status</th></tr></thead><tbody>
${report.participants
  .map(
    (r) =>
      `<tr><td><b>${esc(r.nama)}</b><br><span class="muted">${esc(r.tim ?? "Tanpa tim")} · ${r.months_before} bln sebelum, ${r.months_after} bln sesudah</span></td><td>${esc(r.session_title)}<br><span class="muted">${esc(monthShort({ year: Number(r.start_date.slice(0, 4)), month: Number(r.start_date.slice(5, 7)) }))}</span></td><td>${esc(fmt(r.findings_per_session_before))} → ${esc(fmt(r.findings_per_session_after))}</td><td>${esc(fmt(r.score_before))} → ${esc(fmt(r.score_after))}</td><td class="n ${tone(r.delta)}"><b>${esc(fmtDelta(r.delta))}</b></td><td class="n ${tone(r.relative_delta)}">${esc(fmtDelta(r.relative_delta))}</td><td><span class="chip">${esc(STATUS_LABELS[r.status])}</span>${r.thin ? '<span class="chip">Data tipis</span>' : ""}</td></tr>`,
  )
  .join("\n")}
</tbody></table>
<h2>Rincian bulanan</h2>
${report.participants
  .map(
    (
      r,
    ) => `<section class="month"><h3>Rincian bulanan ${esc(r.nama)} · ${esc(r.session_title)}</h3>
<table><thead><tr><th>Bulan</th><th>Posisi</th><th class="n">Sesi audit</th><th class="n">Temuan</th><th class="n">Temuan per sesi</th><th class="n">Skor QA</th><th class="n">Agent lain</th></tr></thead><tbody>
${
  r.months.length
    ? r.months
        .map(
          (m) =>
            `<tr class="${m.offset === 0 ? "muted" : ""}"><td>${esc(monthLabel(m))}</td><td>${esc(offsetText(m.offset))}</td><td class="n">${m.score === null ? "–" : m.sessions}</td><td class="n">${m.score === null ? "–" : m.findings}</td><td class="n">${m.score === null || !m.sessions ? "–" : esc(fmt(m.findings / m.sessions))}</td><td class="n"><b>${esc(fmt(m.score))}</b></td><td class="n">${esc(fmt(m.comparison_score))}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="7" class="muted">Belum ada bulan yang selesai.</td></tr>'
}
</tbody></table></section>`,
  )
  .join("\n")}
</body></html>`;
}

export function downloadEfekProgramHtml(
  report: EfekProgramReport,
  search: EfekReportSearch,
) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const name = report.program.name.replace(/[^A-Za-z0-9-]+/g, "-");
  const url = URL.createObjectURL(
    new Blob([buildEfekProgramHtml(report, search, now)], {
      type: "text/html;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `EFEK-${name}-${date}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
