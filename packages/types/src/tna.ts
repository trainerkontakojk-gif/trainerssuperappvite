import { z } from "zod";
import {
  categorySchema,
  serviceTypeSchema,
  tanggalSchema,
  type RootCauseResult,
} from "./sidak";

export const tnaGapTypeSchema = z.enum([
  "knowledge",
  "skill",
  "proses",
  "perilaku",
]);
export const tnaOutcomeSchema = z.enum(["training", "eskalasi_non_training"]);
export const tnaInterventionTypeSchema = z.enum([
  "kelas",
  "kelompok_kecil",
  "coaching_individu",
]);
export const tnaPlanStatusSchema = z.enum([
  "draft",
  "aktif",
  "evaluasi",
  "selesai",
  "dibatalkan",
]);
export const tnaClusterIdSchema = z.enum([
  "salah_nama_perusahaan_produk",
  "kelebihan_standar_jawaban",
  "salah_penggunaan_sistem",
  "salah_jawaban",
  "kurang_teliti_verifikasi_data",
  "kurang_paham_standar_jawaban",
  "kurang_menggali",
  "lainnya",
]);
export const tnaAuditStatusSchema = z.enum(["audited", "no_audit"]);
export const tnaTrendStatusSchema = z.enum([
  "no_current_audit",
  "computed",
  "new_from_zero",
  "no_findings_both",
  "no_comparison_data",
]);
export type TnaGapType = z.infer<typeof tnaGapTypeSchema>;
export type TnaOutcome = z.infer<typeof tnaOutcomeSchema>;
export type TnaInterventionType = z.infer<typeof tnaInterventionTypeSchema>;
export type TnaPlanStatus = z.infer<typeof tnaPlanStatusSchema>;
export type TnaAuditStatus = z.infer<typeof tnaAuditStatusSchema>;
export type TnaTrendStatus = z.infer<typeof tnaTrendStatusSchema>;

export const tnaProgramSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  gap_type: tnaGapTypeSchema,
  trigger_clusters: z.array(tnaClusterIdSchema),
  service_types: z.array(serviceTypeSchema),
  suggested_modules: z.array(z.enum(["ketik", "pdkt", "telefun"])),
  is_active: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});
export type TnaProgram = z.infer<typeof tnaProgramSchema>;

const count = z.number().int().nonnegative();
const finiteRate = z.number().finite().nonnegative();
export const tnaPeriodMetricsSchema = z.object({
  periodId: z.string().uuid(),
  auditedAgents: count,
  sampledSessions: count,
  findings: count,
  affectedAgents: count,
  ratePer100: finiteRate.nullable(),
  spreadPct: z.number().finite().min(0).max(100).nullable(),
  auditStatus: tnaAuditStatusSchema,
  insufficientData: z.boolean(),
});
export type TnaPeriodMetrics = z.infer<typeof tnaPeriodMetricsSchema>;
export const tnaMetricsSnapshotSchema = tnaPeriodMetricsSchema.extend({
  metric_version: z.literal(1),
  computed_at: z.string().datetime({ offset: true }),
  serviceType: serviceTypeSchema,
  indicatorId: z.string().uuid(),
  parameterName: z.string(),
  category: categorySchema,
  comparePeriods: z.array(tnaPeriodMetricsSchema),
  comparisonRatePer100: finiteRate.nullable(),
  trendStatus: tnaTrendStatusSchema,
  trendPct: z.number().finite().nullable(),
  isCandidate: z.boolean(),
  signals: z.array(z.enum(["tersebar", "naik", "kritikal"])),
  suggestedIntervention: tnaInterventionTypeSchema,
});
export type TnaMetricsSnapshot = z.infer<typeof tnaMetricsSnapshotSchema>;
export const tnaBaselineSnapshotSchema = tnaMetricsSnapshotSchema.extend({
  validation_drift: z.object({
    findings: z.number().int(),
    auditedAgents: z.number().int(),
  }),
});
export type TnaBaselineSnapshot = z.infer<typeof tnaBaselineSnapshotSchema>;

export const tnaFollowUpSchema = z.enum([
  "selesai_tuntas",
  "perlu_rencana_lanjutan",
  "eskalasi_non_training",
]);
export type TnaFollowUp = z.infer<typeof tnaFollowUpSchema>;

export const tnaVerdictSchema = z.enum([
  "tercapai",
  "tercapai_sebagian",
  "tidak_tercapai",
]);
export type TnaVerdict = z.infer<typeof tnaVerdictSchema>;
export const tnaCohortMetricsSchema = z
  .object({
    agents: count,
    findings: count,
    sampledSessions: count,
    ratePer100: finiteRate.nullable(),
    spreadPct: z.number().finite().min(0).max(100).nullable(),
  })
  .strict();
export type TnaCohortMetrics = z.infer<typeof tnaCohortMetricsSchema>;
const cohortComparisonSchema = z
  .object({
    baseline: tnaCohortMetricsSchema,
    evaluation: tnaCohortMetricsSchema,
    delta: z.number().finite().nullable(),
  })
  .strict();
