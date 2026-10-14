import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTnaNeedSchema,
  tnaNeedSchema,
  type CreateTnaNeed,
  type CreateTnaPlan,
  type UpdateTnaDraftPlan,
  createTnaPlanSchema,
  updateTnaDraftPlanSchema,
  tnaPlanSchema,
  tnaEvaluationPeriodInputSchema,
  completeTnaPlanSchema,
  cancelTnaPlanSchema,
  type TnaEvaluationPeriodInput,
  type CompleteTnaPlan,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";
import { logActivity } from "../activity-log-service";
import { computeTnaBaseline, validateTnaParticipants } from "./baseline";
import { tnaBusinessError, throwTnaRpcError, TnaServiceError } from "./errors";
import { findTnaNeed, loadTnaPlan } from "./read-service";
import { getTnaParameterDetail } from "./detail";
import { computeTnaEvaluation } from "./evaluation";

export class TnaNoFindingsError extends Error {}

/** K6: the sole TNA service-role mutation boundary. Reads use the caller JWT. */
export async function createTnaNeed(args: {
  supabase: SupabaseClient;
  actorId: string;
  actorName: string;
  input: CreateTnaNeed;
}) {
  // Reject client-supplied metrics/identity even for callers outside the route.
  const input = createTnaNeedSchema.parse(args.input);
  const detail = await getTnaParameterDetail({
    supabase: args.supabase,
    serviceType: input.service_type,
    periodId: input.period_id,
    indicatorId: input.indicator_id,
    compareCount: input.compare_count,
    dataScope: { kind: "all" },
  });
  if (detail.metrics.findings === 0) throw new TnaNoFindingsError();
  const { data, error } = await supabaseAdmin.rpc("tna_create_need", {
    p_actor_id: args.actorId,
    p_payload: {
      ...input,
      validation_snapshot: detail.metrics,
      suggested_cluster_id: detail.clusters[0]?.clusterId ?? null,
    },
  });
  if (error) throwTnaRpcError(error);
  const need = tnaNeedSchema.parse(data);
  await logActivity({
    user_id: args.actorId,
    user_name: args.actorName,
    action: `Memvalidasi kebutuhan TNA: ${need.id}`,
    module: "tna",
    type: "add",
  });
  return need;
}

interface TnaWriteContext {
  supabase: SupabaseClient;
  actorId: string;
  actorName: string;
}

async function logPlanAction(
  args: TnaWriteContext,
  planId: string,
  verb: string,
  type: "add" | "update",
) {
  await logActivity({
    user_id: args.actorId,
    user_name: args.actorName,
    action: `${verb} rencana TNA: ${planId}`,
    module: "tna",
    type,
  });
}

export async function createTnaPlan(
  args: TnaWriteContext & { input: CreateTnaPlan },
) {
  const { participant_peserta_ids, ...plan } = createTnaPlanSchema.parse(
    args.input,
  );
  if (!(await findTnaNeed(args.supabase, plan.need_id)))
    throw new TnaServiceError(
      "TNA_NEED_NOT_FOUND",
      404,
      "Kebutuhan tidak ditemukan.",
    );
  await validateTnaParticipants(args.supabase, participant_peserta_ids);
  const { data, error } = await supabaseAdmin.rpc("tna_create_plan", {
    p_actor_id: args.actorId,
    p_plan: plan,
    p_participants: participant_peserta_ids.map((peserta_id) => ({
      peserta_id,
    })),
  });
  if (error) throwTnaRpcError(error);
  const created = tnaPlanSchema.parse(data);
  await logPlanAction(args, created.id, "Membuat", "add");
  return created;
}

export async function updateTnaDraftPlan(
  args: TnaWriteContext & { planId: string; input: UpdateTnaDraftPlan },
) {
  const { expected_updated_at, participant_peserta_ids, ...plan } =
    updateTnaDraftPlanSchema.parse(args.input);
  // RPC owns date checks against the existing row, locking, revision comparison,
  // and atomic roster replacement. A failure rolls back both plan and roster.
  const { plan: current } = await loadTnaPlan(args.supabase, args.planId);
  if (current.status !== "draft") throw tnaBusinessError("TNA_PLAN_NOT_DRAFT");
  if (participant_peserta_ids)
    await validateTnaParticipants(args.supabase, participant_peserta_ids);
  const { data, error } = await supabaseAdmin.rpc("tna_update_draft_plan", {
    p_actor_id: args.actorId,
    p_plan_id: args.planId,
    p_expected_updated_at: expected_updated_at,
    p_plan: plan,
    p_participants:
      participant_peserta_ids?.map((peserta_id) => ({ peserta_id })) ?? null,
  });
  if (error) throwTnaRpcError(error);
  const updated = tnaPlanSchema.parse(data);
  await logPlanAction(args, updated.id, "Mengubah draft", "update");
  return updated;
}

