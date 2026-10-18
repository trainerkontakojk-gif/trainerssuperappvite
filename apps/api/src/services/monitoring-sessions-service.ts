import {
  can,
  ketikTranscriptDurationSeconds,
  mapSimulationSubjectRowToSnapshot,
  MONITORING_HISTORY_PAGE_SIZE,
  type MonitoringHistoryScope,
  type MonitoringHistoryStatusFilter,
  type MonitoringSessionCounts,
  type MonitoringSessionPage,
  type MonitoringSessionRow,
  type Role,
  type SimulationSubjectSnapshot,
} from "@trainers/types";
import { createAdminClient } from "../lib/supabase";
import { getLeaderScopeSnapshot } from "./access/leader-scope";
import { getMonitoringHistory } from "./monitoring-history-service";
import { MonitoringReviewNotFoundError } from "./monitoring-review-service";

type Module = MonitoringSessionRow["module"];

export interface MonitoringHistoryFilters {
  module?: Module;
  status?: MonitoringHistoryStatusFilter;
  /** YYYY-MM-DD, awal hari WIB (inklusif). */
  from?: string;
  /** YYYY-MM-DD, akhir hari WIB (inklusif). */
  to?: string;
  q?: string;
  page: number;
}

/** Siapa yang boleh dilihat: semua, peserta tim yang disetujui, atau tidak ada. */
export type MonitoringActorScope =
  | { kind: "all" }
  | { kind: "team"; pesertaIds: string[]; batches: string[]; teams: string[] }
  | { kind: "none" };

type ViewRow = {
  id: string;
  module: Module;
  user_id: string | null;
  occurred_at: string;
  scenario_title: string;
  consumer_name: string | null;
  duration_seconds: number | null;
  first_message_at: string | null;
  last_message_at: string | null;
  score: number | null;
  review_status: MonitoringSessionRow["review_status"];
  subject_type: string | null;
  subject_peserta_id: string | null;
  subject_name: string | null;
  subject_batch_name: string | null;
  subject_team: string | null;
  legacy: boolean;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_peserta_id: string | null;
};

const EMPTY_COUNTS: MonitoringSessionCounts = {
  ketik: 0,
  pdkt: 0,
  telefun: 0,
  completed: 0,
  processing: 0,
  failed: 0,
  not_started: 0,
};

/** Leader memakai akses yang disetujui untuk SIDAK, sama seperti riwayat simulasi SIDAK. */
export async function resolveMonitoringScope(actor: {
  id: string;
  role: Role | null;
}): Promise<MonitoringActorScope> {
  if (can(actor.role, "participants.readAll")) return { kind: "all" };
  if (actor.role !== "leader") return { kind: "none" };
  const snapshot = await getLeaderScopeSnapshot(actor.id, "sidak");
  if (snapshot.requestIds.length === 0) return { kind: "none" };
  return {
    kind: "team",
    pesertaIds: snapshot.pesertaIds,
    batches: snapshot.batchNames,
    teams: snapshot.tims,
  };
}

function publicScope(scope: MonitoringActorScope): MonitoringHistoryScope {
  return scope.kind === "team"
    ? { kind: "team", batches: scope.batches, teams: scope.teams }
    : scope;
}

