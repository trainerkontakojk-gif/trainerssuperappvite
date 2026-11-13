import type { SupabaseClient } from "@supabase/supabase-js";
import type { TnaPlanEfek } from "@trainers/types";
import { getEfekSessionSummaries } from "../efek/report";

/**
 * Linked EFEK sessions for a TNA plan (plans/markdown/efek-tna-plan-link.md).
 * Informational only: the TNA verdict never reads these numbers. Δ and status
 * come from the existing EFEK report in one bounded build. A read failure makes
 * only this section unavailable; the plan itself stays readable.
 */
export async function loadTnaPlanEfek(
  supabase: SupabaseClient,
  planId: string,
  rosterPesertaIds: string[],
): Promise<TnaPlanEfek> {
  try {
    const { data, error } = await supabase
      .from("efek_sessions")
      .select(
        "id, program_code, title, start_date, end_date, efek_participants(peserta_id)",
      )
      .eq("tna_plan_id", planId)
      .order("start_date", { ascending: false })
      .order("id");
    if (error) throw error;
    if (!data?.length) return { state: "ok", sessions: [] };
    const summaries = await getEfekSessionSummaries(
      supabase,
      data.map((row) => row.id as string),
    );
    const roster = new Set(rosterPesertaIds);
    return {
      state: "ok",
      sessions: data.map((row) => {
        const pesertaIds = (
          (row.efek_participants ?? []) as { peserta_id: string }[]
        ).map((p) => p.peserta_id);
        const summary = summaries.get(row.id as string);
        return {
          id: row.id as string,
          program_code: row.program_code as string,
          title: row.title as string,
          start_date: row.start_date as string,
          end_date: row.end_date as string,
          participant_count: pesertaIds.length,
          roster_overlap: pesertaIds.filter((id) => roster.has(id)).length,
          status: summary?.status ?? "menunggu",
          mean_delta: summary?.avg_delta ?? null,
        };
      }),
    };
  } catch {
    return { state: "unavailable" };
  }
}