export async function activateTnaPlan(
  args: TnaWriteContext & { planId: string; expectedUpdatedAt: string },
) {
  const { plan, participants } = await loadTnaPlan(args.supabase, args.planId);
  if (plan.status !== "draft")
    throw tnaBusinessError("TNA_PLAN_TRANSITION_CONFLICT");
  const need = await findTnaNeed(args.supabase, plan.need_id);
  if (!need)
    throw new TnaServiceError(
      "TNA_NEED_NOT_FOUND",
      404,
      "Kebutuhan tidak ditemukan.",
    );
  await validateTnaParticipants(
    args.supabase,
    participants.map((row) => row.peserta_id),
  );
  const { snapshot, participantBaselines } = await computeTnaBaseline(
    args.supabase,
    need,
    participants,
  );
  // RPC rechecks expected_updated_at while holding the plan row lock: any draft
  // edit or competing transition during computation becomes a conflict.
  const { data, error } = await supabaseAdmin.rpc("tna_activate_plan", {
    p_actor_id: args.actorId,
    p_plan_id: args.planId,
    p_expected_updated_at: args.expectedUpdatedAt,
    p_baseline: snapshot,
    p_participant_baselines: participantBaselines,
  });
  if (error) throwTnaRpcError(error);
  const activated = tnaPlanSchema.parse(data);
  await logPlanAction(args, activated.id, "Mengaktifkan", "update");
  return activated;
}

export async function cancelTnaPlan(
  args: TnaWriteContext & {
    planId: string;
    expectedUpdatedAt: string;
    cancelReason?: string;
  },
) {
  const input = cancelTnaPlanSchema.parse({
    expected_updated_at: args.expectedUpdatedAt,
    cancel_reason: args.cancelReason,
  });
  await loadTnaPlan(args.supabase, args.planId);
  const { data, error } = await supabaseAdmin.rpc("tna_cancel_plan", {
    p_actor_id: args.actorId,
    p_plan_id: args.planId,
    p_expected_updated_at: input.expected_updated_at,
    p_cancel_reason: input.cancel_reason ?? null,
  });
  if (error) throwTnaRpcError(error);
  const cancelled = tnaPlanSchema.parse(data);
  await logPlanAction(args, cancelled.id, "Membatalkan", "update");
  return cancelled;
}

export async function startTnaPlanEvaluation(
  args: TnaWriteContext & { planId: string; input: TnaEvaluationPeriodInput },
) {
  const input = tnaEvaluationPeriodInputSchema.parse(args.input);
  await loadTnaPlan(args.supabase, args.planId);
  const { data, error } = await supabaseAdmin.rpc("tna_start_plan_evaluation", {
    p_actor_id: args.actorId,
    p_plan_id: args.planId,
    p_expected_updated_at: input.expected_updated_at,
    p_evaluation_period_id: input.evaluation_period_id,
  });
  if (error) throwTnaRpcError(error);
  const plan = tnaPlanSchema.parse(data);
  await logPlanAction(args, plan.id, "Memulai evaluasi", "update");
  return plan;
}

export async function updateTnaEvaluationPeriod(
  args: TnaWriteContext & { planId: string; input: TnaEvaluationPeriodInput },
) {
  const input = tnaEvaluationPeriodInputSchema.parse(args.input);
  await loadTnaPlan(args.supabase, args.planId);
  const { data, error } = await supabaseAdmin.rpc(
    "tna_update_evaluation_period",
    {
      p_actor_id: args.actorId,
      p_plan_id: args.planId,
      p_expected_updated_at: input.expected_updated_at,
      p_evaluation_period_id: input.evaluation_period_id,
    },
  );
  if (error) throwTnaRpcError(error);
  const plan = tnaPlanSchema.parse(data);
  await logPlanAction(args, plan.id, "Mengubah periode evaluasi", "update");
  return plan;
}

export async function completeTnaPlan(
  args: TnaWriteContext & { planId: string; input: CompleteTnaPlan },
) {
  const input = completeTnaPlanSchema.parse(args.input);
  const { plan, participants } = await loadTnaPlan(args.supabase, args.planId);
  if (plan.status !== "evaluasi")
    throw tnaBusinessError("TNA_PLAN_NOT_EVALUATING");
  const need = await findTnaNeed(args.supabase, plan.need_id);
  if (!need)
    throw new TnaServiceError(
      "TNA_NEED_NOT_FOUND",
      404,
      "Kebutuhan tidak ditemukan.",
    );
  const evaluation = await computeTnaEvaluation(
    args.supabase,
    need,
    plan,
    participants,
  );
  if (evaluation.snapshot.population.auditStatus === "no_audit")
    throw tnaBusinessError("TNA_EVALUATION_NO_AUDIT");
  // Snapshot and participant values are server-owned. The RPC locks/rechecks
  // the revision and verdict, then persists all fields in one transaction.
  const { data, error } = await supabaseAdmin.rpc("tna_complete_plan", {
    p_actor_id: args.actorId,
    p_plan_id: args.planId,
    p_expected_updated_at: input.expected_updated_at,
    p_evaluation_snapshot: evaluation.snapshot,
    p_participant_evaluations: evaluation.participants.map(
      ({ participant_id, audited_in_eval, eval_findings, eval_sessions }) => ({
        participant_id,
        audited_in_eval,
        eval_findings,
        eval_sessions,
      }),
    ),
    p_verdict: evaluation.snapshot.verdict,
    p_conclusion_note: input.conclusion_note,
    p_follow_up: input.follow_up,
  });
  if (error) throwTnaRpcError(error);
  const completed = tnaPlanSchema.parse(data);
  await logPlanAction(args, completed.id, "Menyelesaikan", "update");
  return completed;
}