export const tnaEvaluationSnapshotSchema = z
  .object({
    metric_version: z.literal(1),
    computed_at: z.string().datetime({ offset: true }),
    evaluation_period_id: z.string().uuid(),
    population: tnaPeriodMetricsSchema.strict(),
    baseline_recompute_drift: z
      .object({ findings: z.number().int(), auditedAgents: z.number().int() })
      .strict(),
    cohorts: z
      .object({
        participants: cohortComparisonSchema,
        comparison: cohortComparisonSchema,
        comparison_small: z.boolean(),
        net_effect: z.number().finite().nullable(),
      })
      .strict(),
    verdict: tnaVerdictSchema.nullable(),
  })
  .strict();
export type TnaEvaluationSnapshot = z.infer<typeof tnaEvaluationSnapshotSchema>;
export const tnaParticipantEvaluationSchema = z
  .object({
    participant_id: z.string().uuid(),
    peserta_id: z.string().uuid().nullable(),
    baseline_findings: count.nullable(),
    baseline_sessions: count.nullable(),
    baseline_sessions_source: z.enum(["frozen", "recomputed", "unavailable"]),
    eval_findings: count.nullable(),
    eval_sessions: count.nullable(),
    audited_in_eval: z.boolean(),
  })
  .strict();
export type TnaParticipantEvaluation = z.infer<
  typeof tnaParticipantEvaluationSchema
>;
export const tnaEvaluationPeriodOptionSchema = z
  .object({
    id: z.string().uuid(),
    month: z.number().int().min(1).max(12),
    year: z.number().int(),
    auditStatus: tnaAuditStatusSchema,
    is_default: z.boolean(),
  })
  .strict();
export type TnaEvaluationPeriodOption = z.infer<
  typeof tnaEvaluationPeriodOptionSchema
>;

export const tnaParametersQuerySchema = z.object({
  service_type: serviceTypeSchema,
  period_id: z.string().uuid(),
  compare_count: z.coerce.number().int().min(1).max(6).default(2),
  scope: z.enum(["candidates", "all"]).default("candidates"),
});
export const tnaParameterDetailQuerySchema = tnaParametersQuerySchema
  .omit({ scope: true })
  .extend({ indicator_id: z.string().uuid() });
export const createTnaNeedSchema = z
  .object({
    service_type: serviceTypeSchema,
    period_id: z.string().uuid(),
    indicator_id: z.string().uuid(),
    compare_count: z.number().int().min(1).max(6).default(2),
    validated_cluster_id: tnaClusterIdSchema,
    cause_note: z.string().trim().min(10).max(2000),
    gap_type: tnaGapTypeSchema,
    outcome: tnaOutcomeSchema,
    previous_plan_id: z.string().uuid().optional(),
  })
  .strict();
export type CreateTnaNeed = z.infer<typeof createTnaNeedSchema>;
export interface TnaNeed extends Omit<CreateTnaNeed, "previous_plan_id"> {
  id: string;
  previous_plan_id?: string | null;
  validation_snapshot: TnaMetricsSnapshot;
  suggested_cluster_id: z.infer<typeof tnaClusterIdSchema> | null;
  created_by: string;
  created_at: string;
}

const participantIds = z
  .array(z.string().uuid())
  .min(1)
  .max(200)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Peserta tidak boleh duplikat",
  );
const draftFields = z.object({
  title: z.string().trim().min(5).max(160),
  intervention_type: tnaInterventionTypeSchema,
  start_date: tanggalSchema,
  end_date: tanggalSchema,
  evaluation_due_date: tanggalSchema,
  target_max_rate_per_100: z.number().finite().min(0).max(100),
  target_max_spread_pct: z.number().finite().min(0).max(100),
});
export const createTnaPlanSchema = draftFields
  .extend({
    need_id: z.string().uuid(),
    program_id: z.string().uuid(),
    participant_peserta_ids: participantIds,
  })
  .strict()
  .refine(
    (p) => p.end_date >= p.start_date && p.evaluation_due_date > p.end_date,
    {
      message: "Tanggal rencana dan evaluasi tidak valid",
      path: ["evaluation_due_date"],
    },
  );
export const updateTnaDraftPlanSchema = draftFields
  .partial()
  .extend({
    expected_updated_at: z.string().datetime({ offset: true }),
    participant_peserta_ids: participantIds.optional(),
  })
  .strict();
export const tnaPlanTransitionSchema = z
  .object({ expected_updated_at: z.string().datetime({ offset: true }) })
  .strict();
export const tnaEvaluationPeriodInputSchema = tnaPlanTransitionSchema.extend({
  evaluation_period_id: z.string().uuid(),
});
export const completeTnaPlanSchema = tnaPlanTransitionSchema.extend({
  conclusion_note: z.string().trim().min(10).max(2000),
  follow_up: tnaFollowUpSchema,
});
export const cancelTnaPlanSchema = tnaPlanTransitionSchema.extend({
  cancel_reason: z.string().trim().min(10).max(1000).optional(),
});
export type TnaEvaluationPeriodInput = z.infer<
  typeof tnaEvaluationPeriodInputSchema
