import type { TnaPeriodMetrics, TnaPlanDetail } from "@trainers/types";
import { SERVICE_LABELS } from "../../lib/scoring";
import { downloadHtml, esc, fileDate, fileSlug } from "./html-export";
import {
  calendarDate,
  followUpLabels,
  interventionLabels,
  number,
  planStatusLabels,
  practiceModuleLabels,
  practiceTargetsText,
  sessionDates,
  verdictLabels,
} from "./utils";

/**
 * TNA phase 6 K40: one printable HTML summary per plan (Ringkasan TNA, plan
 * and targets, frozen baseline, participants, and the evaluation once it has
 * started), built from the plan detail the page already loaded.
 */

const WIB_DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const WIB_TIME = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

const STYLE = `
*{box-sizing:border-box}body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0a0a0a;background:#fff;margin:0 auto;max-width:880px;padding:32px 24px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px}h3{font-size:14px;margin:18px 0 6px}
.meta{color:#555;margin:0}p{margin:6px 0}.narrative{white-space:pre-wrap;max-width:70ch}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:8px 0}dt{color:#555}dd{margin:0}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:12.5px;vertical-align:top}
th{background:#f5f5f5;color:#555;font-size:11.5px}td.n,th.n{text-align:right}.muted{color:#707070}
.note{margin-top:28px;padding-top:12px;border-top:1px solid #e5e5e5;color:#555;font-size:12.5px}
@media print{body{padding:0;max-width:none}h2{break-after:avoid}tr,dl{break-inside:avoid}}
`;

const metricRows = (m: TnaPeriodMetrics) =>
  m.auditStatus === "no_audit"
    ? `<p class="muted">Belum ada audit pada periode ini. Tingkat dan sebaran belum tersedia.</p>`
    : `<dl>
<dt>Tingkat ketidaksesuaian</dt><dd>${esc(number(m.ratePer100))} per 100 sesi sampel</dd>
<dt>Sebaran agent</dt><dd>${esc(number(m.spreadPct))}% (${m.affectedAgents} dari ${m.auditedAgents} diaudit)</dd>
<dt>Temuan / sesi sampel</dt><dd>${m.findings} / ${m.sampledSessions}</dd>
</dl>`;

function evaluationSection(d: TnaPlanDetail) {
  const e = d.evaluation;
  if (!e) return "";
  const completed = d.plan.status === "selesai";
  const names = new Map(
    d.participants.map((a) => [a.id, a.peserta_name_snapshot]),
  );
  const cohorts = e.cohorts.comparison_small
    ? "Kelompok pembanding terlalu kecil untuk dibandingkan."
    : e.cohorts.net_effect === null
      ? ""
      : `Efek bersih: ${number(e.cohorts.net_effect)} per 100 sesi sampel`;
  return `<h2>Ringkasan evaluasi</h2>
${d.evaluation_narrative ? `<p class="narrative">${esc(d.evaluation_narrative)}</p>` : ""}
<h3>Populasi periode evaluasi</h3>
${metricRows(e.population)}
${completed && d.plan.verdict ? `<p><b>Verdict: ${esc(verdictLabels[d.plan.verdict])}</b></p>` : ""}
${completed && d.plan.conclusion_note ? `<p>Kesimpulan: ${esc(d.plan.conclusion_note)}</p>` : ""}
${completed && d.plan.follow_up ? `<p>Tindak lanjut: ${esc(followUpLabels[d.plan.follow_up])}</p>` : ""}
${cohorts ? `<p>${esc(cohorts)}</p>` : ""}
${
  d.participant_evaluation?.length
    ? `<h3>Evaluasi per peserta</h3>
<table><thead><tr><th>Peserta</th><th class="n">Baseline (temuan / sesi)</th><th class="n">Evaluasi (temuan / sesi)</th></tr></thead><tbody>
${d.participant_evaluation
  .map(
    (a) =>
      `<tr><td>${esc(names.get(a.participant_id) ?? "Profil tidak tersedia")}</td><td class="n">${esc(number(a.baseline_findings))} / ${esc(number(a.baseline_sessions))}</td><td class="n">${a.audited_in_eval ? `${esc(number(a.eval_findings))} / ${esc(number(a.eval_sessions))}` : "Tidak diaudit"}</td></tr>`,
  )
  .join("\n")}
</tbody></table>`
    : ""
}`;
}

