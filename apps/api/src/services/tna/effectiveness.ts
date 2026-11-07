import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  serviceTypeSchema,
  tnaFollowUpSchema,
  tnaGapTypeSchema,
  tnaProgramSnapshotSchema,
  tnaVerdictSchema,
  type TnaEffectiveness,
  type TnaEffectivenessGroup,
  type TnaEffectivenessQuery,
  type TnaEffectivenessStats,
  type TnaFollowUp,
  type TnaVerdict,
} from "@trainers/types";
import { fetchAllPages } from "../../lib/supabase-pagination";

// TNA phase 6 effectiveness (plans/markdown/tna-phase-6.md D28, K39, P-1,
// P-2). Only completed plans count, and only their frozen values: SIDAK is
// never recomputed. Reads use the caller JWT (RLS admin/trainer).

const rate = z.number().finite().nullable();
const completedPlanSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  need_id: z.string().uuid(),
  program_id: z.string().uuid(),
  program_snapshot: tnaProgramSnapshotSchema.nullable(),
  baseline_rate: rate,
  evaluation_rate: rate,
  verdict: tnaVerdictSchema,
  follow_up: tnaFollowUpSchema,
  activated_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }),
});
type CompletedPlan = z.infer<typeof completedPlanSchema>;
const needSchema = z.object({
  id: z.string().uuid(),
  gap_type: tnaGapTypeSchema,
  service_type: serviceTypeSchema,
});
const programSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});

const THIN_BELOW = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
// `.in()` travels in the URL; keep each batch well under gateway limits.
const ID_BATCH = 100;

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

interface Row {
  plan: CompletedPlan;
  program: { code: string; name: string };
  gapType: string;
  service: string;
}

function stats(rows: Row[]): TnaEffectivenessStats {
  const verdicts: Record<TnaVerdict, number> = {
    tercapai: 0,
    tercapai_sebagian: 0,
    tidak_tercapai: 0,
  };
  for (const { plan } of rows) verdicts[plan.verdict] += 1;
  return {
    completed: rows.length,
    verdicts,
    fully_achieved_pct: rows.length
      ? (verdicts.tercapai / rows.length) * 100
      : null,
    median_rate_drop: median(
      rows.flatMap(({ plan }) =>
        plan.baseline_rate === null || plan.evaluation_rate === null
          ? []
          : [plan.baseline_rate - plan.evaluation_rate],
      ),
    ),
    median_duration_days: median(
      rows.map(
        ({ plan }) =>
          (Date.parse(plan.completed_at) - Date.parse(plan.activated_at)) /
          DAY_MS,
      ),
    ),
  };
}

function group(
  key: string,
  label: string | null,
  rows: Row[],
): TnaEffectivenessGroup {
  const follow_ups: Record<TnaFollowUp, number> = {
    selesai_tuntas: 0,
    perlu_rencana_lanjutan: 0,
    eskalasi_non_training: 0,
  };
  for (const { plan } of rows) follow_ups[plan.follow_up] += 1;
  return {
    key,
    label,
    ...stats(rows),
    follow_ups,
    thin: rows.length < THIN_BELOW,
    plans: rows
      .map(({ plan }) => ({
        id: plan.id,
        title: plan.title,
        verdict: plan.verdict,
        completed_at: plan.completed_at,
      }))
      .sort(
        (a, b) =>
          b.completed_at.localeCompare(a.completed_at) ||
          a.id.localeCompare(b.id),
      ),
  };
}

async function byIds<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
  schema: z.ZodType<T>,
) {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += ID_BATCH) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("id", unique.slice(i, i + ID_BATCH));
    if (error) throw error;
    rows.push(...schema.array().parse(data));
  }
  return new Map(rows.map((row) => [(row as { id: string }).id, row]));
}

export async function getTnaEffectiveness(
  supabase: SupabaseClient,
  query: TnaEffectivenessQuery,
): Promise<TnaEffectiveness> {
  const raw = await fetchAllPages<unknown>({
    build: ({ from, to }) => {
      let q = supabase
        .from("tna_plans")
        .select(
          "id, title, need_id, program_id, program_snapshot, verdict, follow_up, activated_at, completed_at, baseline_rate:baseline_snapshot->ratePer100, evaluation_rate:evaluation_snapshot->population->ratePer100",
        )
        .eq("status", "selesai")
        .order("completed_at", { ascending: false })
        .order("id")
        .range(from, to);
      // Asia/Jakarta calendar days, inclusive on both ends.
      if (query.from) q = q.gte("completed_at", `${query.from}T00:00:00+07:00`);
      if (query.to)
        q = q.lt("completed_at", `${nextDay(query.to)}T00:00:00+07:00`);
      return q as never;
    },
  });
  const plans = completedPlanSchema.array().parse(raw);
  const [needs, programs] = await Promise.all([
    byIds(
      supabase,
      "tna_needs",
      "id, gap_type, service_type",
      plans.map((p) => p.need_id),
      needSchema,
    ),
    byIds(
      supabase,
      "tna_programs",
      "id, code, name",
      plans.map((p) => p.program_id),
      programSchema,
    ),
  ]);
  const rows: Row[] = plans.map((plan) => {
    const need = needs.get(plan.need_id);
    const catalog = programs.get(plan.program_id);
    if (!need || !catalog)
      throw new Error("TNA effectiveness: plan reference not readable");
    return {
      plan,
      // Frozen at activation (phase 5); older plans fall back to the catalog.
      program: plan.program_snapshot ?? catalog,
      // P-1: the gap the trainer validated on the need.
      gapType: need.gap_type,
      service: need.service_type,
    };
  });

  const buckets = new Map<string, { label: string | null; rows: Row[] }>();
  for (const row of rows) {
    const [key, label] =
      query.group_by === "program"
        ? [row.program.code, row.program.name]
        : [query.group_by === "gap_type" ? row.gapType : row.service, null];
    const bucket = buckets.get(key) ?? { label, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }
  const groups = [...buckets]
    .map(([key, bucket]) => group(key, bucket.label, bucket.rows))
    .sort(
      (a, b) =>
        b.completed - a.completed ||
        (a.label ?? a.key).localeCompare(b.label ?? b.key, "id"),
    );

  return {
    group_by: query.group_by,
    from: query.from ?? null,
    to: query.to ?? null,
    summary: stats(rows),
    groups,
  };
}
