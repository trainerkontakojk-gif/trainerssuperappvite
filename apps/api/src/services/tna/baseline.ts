import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TnaBaselineSnapshot,
  TnaNeed,
  TnaParticipantBaseline,
  TnaPlanParticipant,
} from "@trainers/types";
import { isAgentExcluded } from "../../lib/scoring";
import { getTnaParameterAnalysis } from "./analysis";
import { tnaBusinessError } from "./errors";

export async function validateTnaParticipants(
  supabase: SupabaseClient,
  ids: Array<string | null>,
): Promise<void> {
  const participantIds = ids.filter((id): id is string => id !== null);
  if (
    ids.length < 1 ||
    ids.length > 200 ||
    participantIds.length !== ids.length ||
    new Set(ids).size !== ids.length
  )
    throw tnaBusinessError("TNA_INVALID_PARTICIPANTS");
  const { data, error } = await supabase
    .from("profiler_peserta")
    .select("id, tim, batch_name, jabatan")
    .in("id", participantIds);
  if (error) throw error;
  // The query uses the caller JWT; invisible IDs fail closed just like missing IDs.
  if (
    data?.length !== ids.length ||
    data.some((row) => isAgentExcluded(row.tim, row.batch_name, row.jabatan))
  )
    throw tnaBusinessError("TNA_INVALID_PARTICIPANTS");
}

export async function computeTnaBaseline(
  supabase: SupabaseClient,
  need: TnaNeed,
  participants: TnaPlanParticipant[],
): Promise<{
  snapshot: TnaBaselineSnapshot;
  participantBaselines: TnaParticipantBaseline[];
}> {
  const { metrics, findings } = await getTnaParameterAnalysis({
    supabase,
    serviceType: need.service_type,
    periodId: need.period_id,
    indicatorId: need.indicator_id,
    compareCount: need.compare_count,
    dataScope: { kind: "all" },
  });
  const byParticipant = new Map<string, number>();
  for (const row of findings)
    byParticipant.set(
      row.peserta_id,
      (byParticipant.get(row.peserta_id) ?? 0) + 1,
    );
  return {
    snapshot: {
      ...metrics,
      validation_drift: {
        findings: metrics.findings - need.validation_snapshot.findings,
        auditedAgents:
          metrics.auditedAgents - need.validation_snapshot.auditedAgents,
      },
    },
    participantBaselines: participants.map((row) => {
      const baseline_findings =
        row.peserta_id === null ? 0 : (byParticipant.get(row.peserta_id) ?? 0);
      return {
        peserta_id: row.peserta_id,
        baseline_findings,
        was_affected: baseline_findings > 0,
      };
    }),
  };
}
