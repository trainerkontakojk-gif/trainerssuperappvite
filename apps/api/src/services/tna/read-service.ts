import type { SupabaseClient } from "@supabase/supabase-js";
import {
  tnaNeedSchema,
  tnaProgramSchema,
  type TnaNeedDetail,
  type TnaNeedsQuery,
  tnaPlanSchema,
  tnaPlanParticipantSchema,
  type TnaPlanDetail,
  type TnaPlanStatus,
  tnaParticipantEvaluationSchema,
} from "@trainers/types";
import { computeTnaBaseline } from "./baseline";
import { buildTnaEvaluationNarrative, buildTnaNarrative } from "./narrative";
import { TnaServiceError } from "./errors";
import { fetchAllPages } from "../../lib/supabase-pagination";
import {
  computeTnaEvaluation,
  getTnaEvaluationPeriodOptions,
} from "./evaluation";

export async function listTnaPrograms(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tna_programs")
    .select("*")
    .eq("is_active", true)
    .order("code");
  if (error) throw error;
  return tnaProgramSchema.array().parse(data);
}

export async function listTnaNeeds(
  supabase: SupabaseClient,
  filters: TnaNeedsQuery,
) {
  const rows = await fetchAllPages({
    build: ({ from, to }) => {
      let query = supabase
        .from("tna_needs")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to);
      if (filters.service_type)
        query = query.eq("service_type", filters.service_type);
      if (filters.period_id) query = query.eq("period_id", filters.period_id);
      if (filters.outcome) query = query.eq("outcome", filters.outcome);
      return query;
    },
  });
  return { items: tnaNeedSchema.array().parse(rows) };
}

export async function findTnaNeed(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("tna_needs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? tnaNeedSchema.parse(data) : null;
}

export async function getTnaNeed(
  supabase: SupabaseClient,
  id: string,
): Promise<TnaNeedDetail | null> {
  const need = await findTnaNeed(supabase, id);
  if (!need) return null;
  const plans = await fetchAllPages({
    build: ({ from, to }) =>
      supabase
        .from("tna_plans")
        .select("*")
        .eq("need_id", id)
        .order("created_at")
        .order("id")
        .range(from, to),
  });
  return { need, plans: tnaPlanSchema.array().parse(plans) };
}

export async function listTnaPlans(
  supabase: SupabaseClient,
  status?: TnaPlanStatus,
  due = false,
) {
  // Match the RPC's Asia/Jakarta calendar day, not the server's local timezone.
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await fetchAllPages({
    build: ({ from, to }) => {
      let query = supabase
        .from("tna_plans")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to);
      if (status) query = query.eq("status", status);
      if (due)
        query = query.or(
          `and(status.eq.aktif,evaluation_due_date.lte.${today}),status.eq.evaluasi`,
        );
      return query;
    },
  });
  return {
    items: tnaPlanSchema
      .array()
      .parse(rows)
      .map((plan) => ({
        ...plan,
        evaluation_due:
          plan.status === "evaluasi" ||
          (plan.status === "aktif" && plan.evaluation_due_date <= today),
      })),
  };
}

export async function loadTnaPlan(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("tna_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new TnaServiceError(
      "TNA_PLAN_NOT_FOUND",
      404,
      "Rencana tidak ditemukan.",
    );
  const plan = tnaPlanSchema.parse(data);
  const rows = await fetchAllPages({
    build: ({ from, to }) =>
      supabase
        .from("tna_plan_participants")
        .select("*")
        .eq("plan_id", id)
        .order("id")
        .range(from, to),
  });
  return { plan, participants: tnaPlanParticipantSchema.array().parse(rows) };
}

export async function getTnaPlanDetail(
  supabase: SupabaseClient,
  id: string,
): Promise<TnaPlanDetail> {
  const { plan, participants } = await loadTnaPlan(supabase, id);
  const need = await findTnaNeed(supabase, plan.need_id);
  if (!need)
    throw new TnaServiceError(
      "TNA_NEED_NOT_FOUND",
      404,
      "Kebutuhan tidak ditemukan.",
    );
  const [
    { data: program, error: programError },
    { data: period, error: periodError },
  ] = await Promise.all([
    supabase
      .from("tna_programs")
      .select("*")
      .eq("id", plan.program_id)
      .single(),
    supabase
      .from("qa_periods")
      .select("id, month, year")
      .eq("id", need.period_id)
      .single(),
  ]);
  if (programError || periodError) throw programError ?? periodError;
  const computed =
    plan.status === "draft"
      ? await computeTnaBaseline(supabase, need, participants)
      : null;
  const snapshot = computed?.snapshot ?? plan.baseline_snapshot;
  if (!snapshot && plan.status !== "dibatalkan")
    throw new Error("TNA plan is missing baseline");
  const evaluation =
    plan.status === "evaluasi"
      ? await computeTnaEvaluation(supabase, need, plan, participants)
      : null;
  if (plan.status === "selesai" && !plan.evaluation_snapshot)
    throw new Error("Completed plan is missing evaluation snapshot");
  const evaluationSnapshot =
    evaluation?.snapshot ??
    (plan.status === "selesai" ? plan.evaluation_snapshot! : null);
  let evaluationNarrative: string | null = null;
  if (evaluationSnapshot) {
    if (!plan.baseline_snapshot)
      throw new Error("Evaluation narrative requires frozen baseline");
    // Metadata only: completed plans never read QA rows or recompute metrics.
    const { data: evaluationPeriod, error } = await supabase
      .from("qa_periods")
      .select("id, month, year")
      .eq("id", evaluationSnapshot.evaluation_period_id)
      .single();
    if (error) throw error;
    evaluationNarrative = buildTnaEvaluationNarrative({
      baseline: plan.baseline_snapshot,
      evaluation: evaluationSnapshot,
      plan,
      period: evaluationPeriod,
      participantCount: participants.length,
      preview: plan.status === "evaluasi",
    });
  }
  const frozenParticipants =
    plan.status === "selesai"
      ? tnaParticipantEvaluationSchema.array().parse(
          participants.map((p) => ({
            participant_id: p.id,
            peserta_id: p.peserta_id,
            baseline_findings: p.baseline_findings,
            baseline_sessions: p.baseline_sessions ?? null,
            baseline_sessions_source:
              p.baseline_sessions == null ? "unavailable" : "frozen",
            eval_findings: p.eval_findings,
            eval_sessions: p.eval_sessions,
            audited_in_eval: p.audited_in_eval,
          })),
        )
      : null;
  return {
    plan,
    participants,
    evaluation: evaluationSnapshot,
    evaluation_narrative: evaluationNarrative,
    participant_evaluation: evaluation?.participants ?? frozenParticipants,
    evaluation_period_options:
      plan.status === "aktif" || plan.status === "evaluasi"
        ? await getTnaEvaluationPeriodOptions(supabase, need, plan)
        : [],
    preview: computed?.snapshot ?? null,
    participant_preview: computed?.participantBaselines ?? null,
    narrative: snapshot
      ? buildTnaNarrative({
          snapshot,
          need,
          program: tnaProgramSchema.parse(program),
          plan,
          period,
          preview: plan.status === "draft",
        })
      : "Rencana dibatalkan sebelum aktivasi; baseline belum dibekukan.",
  };
}
