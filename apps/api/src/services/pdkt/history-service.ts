import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import {
  toPdktHistoryConfig,
  toPdktSimulationEmail,
} from "./scenario-projections";

// A literal lets PostgREST infer the selected row instead of GenericStringError.
const HISTORY_COLUMNS =
  "id,user_id,timestamp,config,emails,evaluation,evaluation_status,evaluation_error,evaluation_started_at,evaluation_completed_at,time_taken,created_at,simulation_subject_type,simulation_subject_peserta_id,simulation_subject_name,simulation_subject_batch_name,simulation_subject_team";

/** RLS selects visible IDs; only the backend reads their private replay snapshots. */
export async function fetchPdktHistory(
  userClient: SupabaseClient,
  userId: string,
) {
  const visible = await fetchAllPages<{ id: string; timestamp: string }>({
    pageSize: 500,
    build: ({ from, to }) =>
      userClient
        .from("pdkt_history")
        .select("id,timestamp")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
  });
  const admin = createAdminClient();
  const history: Array<Record<string, unknown>> = [];
  // Keep PostgREST's encoded `in` URL below the gateway request-line limit.
  for (let start = 0; start < visible.length; start += 100) {
    const ids = visible.slice(start, start + 100).map((row) => row.id);
    const { data, error } = await admin
      .from("pdkt_history")
      .select(HISTORY_COLUMNS)
      .eq("user_id", userId)
      .in("id", ids);
    if (error) throw error;
    const rows = new Map((data ?? []).map((row) => [row.id, row]));
    for (const id of ids) {
      const row = rows.get(id);
      if (!row) throw new Error("Riwayat berubah saat dimuat. Coba lagi.");
      history.push({
        ...row,
        config: toPdktHistoryConfig(row.config),
        emails: Array.isArray(row.emails)
          ? row.emails.map(toPdktSimulationEmail)
          : [],
      });
    }
  }
  return history;
}
