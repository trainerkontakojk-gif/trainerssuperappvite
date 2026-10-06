import { supabaseAdmin } from "../../lib/supabase";
import type { ServiceType } from "@trainers/types";

import { ScopeUnavailableError } from "./errors";

export interface LeaderScopeSnapshot {
  requestIds: string[];
  pesertaIds: string[];
  batchNames: string[];
  tims: string[];
  serviceTypes: ServiceType[];
}

export async function getLeaderScopeSnapshot(
  userId: string,
  module: string,
): Promise<LeaderScopeSnapshot> {
  const empty: LeaderScopeSnapshot = {
    requestIds: [],
    pesertaIds: [],
    batchNames: [],
    tims: [],
    serviceTypes: [],
  };

  const { data, error } = await supabaseAdmin.rpc("get_leader_scope_snapshot", {
    p_leader_user_id: userId,
    p_module: module,
  });

  if (error) throw new ScopeUnavailableError();

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return empty;

  return {
    requestIds: row.request_ids ?? [],
    pesertaIds: row.peserta_ids ?? [],
    batchNames: row.batch_names ?? [],
    tims: row.tims ?? [],
    serviceTypes: (row.service_types ?? []).filter(
      (s: string): s is ServiceType =>
        ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"].includes(
          s,
        ),
    ),
  };
}