function practiceSection(d: TnaPlanDetail) {
  if (!d.practice_targets?.length || !d.practice) return "";
  if (d.practice.state === "unavailable")
    return `<h2>Progres latihan simulasi</h2><p class="muted">Progres latihan belum dapat dimuat saat ekspor.</p>`;
  return `<h2>Progres latihan simulasi</h2>
<p class="muted">${d.practice.state === "frozen" ? "Dibekukan saat rencana selesai." : "Dihitung saat ekspor; masih bisa berubah."}</p>
<ul>${d.practice.summary
    .map(
      (s) =>
        `<li>${esc(practiceModuleLabels[s.module])}: ${s.met} dari ${s.total} peserta memenuhi minimal ${s.min_sessions} sesi</li>`,
    )
    .join("")}</ul>`;
}

export function buildTnaPlanHtml(d: TnaPlanDetail, now = new Date()) {
  const p = d.plan;
  const baseline = p.baseline_snapshot;
  const program = `${d.program.name}${d.program.source === "snapshot" ? " (dibekukan saat aktivasi)" : ""}`;
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TNA ${esc(p.title)} · Ringkasan</title><style>${STYLE}</style></head><body>
<h1>Ringkasan TNA · ${esc(p.title)}</h1>
<p class="meta">Diekspor ${esc(WIB_DATE.format(now))} ${esc(WIB_TIME.format(now))} WIB</p>
<p class="meta">Status: ${esc(planStatusLabels[p.status])}</p>
<p class="meta">Program: ${esc(program)}</p>
${baseline ? `<p class="meta">Parameter: ${esc(baseline.parameterName)} · layanan ${esc(SERVICE_LABELS[baseline.serviceType])}</p>` : ""}
<h2>Rencana dan target</h2>
<dl>
<dt>Intervensi</dt><dd>${esc(interventionLabels[p.intervention_type])}</dd>
<dt>Jadwal</dt><dd>${esc(sessionDates(p))}</dd>
<dt>Jatuh tempo evaluasi</dt><dd>${esc(calendarDate(p.evaluation_due_date))}</dd>
<dt>Target tingkat maksimal</dt><dd>${esc(number(p.target_max_rate_per_100))} per 100 sesi sampel</dd>
<dt>Target sebaran maksimal</dt><dd>${esc(number(p.target_max_spread_pct))}%</dd>
<dt>Target latihan simulasi</dt><dd>${esc(practiceTargetsText(d.practice_targets ?? []))}</dd>
</dl>
${baseline ? `<h2>Baseline beku</h2>${metricRows(baseline)}` : ""}
<h2>Ringkasan TNA</h2>
<p class="narrative">${esc(d.narrative)}</p>
<h2>Peserta saat aktivasi</h2>
<table><thead><tr><th>Peserta</th><th>Tim</th><th class="n">Temuan baseline</th></tr></thead><tbody>
${d.participants
  .map(
    (a) =>
      `<tr><td>${esc(a.peserta_name_snapshot)}${a.peserta_id ? "" : ' <span class="muted">(profil sudah tidak tersedia)</span>'}</td><td>${esc(a.team_snapshot ?? "Tanpa tim")}</td><td class="n">${a.baseline_findings == null ? "Belum tersedia" : a.baseline_findings}</td></tr>`,
  )
  .join("\n")}
</tbody></table>
${practiceSection(d)}
${evaluationSection(d)}
<p class="note">Perbandingan dan ringkasan ini indikatif, bukan bukti sebab-akibat.</p>
</body></html>`;
}

/** Plans that have a frozen baseline: aktif, evaluasi, selesai (K40). */
export const canExportTnaPlan = (d: TnaPlanDetail) =>
  ["aktif", "evaluasi", "selesai"].includes(d.plan.status);

export function downloadTnaPlanHtml(d: TnaPlanDetail) {
  const now = new Date();
  downloadHtml(
    buildTnaPlanHtml(d, now),
    `TNA-${fileSlug(d.plan.title) || "rencana"}-${fileDate(now)}.html`,
  );
}
