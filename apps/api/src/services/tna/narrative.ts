import type {
  QAPeriod,
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
    let trend: string;
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
      case "no_current_audit":
        throw new Error("Audited snapshot cannot have no_current_audit trend");
    }
    if (s.ratePer100 === null || s.spreadPct === null)
      throw new Error("Audited snapshot requires rates");
    opening = `Tingkat ketidaksesuaian parameter ${s.parameterName} (${SERVICE_LABELS[s.serviceType]}) ${trend} dan mencapai ${number(s.ratePer100)} per 100 sesi sampel pada ${periodLabel}, terjadi pada ${number(s.spreadPct)}% agent yang diaudit (${s.affectedAgents} dari ${s.auditedAgents}).`;
  }
  const conclusion = `Penyebab dominan (divalidasi trainer): ${need.validated_cluster_id.replaceAll("_", " ")} — ${need.cause_note}. Direkomendasikan ${program.name} dalam format ${interventions[plan.intervention_type]}, dengan target tingkat ≤ ${number(plan.target_max_rate_per_100)} per 100 sesi dan sebaran ≤ ${number(plan.target_max_spread_pct)}% pada evaluasi ${new Date(`${plan.evaluation_due_date}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`;
  return `${args.preview ? "Pratinjau: " : ""}${opening} ${conclusion}${s.insufficientData ? " Catatan: data periode ini belum cukup untuk kesimpulan kuat." : ""}`;
}
