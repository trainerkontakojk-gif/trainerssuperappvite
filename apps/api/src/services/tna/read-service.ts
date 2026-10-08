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
} from "@trainers/types";
import { computeTnaBaseline } from "./baseline";
import { buildTnaNarrative } from "./narrative";
import { TnaServiceError } from "./errors";
import { fetchAllPages } from "../../lib/supabase-pagination";

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
) {
  const rows = await fetchAllPages({
    build: ({ from, to }) => {
      let query = supabase
        .from("tna_plans")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to);
      if (status) query = query.eq("status", status);
      return query;
    },
  });
  return { items: tnaPlanSchema.array().parse(rows) };
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
  return {
    plan,
    participants,
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
