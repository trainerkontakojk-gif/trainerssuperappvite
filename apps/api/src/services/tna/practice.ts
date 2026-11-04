import type { SupabaseClient } from "@supabase/supabase-js";
import {
  tnaPracticeTargetSchema,
  type TnaParticipantPractice,
  type TnaPlan,
  type TnaPlanParticipant,
  type TnaPlanPractice,
  type TnaPracticeEntry,
  type TnaPracticeModules,
  type TnaPracticeStatus,
  type TnaPracticeSummary,
  type TnaPracticeTarget,
} from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import {
  asString,
  getReviewStatus,
  getScore,
  SIMULATION_SOURCES,
  SIMULATION_STATUS_COLUMNS,
  type RawSimulationRow,
} from "../simulations/sources";

// TNA phase 3 practice progress (plans/markdown/tna-phase-3.md D16, K18-K21).
//
// K21: this is the only TNA module that reads simulation history with the
// service role, because history RLS is owner-only. It reads ids, subject,
// time, score and review status for the plan's own roster, and returns counts
// and averages only: never transcripts, scenario text, or consumer data.

export class TnaPracticeUnavailableError extends Error {
  constructor(source: string) {
    super(`TNA practice source ${source} failed`);
    this.name = "TnaPracticeUnavailableError";
  }
}

export async function loadTnaPracticeTargets(
  supabase: SupabaseClient,
  planId: string,
): Promise<TnaPracticeTarget[]> {
  const { data, error } = await supabase
    .from("tna_plan_practice_targets")
    .select("module, min_sessions")
    .eq("plan_id", planId)
    .order("module");
  if (error) throw error;
  return tnaPracticeTargetSchema.array().parse(data ?? []);
}

export function practiceStatus(
  sessions: number,
  minSessions: number,
): TnaPracticeStatus {
  if (sessions === 0) return "belum_mulai";
  return sessions >= minSessions ? "memenuhi" : "berjalan";
}

function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** K18: start_date 00:00 WIB inclusive .. day after evaluation_due_date 00:00 WIB exclusive. */
export function practiceWindow(
  plan: Pick<TnaPlan, "start_date" | "evaluation_due_date">,
) {
  return {
    from: `${plan.start_date}T00:00:00+07:00`,
    to: `${nextDay(plan.evaluation_due_date)}T00:00:00+07:00`,
  };
}

type CountedRow = RawSimulationRow & { id: string };

async function readRows(
  module: TnaPracticeTarget["module"],
  branch: "participant" | "self",
  ids: string[],
  window: { from: string; to: string },
): Promise<CountedRow[]> {
  if (ids.length === 0) return [];
  const { table, timeColumn } = SIMULATION_SOURCES[module];
  const admin = createAdminClient();
  try {
    return await fetchAllPages<CountedRow>({
      build: ({ from, to }) =>
        admin
          .from(table)
          .select(
            `id, user_id, simulation_subject_type, simulation_subject_peserta_id, ${SIMULATION_STATUS_COLUMNS[module]}`,
          )
          .eq("simulation_subject_type", branch)
          .in(
            branch === "participant"
              ? "simulation_subject_peserta_id"
              : "user_id",
            ids,
          )
          .gte(timeColumn, window.from)
          .lt(timeColumn, window.to)
          .order("id")
          .range(from, to) as never,
    });
  } catch (error) {
    console.error(
      `[tna-practice] ${table} ${branch} read failed`,
      error instanceof Error ? error.message : error,
    );
    throw new TnaPracticeUnavailableError(table);
  }
}

function summarize(
  targets: TnaPracticeTarget[],
  participants: TnaParticipantPractice[],
): TnaPracticeSummary[] {
  return targets.map(({ module, min_sessions }) => ({
    module,
    min_sessions,
    met: participants.filter((p) => p.modules[module]?.status === "memenuhi")
      .length,
    total: participants.length,
  }));
}

const byParticipantId = (
  a: TnaParticipantPractice,
  b: TnaParticipantPractice,
) => a.participant_id.localeCompare(b.participant_id);

/** Live progress for an aktif/evaluasi plan (K19, K20, K23). */
export async function computeTnaPlanPractice(args: {
  plan: Pick<TnaPlan, "start_date" | "evaluation_due_date">;
  participants: TnaPlanParticipant[];
  targets: TnaPracticeTarget[];
}): Promise<TnaPlanPractice> {
  const { plan, participants, targets } = args;
  const pesertaIds = participants
    .map((p) => p.peserta_id)
    .filter((id): id is string => id !== null);

  // K19b: a self session belongs to the participant whose linked account ran it.
  const accountToPeserta = new Map<string, string>();
  if (pesertaIds.length) {
    const { data, error } = await createAdminClient()
      .from("profiler_peserta")
      .select("id, akun_id")
      .in("id", pesertaIds);
    if (error) {
      console.error(
        "[tna-practice] profiler_peserta read failed",
        error.message,
      );
      throw new TnaPracticeUnavailableError("profiler_peserta");
    }
    for (const row of data ?? []) {
      if (row.akun_id) accountToPeserta.set(row.akun_id, row.id);
    }
  }

  const window = practiceWindow(plan);
  const totals = new Map<string, { sessions: number; scoreSum: number }>();
  for (const { module } of targets) {
    const [participantRows, selfRows] = await Promise.all([
      readRows(module, "participant", pesertaIds, window),
      readRows(module, "self", [...accountToPeserta.keys()], window),
    ]);
    const seen = new Set<string>();
    for (const row of [...participantRows, ...selfRows]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      // P-3: only reviewed sessions with a native score count.
      if (getReviewStatus(row, module) !== "completed") continue;
      const score = getScore(row, module);
      if (score === null) continue;
      const pesertaId =
        row.simulation_subject_type === "participant"
          ? asString(row.simulation_subject_peserta_id)
          : accountToPeserta.get(asString(row.user_id) ?? "");
      if (!pesertaId) continue;
      const key = `${pesertaId}:${module}`;
      const total = totals.get(key) ?? { sessions: 0, scoreSum: 0 };
      total.sessions += 1;
      total.scoreSum += score;
      totals.set(key, total);
    }
  }

  const rows = participants
    .map((participant): TnaParticipantPractice => {
      const modules: TnaPracticeModules = {};
      for (const { module, min_sessions } of targets) {
        const total = participant.peserta_id
          ? totals.get(`${participant.peserta_id}:${module}`)
          : undefined;
        const sessions = total?.sessions ?? 0;
        const entry: TnaPracticeEntry = {
          sessions,
          avg_score:
            sessions === 0
              ? null
              : Math.round((total!.scoreSum / sessions) * 10) / 10,
          status: practiceStatus(sessions, min_sessions),
        };
        modules[module] = entry;
      }
      return {
        participant_id: participant.id,
        peserta_id: participant.peserta_id,
        modules,
      };
    })
    .sort(byParticipantId);
  return {
    state: "live",
    participants: rows,
    summary: summarize(targets, rows),
  };
}

/** Frozen progress for a selesai plan, from practice_snapshot (K20). */
export function frozenTnaPlanPractice(
  participants: TnaPlanParticipant[],
  targets: TnaPracticeTarget[],
): TnaPlanPractice {
  const rows = participants
    .map((participant) => ({
      participant_id: participant.id,
      peserta_id: participant.peserta_id,
      modules: participant.practice_snapshot ?? {},
    }))
    .sort(byParticipantId);
  return {
    state: "frozen",
    participants: rows,
    summary: summarize(targets, rows),
  };
}

export function unavailableTnaPlanPractice(): TnaPlanPractice {
  return { state: "unavailable", participants: [], summary: [] };
}
