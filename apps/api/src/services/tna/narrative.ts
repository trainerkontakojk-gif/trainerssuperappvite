import type {
  QAPeriod,
  TnaBaselineSnapshot,
  TnaEvaluationSnapshot,
  TnaVerdict,
  TnaMetricsSnapshot,
  TnaNeed,
  TnaPlan,
  TnaProgram,
} from "@trainers/types";
import { STABLE_TREND_PCT } from "./thresholds";
import { SERVICE_LABELS } from "../../lib/scoring";

const number = (value: number) =>
  value.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const verdictLabels: Record<TnaVerdict, string> = {
  tercapai: "tercapai",
  tercapai_sebagian: "tercapai sebagian",
  tidak_tercapai: "tidak tercapai",
};
const interventions = {
  kelas: "kelas",
  kelompok_kecil: "kelompok kecil",
  coaching_individu: "coaching individu",
};

/** D9: deterministic prose. Null audit metrics never become zero rates. */
export function buildTnaNarrative(args: {
  snapshot: TnaMetricsSnapshot;
  need: TnaNeed;
  program: TnaProgram;
  plan: TnaPlan;
  period: QAPeriod;
  preview: boolean;
}): string {
  const { snapshot: s, need, program, plan, period } = args;
  const periodLabel = new Date(
    Date.UTC(period.year, period.month - 1, 1),
  ).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  let opening: string;
  if (s.auditStatus === "no_audit") {
    opening = `Belum ada audit untuk parameter ${s.parameterName} (${SERVICE_LABELS[s.serviceType]}) pada ${periodLabel}, sehingga tingkat dan sebaran belum dapat dihitung.`;
  } else {
    // null: no trend clause (running period); the rate is stated as interim.
    let trend: string | null;
    switch (s.trendStatus) {
      case "computed": {
        if (s.trendPct === null || s.comparisonRatePer100 === null)
          throw new Error("Computed trend requires comparison rate and change");
        const change = s.trendPct;
        trend =
          Math.abs(change) < STABLE_TREND_PCT
            ? `stabil dari rata-rata periode pembanding ${number(s.comparisonRatePer100)}`
            : `${change > 0 ? "naik" : "turun"} ${number(Math.abs(change))}% dari rata-rata periode pembanding ${number(s.comparisonRatePer100)}`;
        break;
      }
      case "new_from_zero":
        trend = "baru muncul karena periode pembanding tidak punya temuan";
        break;
      case "no_findings_both":
        trend =
          "tidak memiliki temuan, baik pada periode ini maupun periode pembanding";
        break;
      case "no_comparison_data":
        trend = "belum memiliki periode pembanding";
        break;
      case "period_in_progress":
        trend = null;
        break;
      case "no_current_audit":
        throw new Error("Audited snapshot cannot have no_current_audit trend");
    }
    if (s.ratePer100 === null || s.spreadPct === null)
      throw new Error("Audited snapshot requires rates");
    opening = `Tingkat ketidaksesuaian parameter ${s.parameterName} (${SERVICE_LABELS[s.serviceType]}) ${trend === null ? "sementara" : `${trend} dan`} mencapai ${number(s.ratePer100)} per 100 sesi sampel pada ${periodLabel}, terjadi pada ${number(s.spreadPct)}% agent yang diaudit (${s.affectedAgents} dari ${s.auditedAgents}).${trend === null ? " Periode ini masih berjalan, sehingga tren belum dihitung." : ""}`;
  }
  const conclusion = `Penyebab dominan (divalidasi trainer): ${need.validated_cluster_id.replaceAll("_", " ")} — ${need.cause_note}. Direkomendasikan ${program.name} dalam format ${interventions[plan.intervention_type]}, dengan target tingkat ≤ ${number(plan.target_max_rate_per_100)} per 100 sesi dan sebaran ≤ ${number(plan.target_max_spread_pct)}% pada evaluasi ${new Date(`${plan.evaluation_due_date}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`;
  return `${args.preview ? "Pratinjau: " : ""}${opening} ${conclusion}${s.insufficientData ? " Catatan: data periode ini belum cukup untuk kesimpulan kuat." : ""}`;
}

/** D13: frozen population baseline; cohort deltas come from the evaluation snapshot. */
export function buildTnaEvaluationNarrative(args: {
  baseline: TnaBaselineSnapshot;
  evaluation: TnaEvaluationSnapshot;
  plan: TnaPlan;
  period: QAPeriod;
  participantCount: number;
  preview: boolean;
}): string {
  const { baseline, evaluation, plan, period, participantCount } = args;
  const population = evaluation.population;
  const periodLabel = new Date(
    Date.UTC(period.year, period.month - 1, 1),
  ).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  let opening: string;
  if (population.auditStatus === "no_audit") {
    opening = `Evaluasi ${periodLabel}: belum ada audit untuk parameter ${baseline.parameterName} (${SERVICE_LABELS[baseline.serviceType]}), sehingga tingkat dan sebaran belum dapat dihitung.`;
  } else {
    if (
      baseline.ratePer100 === null ||
      baseline.spreadPct === null ||
      population.ratePer100 === null ||
      population.spreadPct === null ||
      evaluation.verdict === null
    )
      throw new Error(
        "Audited evaluation requires frozen baseline, rates and verdict",
      );
    const baselineRate = number(baseline.ratePer100);
    const evaluationRate = number(population.ratePer100);
    const change =
      baselineRate === evaluationRate
        ? `tetap di ${evaluationRate}`
        : `${population.ratePer100 < baseline.ratePer100 ? "turun" : "naik"} dari ${baselineRate} menjadi ${evaluationRate}`;
    opening = `Evaluasi ${periodLabel}: tingkat ketidaksesuaian parameter ${baseline.parameterName} (${SERVICE_LABELS[baseline.serviceType]}) ${change} per 100 sesi sampel (target ≤ ${number(plan.target_max_rate_per_100)}), dengan sebaran ${number(baseline.spreadPct)}% → ${number(population.spreadPct)}% (target ≤ ${number(plan.target_max_spread_pct)}%). Target ${verdictLabels[evaluation.verdict]}.`;
  }
  const { participants, comparison, comparison_small } = evaluation.cohorts;
  let cohorts: string;
  if (comparison_small) {
    cohorts = "Kelompok pembanding terlalu kecil untuk dibandingkan.";
  } else {
    if (comparison.delta === null)
      throw new Error("Sufficient comparison requires a cohort delta");
    const describeChange = (delta: number, unit = "") => {
      const magnitude = number(Math.abs(delta));
      return magnitude === number(0)
        ? "tetap"
        : `${delta < 0 ? "turun" : "naik"} ${magnitude}${unit}`;
    };
    const participantChange =
      participants.delta === null
        ? "belum memiliki data yang cukup untuk dibandingkan"
        : describeChange(participants.delta, " per 100 sesi");
    cohorts = `Peserta yang diaudit (${participants.evaluation.agents} dari ${participantCount}) ${participantChange}, sedangkan kelompok pembanding (${comparison.evaluation.agents} agent) ${describeChange(comparison.delta)}.`;
  }
  const caution = population.insufficientData
    ? " Catatan: data periode evaluasi belum cukup untuk kesimpulan kuat."
    : "";
  return `${args.preview ? "Pratinjau: " : ""}${opening} ${cohorts}${caution} Perbandingan ini indikatif, bukan bukti sebab-akibat.`;
}
