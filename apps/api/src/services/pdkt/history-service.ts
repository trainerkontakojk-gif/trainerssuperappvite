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

// The list shows only these; `GET /history/:id` returns one full session.
const HISTORY_LIST_COLUMNS =
  "id,user_id,timestamp,evaluation_status,evaluation_error,evaluation_started_at,evaluation_completed_at,time_taken,created_at,simulation_subject_type,simulation_subject_peserta_id,simulation_subject_name,simulation_subject_batch_name,simulation_subject_team,score:evaluation->score,scenario_id:config->scenarios->0->>id,scenario_title:config->scenarios->0->>title,last_subject:emails->-1->>subject";

export type PdktHistoryView = "full" | "list";

function toFullRow(row: Record<string, any>) {
  return {
    ...row,
    config: toPdktHistoryConfig(row.config),
    emails: Array.isArray(row.emails)
      ? row.emails.map(toPdktSimulationEmail)
      : [],
  };
}

/**
 * Same keys the UI reads from a full row (last email subject, first scenario,
 * score), so list helpers work unchanged; `detail: "summary"` tells the UI to
 * load the full session before showing it.
 */
function toListRow(row: Record<string, any>) {
  const { score, scenario_id, scenario_title, last_subject, ...rest } = row;
  return {
    ...rest,
    detail: "summary" as const,
    config: { scenarios: [{ id: scenario_id, title: scenario_title }] },
    emails: [{ subject: last_subject }],
    evaluation: typeof score === "number" ? { score } : null,
  };
}

/** RLS selects visible IDs; only the backend reads their private replay snapshots. */
export async function fetchPdktHistory(
  userClient: SupabaseClient,
  userId: string,
  view: PdktHistoryView = "full",
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
  const columns: string =
    view === "list" ? HISTORY_LIST_COLUMNS : HISTORY_COLUMNS;
  const history: Array<Record<string, unknown>> = [];
  // Keep PostgREST's encoded `in` URL below the gateway request-line limit.
  for (let start = 0; start < visible.length; start += 100) {
    const ids = visible.slice(start, start + 100).map((row) => row.id);
    const { data, error } = await admin
      .from("pdkt_history")
      .select(columns)
      .eq("user_id", userId)
      .in("id", ids);
    if (error) throw error;
    const rows = new Map(
      ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => [
        row.id,
        row,
      ]),
    );
    for (const id of ids) {
      const row = rows.get(id);
      if (!row) throw new Error("Riwayat berubah saat dimuat. Coba lagi.");
      history.push(view === "list" ? toListRow(row) : toFullRow(row));
    }
  }
  return history;
}

/** One full session, if RLS shows it to the caller and it belongs to `userId`. */
export async function fetchPdktHistoryItem(
  userClient: SupabaseClient,
  userId: string,
  id: string,
) {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
    return null;
  const { data: visible, error: visibleError } = await userClient
    .from("pdkt_history")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (visibleError) throw visibleError;
  if (!visible) return null;
  const { data, error } = await createAdminClient()
    .from("pdkt_history")
    .select(HISTORY_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toFullRow(data) : null;
}
