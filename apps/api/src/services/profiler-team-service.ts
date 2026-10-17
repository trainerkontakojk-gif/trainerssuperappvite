/** Profiler team list (tim) management. */

import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";
import type { ProfilerTim } from "@trainers/types";

// ── Teams ────────────────────────────────────────────────
export async function getTeams(
  accessibleIds?: string[] | null,
): Promise<ProfilerTim[]> {
  if (accessibleIds !== null && accessibleIds !== undefined) {
    if (accessibleIds.length === 0) return [];
    const scopedTimRows = await fetchAllPages<{ tim: string | null }>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("tim")
          .in("id", accessibleIds)
          .order("tim", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    });
    const scopedTims = [
      ...new Set(scopedTimRows.map((r) => r.tim).filter(Boolean)),
    ] as string[];
    if (scopedTims.length === 0) return [];
    const data = await fetchAllPages<ProfilerTim>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_tim_list")
          .select("*")
          .in("nama", scopedTims)
          .order("nama")
          .order("id", { ascending: true })
          .range(from, to),
    });
    return data ?? [];
  }

  const data = await fetchAllPages<ProfilerTim>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_tim_list")
        .select("*")
        .order("nama")
        .order("id", { ascending: true })
        .range(from, to),
  });
  return data ?? [];
}

export async function createTeam(nama: string): Promise<ProfilerTim> {
  const { data, error } = await supabaseAdmin
    .from("profiler_tim_list")
    .insert({ nama })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiler_tim_list")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