>;
export type CompleteTnaPlan = z.infer<typeof completeTnaPlanSchema>;
export type CancelTnaPlan = z.infer<typeof cancelTnaPlanSchema>;
export type CreateTnaPlan = z.infer<typeof createTnaPlanSchema>;
export type UpdateTnaDraftPlan = z.infer<typeof updateTnaDraftPlanSchema>;
export interface TnaPlan extends z.infer<typeof draftFields> {
  id: string;
  need_id: string;
  program_id: string;
  status: TnaPlanStatus;
  baseline_snapshot: TnaBaselineSnapshot | null;
  evaluation_period_id?: string | null;
  evaluation_snapshot?: TnaEvaluationSnapshot | null;
  evaluation_started_at?: string | null;
  verdict?: z.infer<typeof tnaVerdictSchema> | null;
  conclusion_note?: string | null;
  follow_up?: TnaFollowUp | null;
  completed_at?: string | null;
  cancel_reason?: string | null;
  evaluation_due?: boolean;
  activated_at: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface TnaPlanParticipant {
  id: string;
  plan_id: string;
  peserta_id: string | null;
  peserta_name_snapshot: string;
  team_snapshot: string | null;
  baseline_findings: number | null;
  baseline_sessions?: number | null;
  eval_findings?: number | null;
  eval_sessions?: number | null;
  audited_in_eval?: boolean | null;
  was_affected: boolean | null;
}
export const tnaPlanSchema = draftFields.extend({
  id: z.string().uuid(),
  need_id: z.string().uuid(),
  program_id: z.string().uuid(),
  status: tnaPlanStatusSchema,
  baseline_snapshot: tnaBaselineSnapshotSchema.nullable(),
  evaluation_period_id: z.string().uuid().nullable(),
  evaluation_snapshot: tnaEvaluationSnapshotSchema.nullable(),
  evaluation_started_at: z.string().datetime({ offset: true }).nullable(),
  verdict: tnaVerdictSchema.nullable(),
  conclusion_note: z.string().nullable(),
  follow_up: tnaFollowUpSchema.nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  cancel_reason: z.string().nullable(),
  activated_at: z.string().datetime({ offset: true }).nullable(),
  cancelled_at: z.string().datetime({ offset: true }).nullable(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export const tnaPlanParticipantSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  peserta_id: z.string().uuid().nullable(),
  peserta_name_snapshot: z.string(),
  team_snapshot: z.string().nullable(),
  baseline_findings: count.nullable(),
  baseline_sessions: count.nullable(),
  eval_findings: count.nullable(),
  eval_sessions: count.nullable(),
  audited_in_eval: z.boolean().nullable(),
  was_affected: z.boolean().nullable(),
});
export const tnaPlansQuerySchema = z.object({
  status: tnaPlanStatusSchema.optional(),
  due: z.enum(["0", "1"]).optional(),
});
export type TnaParticipantBaseline = {
  peserta_id: string | null;
  baseline_findings: number;
  baseline_sessions?: number;
  was_affected: boolean;
};
export const tnaParametersResponseSchema = z.object({
  items: z.array(tnaMetricsSnapshotSchema),
  compare_period_ids: z.array(z.string().uuid()),
  selected_audit_status: tnaAuditStatusSchema,
  insufficientData: z.boolean(),
});
export type TnaParametersResponse = z.infer<typeof tnaParametersResponseSchema>;
export interface TnaPlanDetail {
  plan: TnaPlan;
  participants: TnaPlanParticipant[];
  preview: TnaBaselineSnapshot | null;
  participant_preview: TnaParticipantBaseline[] | null;
  narrative: string;
  evaluation_narrative?: string | null;
  evaluation?: TnaEvaluationSnapshot | null;
  participant_evaluation?: TnaParticipantEvaluation[] | null;
  evaluation_period_options?: TnaEvaluationPeriodOption[];
}

export interface TnaParameterDetail {
  metrics: TnaMetricsSnapshot;
  affected_agents: Array<{
    peserta_id: string;
    nama: string | null;
    tim: string | null;
    findings: number;
  }>;
  clusters: RootCauseResult[];
  sample_tickets: Array<{
    id: string;
    peserta_id: string;
    no_tiket: string;
    ketidaksesuaian: string | null;
    sebaiknya: string | null;
  }>;
  suggested_programs: TnaProgram[];
}
export const tnaNeedSchema = createTnaNeedSchema.extend({
  id: z.string().uuid(),
  previous_plan_id: z.string().uuid().nullable(),
  validation_snapshot: tnaMetricsSnapshotSchema,
  suggested_cluster_id: tnaClusterIdSchema.nullable(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});
export const tnaNeedsQuerySchema = z.object({
  service_type: serviceTypeSchema.optional(),
  period_id: z.string().uuid().optional(),
  outcome: tnaOutcomeSchema.optional(),
});
export type TnaNeedsQuery = z.infer<typeof tnaNeedsQuerySchema>;
export interface TnaNeedDetail {
  need: TnaNeed;
  plans: TnaPlan[];
}
