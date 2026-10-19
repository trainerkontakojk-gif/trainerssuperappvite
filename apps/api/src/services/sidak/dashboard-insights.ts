import type {
  DashboardData,
  DashboardInsightAgent,
  DashboardInsights,
  QAIndicator,
  QAPeriod,
} from "@trainers/types";
import { isServiceType } from "../../lib/scoring";
import { roundTo } from "../../lib/math-utils";
import {
  deriveAgentRootCauses,
  FALLBACK_ROOT_CAUSE_RECOMMENDATION,
} from "./agent-root-causes";
import type { DashboardTemuanRow } from "./dashboard-types";
import { SIDAK_COMPLIANCE_TARGET } from "./shared-constants";

interface Input {
  periodMetrics: DashboardData["periodMetrics"];
  paramTrend: DashboardData["paramTrend"];
  paretoData: DashboardData["paretoData"];
  parameterAgents: ReadonlyMap<
    string,
    ReadonlyMap<string, DashboardInsightAgent>
  >;
  parameterRows: ReadonlyMap<string, DashboardTemuanRow[]>;
  indicators: QAIndicator[];
  periodById: Map<string, QAPeriod>;
  hasFindings: boolean;
}
const NUMBER = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const fmt = (n: number) => NUMBER.format(n);
const signed = (n: number) => `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;

/** Pure, deterministic summary. All inputs must already have the caller's SIDAK scope. */
export function buildDashboardInsights(input: Input): DashboardInsights | null {
  const latest = input.periodMetrics.at(-1);
  const previous = input.periodMetrics.at(-2);
  if (!latest) return null;
  const perLatest =
    latest.totalAudited > 0 ? latest.total / latest.totalAudited : null;
  const perPrevious =
    previous && previous.totalAudited > 0
      ? previous.total / previous.totalAudited
      : null;
  const changePct =
    previous && previous.total > 0
      ? ((latest.total - previous.total) / previous.total) * 100
      : null;
  const what: DashboardInsights["what"] = {
    text: "Belum ada periode pembanding untuk filter ini.",
    tone: "neutral",
    findingsChangePct: changePct === null ? null : roundTo(changePct, 1),
    perAuditedLatest: perLatest === null ? null : roundTo(perLatest, 1),
    perAuditedPrevious: perPrevious === null ? null : roundTo(perPrevious, 1),
  };
  if (previous) {
    if (changePct === null) {
      what.text = `${fmt(latest.total)} temuan di ${latest.label}; ${previous.label} tanpa temuan, jadi persentase tidak dihitung.`;
    } else if (Math.abs(changePct) < 5) {
      what.text = `Temuan ${latest.label} relatif tetap (${signed(changePct)}%) dibanding ${previous.label}.`;
    } else {
      const up = changePct > 0;
      const direction = up ? "naik" : "turun";
      const prefix = `Temuan ${latest.label} ${direction} ${fmt(Math.abs(changePct))}%`;
      if (perLatest === null || perPrevious === null) {
        what.text = `${prefix}, tetapi jumlah agen diaudit belum tersedia untuk membandingkan laju temuan.`;
      } else if (up ? perLatest > perPrevious : perLatest < perPrevious) {
        what.text = `${prefix} dan temuan per agen diaudit juga ${direction} (${fmt(perPrevious)} → ${fmt(perLatest)}).${up ? " Kenaikan ini nyata." : ""}`;
        what.tone = up ? "bad" : "good";
      } else {
        what.text = `${prefix}, tetapi temuan per agen diaudit tidak ${direction} (${fmt(perPrevious)} → ${fmt(perLatest)}). ${up ? "Kenaikan ikut jumlah audit, belum tentu memburuk." : "Penurunan ikut jumlah audit."}`;
      }
    }
  }
  const parameterChanges = input.paramTrend.datasets
    .filter((ds) => !ds.isTotal)
    .map((ds) => {
      const last = ds.data.at(-1) ?? 0;
      const prev = ds.data.at(-2);
      return {
        name: ds.label,
        latestCount: last,
        change: previous && prev !== undefined ? last - prev : null,
      };
    });
  const focus = parameterChanges
    .filter((p) => p.change !== null && p.change >= 5)
    .sort(
      (a, b) => b.change! - a.change! || a.name.localeCompare(b.name, "id"),
    )[0];
  let focusParameter: DashboardInsights["focusParameter"] = null;
  if (focus) {
    const temuan = (input.parameterRows.get(focus.name) ?? []).flatMap(
      (row, index) => {
        if (!isServiceType(row.service_type)) return [];
        return [
          {
            id: row.id ?? `finding-${index}`,
            period_id: row.period_id,
            indicator_id: row.indicator_id,
            service_type: row.service_type,
            no_tiket: row.no_tiket ?? null,
            nilai: row.nilai ?? 3,
            tahun: row.tahun ?? undefined,
            ketidaksesuaian: row.ketidaksesuaian ?? null,
            sebaiknya: row.sebaiknya ?? null,
            is_phantom_padding: row.is_phantom_padding ?? false,
          },
        ];
      },
    );
    const causes = deriveAgentRootCauses({
      temuan,
      indicators: input.indicators,
      periodById: input.periodById,
      maxResults: 1,
    });
    focusParameter = {
      name: focus.name,
      category:
        input.paretoData.find((p) => p.name === focus.name)?.category ?? "none",
      latestCount: focus.latestCount,
      change: focus.change!,
      recommendation:
        causes[0]?.recommendation ?? FALLBACK_ROOT_CAUSE_RECOMMENDATION,
      agents: [...(input.parameterAgents.get(focus.name)?.values() ?? [])]
        .sort(
          (a, b) =>
            b.count - a.count ||
            a.nama.localeCompare(b.nama, "id") ||
            a.agentId.localeCompare(b.agentId),
        )
        .slice(0, 10),
    };
  }
  const target = SIDAK_COMPLIANCE_TARGET;
  const below =
    latest.totalAudited > 0
      ? Math.max(0, latest.totalAudited - latest.compliance)
      : null;
  const gap =
    latest.totalAudited > 0 && latest.avgAgentScore < target
      ? roundTo(target - latest.avgAgentScore, 1)
      : null;
  const soWhat: DashboardInsights["soWhat"] = {
    text: "Belum ada skor audit untuk periode ini.",
    tone: "neutral",
    scoreGapToTarget: gap,
    belowTargetCount: below,
  };
  if (below !== null) {
    const prefix = `Rata-rata skor ${latest.label} ${fmt(latest.avgAgentScore)}%, `;
    soWhat.text =
      prefix +
      (gap !== null
        ? `${fmt(gap)} poin di bawah target ${target}`
        : `sudah mencapai target ${target}`) +
      `; ${fmt(below)} agen belum mencapai ${target}.`;
    soWhat.tone = gap !== null ? "bad" : below === 0 ? "good" : "neutral";
  }
  if (focusParameter)
    soWhat.text += ` ${focusParameter.name} menyumbang kenaikan terbesar (+${fmt(focusParameter.change)}).${focusParameter.category === "critical" ? " Termasuk kritikal." : ""}`;
  const nowWhat: DashboardInsights["nowWhat"] = focusParameter?.agents.length
    ? {
        text: `Coaching ${focusParameter.agents.length} agen dengan temuan ${focusParameter.name} terbanyak.`,
        action: "coach_focus_agents",
      }
    : input.hasFindings
      ? {
          text: "Tidak ada parameter yang naik berarti. Mulai dari agen dengan temuan terbanyak.",
          action: "open_ranking",
        }
      : {
          text: "Belum ada tindakan yang disarankan untuk filter ini.",
          action: "none",
        };
  return {
    latestLabel: previous ? latest.label : null,
    previousLabel: previous?.label ?? null,
    what,
    soWhat,
    focusParameter,
    nowWhat,
    parameterChanges,
  };
}