/** Rentang tanggal WIB menjadi batas waktu [from, to). */
function wibRange(filters: MonitoringHistoryFilters) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00+07:00`) : null;
  const to = filters.to
    ? new Date(new Date(`${filters.to}T00:00:00+07:00`).getTime() + 86_400_000)
    : null;
  return { from, to };
}

function iso(value: string): string {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toISOString();
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function toSessionRow(row: ViewRow): MonitoringSessionRow {
  const simulationSubject = mapSimulationSubjectRowToSnapshot({
    simulation_subject_type: row.subject_type,
    simulation_subject_peserta_id: row.subject_peserta_id,
    simulation_subject_name: row.subject_name,
    simulation_subject_batch_name: row.subject_batch_name,
    simulation_subject_team: row.subject_team,
  });
  const isParticipant = simulationSubject.type === "participant";
  return {
    id: row.id,
    module: row.module,
    user_id: row.user_id,
    occurred_at: iso(row.occurred_at),
    scenario_title: row.scenario_title,
    consumer_name: row.consumer_name,
    duration_seconds:
      row.module === "ketik"
        ? ketikTranscriptDurationSeconds(
            row.first_message_at,
            row.last_message_at,
          )
        : numberOrNull(row.duration_seconds),
    score: numberOrNull(row.score),
    score_scale: row.module === "telefun" ? 10 : 100,
    review_status: row.review_status,
    legacy: row.legacy,
    participant: {
      name:
        (isParticipant ? row.subject_name : null) ??
        row.actor_name ??
        row.actor_email,
      batch: isParticipant ? row.subject_batch_name : null,
    },
    actor: {
      email: row.actor_email,
      name: row.actor_name,
      role: row.actor_role,
    },
    simulationSubject,
  };
}

function isMissingSessionsFunction(error: { code?: string; message?: string }) {
  return (
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      error.code === "42P01") &&
    /monitoring_sessions/.test(error.message ?? "")
  );
}

/**
 * Satu halaman Riwayat Monitoring. Jalur utama: fungsi database
 * `monitoring_sessions_page`. Selama migrasinya belum dipasang, API membaca
 * semua sesi seperti sebelumnya lalu memfilter di server.
 */
export async function listMonitoringSessions(
  filters: MonitoringHistoryFilters,
  scope: MonitoringActorScope,
): Promise<MonitoringSessionPage> {
  const page = filters.page;
  const base = {
    page,
    page_size: MONITORING_HISTORY_PAGE_SIZE,
    scope: publicScope(scope),
  };
  if (scope.kind === "none") {
    return { ...base, rows: [], total: 0, counts: { ...EMPTY_COUNTS } };
  }

  const { from, to } = wibRange(filters);
  const { data, error } = await createAdminClient().rpc(
    "monitoring_sessions_page",
    {
      p_module: filters.module ?? null,
      p_status: filters.status ?? null,
      p_from: from?.toISOString() ?? null,
      p_to: to?.toISOString() ?? null,
      p_q: filters.q?.trim() || null,
      p_peserta_ids: scope.kind === "team" ? scope.pesertaIds : null,
      p_limit: MONITORING_HISTORY_PAGE_SIZE,
      p_offset: (page - 1) * MONITORING_HISTORY_PAGE_SIZE,
    },
  );
  if (error) {
    if (isMissingSessionsFunction(error)) {
      console.warn(
        "[monitoring] monitoring_sessions_page missing; reading all sessions",
      );
      return { ...base, ...(await listFromFullHistory(filters, scope)) };
    }
    throw error;
  }
  const result = data as {
    total: number;
    counts: MonitoringSessionCounts;
    rows: ViewRow[];
  };
  return {
    ...base,
    total: Number(result.total),
    counts: { ...EMPTY_COUNTS, ...result.counts },
    rows: result.rows.map(toSessionRow),
  };
}

// ── Fallback sebelum migrasi 20261018090000 dipasang ──

async function readActorPeserta(): Promise<Map<string, string>> {
  const { data, error } = await createAdminClient()
    .from("profiler_peserta")
    .select("id, akun_id")
    .not("akun_id", "is", null)
    .order("id");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.akun_id && !map.has(row.akun_id))
      map.set(row.akun_id, row.id);
  }
  return map;
}

/**
 * Akun yang biayanya boleh dilihat: `null` berarti semua. Leader hanya melihat
 * akun yang tertaut ke peserta di tim yang aksesnya disetujui.
 */
export async function scopedUsageUserIds(
  scope: MonitoringActorScope,
): Promise<string[] | null> {
  if (scope.kind === "all") return null;
  if (scope.kind === "none") return [];
  const allowed = new Set(scope.pesertaIds);
  const actorPeserta = await readActorPeserta();
  return [...actorPeserta]
    .filter(([, pesertaId]) => allowed.has(pesertaId))
    .map(([userId]) => userId);
}

function subjectFields(subject: SimulationSubjectSnapshot | null | undefined) {
  return {
    subject_type: subject?.type === "unknown" ? null : (subject?.type ?? null),
    subject_peserta_id: subject?.participantId ?? null,
    subject_name: subject?.displayName ?? null,
    subject_batch_name: subject?.batchName ?? null,
    subject_team: subject?.team ?? null,
  };
}

async function listFromFullHistory(
  filters: MonitoringHistoryFilters,
  scope: Exclude<MonitoringActorScope, { kind: "none" }>,
) {
  const [entries, actorPeserta] = await Promise.all([
    getMonitoringHistory(),
    scope.kind === "team" ? readActorPeserta() : Promise.resolve(null),
  ]);
  const { from, to } = wibRange(filters);
  const q = filters.q?.trim().toLowerCase();
  const allowed = scope.kind === "team" ? new Set(scope.pesertaIds) : null;

  const rows = entries.flatMap((entry) => {
    const subject = subjectFields(entry.simulationSubject);
    const actorPesertaId = actorPeserta?.get(entry.user_id) ?? null;
    const time = new Date(entry.created_at).getTime();
    const status = entry.review_status;
    const matches =
      (!filters.module || entry.module === filters.module) &&
      (!filters.status ||
        status === filters.status ||
        (filters.status === "processing" && status === "pending")) &&
      (!from || time >= from.getTime()) &&
      (!to || time < to.getTime()) &&
      (!allowed ||
        (subject.subject_peserta_id !== null &&
          allowed.has(subject.subject_peserta_id)) ||
        (actorPesertaId !== null && allowed.has(actorPesertaId))) &&
      (!q ||
        [
          entry.scenario_title,
          entry.consumer_name,
          subject.subject_name,
          entry.user_email,
        ].some((value) => value?.toLowerCase().includes(q)));
    if (!matches) return [];
    return [
      {
        ...subject,
        id: entry.id,
        module: entry.module,
        user_id: entry.user_id || null,
        occurred_at: entry.created_at,
        scenario_title: entry.scenario_title,
        consumer_name: entry.consumer_name ?? null,
        // Durasi KETIK sudah dihitung dari transkrip oleh riwayat penuh.
        duration_seconds: entry.duration_seconds,
        first_message_at: null,
        last_message_at: null,
        score: entry.score,
        review_status: status,
        legacy: entry.telefun_legacy === true,
        actor_email: entry.user_email ?? null,
        actor_name: null,
        actor_role: entry.user_role ?? null,
        actor_peserta_id: actorPesertaId,
      } satisfies ViewRow,
    ];
  });

  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) {
    counts[row.module] += 1;
    counts[
      row.review_status === "pending" ? "processing" : row.review_status
    ] += 1;
  }
  const start = (filters.page - 1) * MONITORING_HISTORY_PAGE_SIZE;
  return {
    total: rows.length,
    counts,
    rows: rows
      .slice(start, start + MONITORING_HISTORY_PAGE_SIZE)
      .map((row) => ({
        ...toSessionRow(row),
        duration_seconds: row.duration_seconds,
      })),
  };
}

const SOURCE_TABLES: Record<Module, string[]> = {
  ketik: ["ketik_history"],
  pdkt: ["pdkt_history"],
  telefun: ["telefun_history", "results"],
};

/** Detail sesi untuk leader: sesi di luar timnya dianggap tidak ada. */
export async function assertSessionInScope(
  module: Module,
  id: string,
  scope: MonitoringActorScope,
): Promise<void> {
  if (scope.kind === "all") return;
  const notFound = new MonitoringReviewNotFoundError("Sesi tidak ditemukan.");
  if (scope.kind === "none") throw notFound;

  const admin = createAdminClient();
  for (const table of SOURCE_TABLES[module]) {
    const columns =
      table === "results"
        ? "user_id"
        : "user_id, simulation_subject_peserta_id";
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) continue;
    const row = data as unknown as {
      user_id: string | null;
      simulation_subject_peserta_id?: string | null;
    };
    const allowed = new Set(scope.pesertaIds);
    if (
      row.simulation_subject_peserta_id &&
      allowed.has(row.simulation_subject_peserta_id)
    ) {
      return;
    }
    if (row.user_id) {
      const linked = await admin
        .from("profiler_peserta")
        .select("id")
        .eq("akun_id", row.user_id);
      if (linked.error) throw linked.error;
      if ((linked.data ?? []).some((peserta) => allowed.has(peserta.id)))
        return;
    }
    throw notFound;
  }
  throw notFound;
}
