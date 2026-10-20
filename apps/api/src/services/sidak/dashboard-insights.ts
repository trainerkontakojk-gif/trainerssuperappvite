import {
  describeFindingsChange,
  formatInsightNumber,
  type DashboardData,
  type DashboardInsightAgent,
  type DashboardInsights,
  type QAIndicator,
  type QAPeriod,
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
const fmt = formatInsightNumber;
/** Kenaikan absolut minimal agar sebuah parameter menjadi fokus. */
const FOCUS_MIN_INCREASE = 5;

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
    ...describeFindingsChange(
      {
        label: latest.label,
        total: latest.total,
        audited: latest.totalAudited,
      },
      previous && {
        label: previous.label,
        total: previous.total,
        audited: previous.totalAudited,
      },
    ),
    findingsChangePct: changePct === null ? null : roundTo(changePct, 1),
    perAuditedLatest: perLatest === null ? null : roundTo(perLatest, 1),
    perAuditedPrevious: perPrevious === null ? null : roundTo(perPrevious, 1),
  };
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
    .filter((p) => p.change !== null && p.change >= FOCUS_MIN_INCREASE)
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
    headline: "Belum ada skor",
    text: `Belum ada skor audit untuk ${latest.label}.`,
    tone: "neutral",
    scoreGapToTarget: gap,
    belowTargetCount: below,
  };
  if (below !== null) {
    const score = `Skor rata-rata ${fmt(latest.avgAgentScore)}% di ${latest.label}`;
    if (gap !== null) {
      soWhat.headline = `Kurang ${fmt(gap)} poin dari target ${target}`;
      soWhat.text = `${score}; ${fmt(below)} agen belum mencapai ${target}.`;
      soWhat.tone = "bad";
    } else {
      soWhat.headline = `Target ${target} tercapai`;
      soWhat.text =
        below === 0
          ? `${score}; semua agen yang diaudit sudah mencapai ${target}.`
          : `${score}, tetapi ${fmt(below)} agen masih di bawah ${target}.`;
      soWhat.tone = below === 0 ? "good" : "neutral";
    }
  }
  if (focusParameter)
    soWhat.text += ` Kenaikan terbesar datang dari ${focusParameter.name} (+${fmt(focusParameter.change)} temuan${focusParameter.category === "critical" ? ", parameter kritikal" : ""}).`;
  const nowWhat: DashboardInsights["nowWhat"] = focusParameter?.agents.length
    ? {
        headline: `Coaching ${focusParameter.agents.length} agen untuk ${focusParameter.name}`,
        text: focusParameter.recommendation,
        action: "coach_focus_agents",
      }
    : input.hasFindings
      ? {
          headline: "Mulai dari agen dengan temuan terbanyak",
          text: previous
            ? `Tidak ada parameter yang naik ${FOCUS_MIN_INCREASE} temuan atau lebih dari ${previous.label}.`
            : "Belum ada periode pembanding untuk menentukan parameter fokus.",
          action: "open_ranking",
        }
      : {
          headline: "Belum ada yang perlu ditindaklanjuti",
          text: "Tidak ada temuan untuk filter ini.",
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
