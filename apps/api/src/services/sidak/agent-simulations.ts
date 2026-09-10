import { z } from "zod";
import {
  mapSimulationSubjectRowToSnapshot,
  type MonitoringReviewStatus,
  type SidakSimulationCursor,
  type SidakSimulationModule,
  type SidakSimulationPage,
  type SidakSimulationSummary,
} from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";
import { normalizeReviewStatus } from "../monitoring-history-service";
import { getMonitoringReviewDetail } from "../monitoring-review-service";

export type { SidakSimulationCursor } from "@trainers/types";

export const SIDAK_SIMULATION_PAGE_SIZE = 5;

const cursorSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  module: z.enum(["ketik", "pdkt", "telefun"]),
  historyId: z.string().uuid(),
});

export type SidakSimulationItemOrder = Pick<
  SidakSimulationCursor,
  "occurredAt" | "module" | "historyId"
>;

export class SidakSimulationDataError extends Error {
  readonly source: string;

  constructor(source: string, message = "Gagal memuat riwayat simulasi.") {
    super(message);
    this.name = "SidakSimulationDataError";
    this.source = source;
  }
}

export class SidakSimulationNotFoundError extends Error {
  constructor(message = "Agent atau sesi simulasi tidak ditemukan.") {
    super(message);
    this.name = "SidakSimulationNotFoundError";
  }
}

export function encodeSidakSimulationCursor(
  cursor: SidakSimulationCursor,
): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSidakSimulationCursor(
  value: string | null | undefined,
): SidakSimulationCursor | null {
  if (!value) return null;

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = cursorSchema.safeParse(JSON.parse(decoded));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function compareSidakSimulationItems(
  left: SidakSimulationItemOrder | SidakSimulationSummary,
  right: SidakSimulationItemOrder | SidakSimulationSummary,
): number {
  const dateOrder =
    new Date(right.occurredAt).getTime() -
    new Date(left.occurredAt).getTime();
  if (dateOrder !== 0) return dateOrder;

  const moduleOrder = left.module.localeCompare(right.module);
  if (moduleOrder !== 0) return moduleOrder;

  const leftId = "historyId" in left ? left.historyId : left.id;
  const rightId = "historyId" in right ? right.historyId : right.id;
  return leftId.localeCompare(rightId);
}

type RawSimulationRow = {
  id?: unknown;
  user_id?: unknown;
  date?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  scenario_title?: unknown;
  simulation_duration?: unknown;
  time_taken?: unknown;
  duration_seconds?: unknown;
  final_score?: unknown;
  score?: unknown;
  review_status?: unknown;
  evaluation_status?: unknown;
  status?: unknown;
  scoring_status?: unknown;
  config?: unknown;
  scenarios?: unknown;
  evaluation?: unknown;
  evaluation_score?: unknown;
  simulation_subject_type?: unknown;
  simulation_subject_peserta_id?: unknown;
  simulation_subject_name?: unknown;
  simulation_subject_batch_name?: unknown;
  simulation_subject_team?: unknown;
};

type ProfileRow = {
  id?: unknown;
  email?: unknown;
  role?: unknown;
};

const SOURCE_CONFIG: Record<
  SidakSimulationModule,
  { table: string; timeColumn: "date" | "timestamp" | "created_at"; select: string }
> = {
  ketik: {
    table: "ketik_history",
    timeColumn: "date",
    select:
      "id, user_id, date, scenario_title, simulation_duration, final_score, review_status, simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name, simulation_subject_batch_name, simulation_subject_team",
  },
  pdkt: {
    table: "pdkt_history",
    timeColumn: "timestamp",
    select:
      "id, user_id, timestamp, created_at, scenarios:config->scenarios, evaluation_score:evaluation->score, evaluation_status, time_taken, simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name, simulation_subject_batch_name, simulation_subject_team",
  },
  telefun: {
    table: "telefun_history",
    timeColumn: "created_at",
    select:
      "id, user_id, created_at, scenario_title, duration_seconds, score, status, scoring_status, simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name, simulation_subject_batch_name, simulation_subject_team",
  },
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstScenarioTitle(config: unknown): string {
  const scenarios = Array.isArray(config)
    ? config
    : asArray(asObject(config).scenarios);
  const firstScenario = asObject(scenarios[0]);
  return asString(firstScenario.title) ?? "Simulasi Email";
}

function occurredAt(row: RawSimulationRow, module: SidakSimulationModule): string {
  const value =
    module === "ketik"
      ? row.date
      : module === "pdkt"
        ? row.timestamp ?? row.created_at
        : row.created_at;
  return asString(value) ?? "";
}

function getScore(row: RawSimulationRow, module: SidakSimulationModule): number | null {
  if (module === "ketik") return asNumber(row.final_score);
  if (module === "telefun") return asNumber(row.score);
  return asNumber(row.evaluation_score ?? asObject(row.evaluation).score);
}

function getReviewStatus(
  row: RawSimulationRow,
  module: SidakSimulationModule,
): MonitoringReviewStatus {
  if (module === "ketik") return normalizeReviewStatus(row.review_status);
  if (module === "pdkt") return normalizeReviewStatus(row.evaluation_status);

  const scoringStatus = normalizeReviewStatus(row.scoring_status);
  if (row.scoring_status !== null && row.scoring_status !== undefined) {
    return scoringStatus;
  }

  if (row.status === "pending") return "pending";
  if (row.status === "active") return "processing";
  if (row.status === "failed") return "failed";
  return getScore(row, module) === null ? "not_started" : "completed";
}

function getDuration(
  row: RawSimulationRow,
  module: SidakSimulationModule,
): number | null {
  return asNumber(
    module === "ketik"
      ? row.simulation_duration
      : module === "pdkt"
        ? row.time_taken
        : row.duration_seconds,
  );
}

function getScenarioTitle(
  row: RawSimulationRow,
  module: SidakSimulationModule,
): string {
  if (module === "pdkt") {
    return firstScenarioTitle(row.scenarios ?? row.config);
  }
  return (
    asString(row.scenario_title) ??
    (module === "ketik" ? "Simulasi Chat" : "Simulasi Telepon")
  );
}

function toSummary(
  row: RawSimulationRow,
  module: SidakSimulationModule,
  agentId: string,
  profiles: Map<string, ProfileRow>,
): SidakSimulationSummary | null {
  const id = asString(row.id);
  const at = occurredAt(row, module);
  if (!id || !at) return null;

  const simulationSubject = mapSimulationSubjectRowToSnapshot(row);
  if (
    simulationSubject.type !== "participant" ||
    simulationSubject.participantId !== agentId
  ) {
    return null;
  }

  const userId = asString(row.user_id);
  const actor = userId ? profiles.get(userId) : undefined;

  return {
    id,
    module,
    scenarioTitle: getScenarioTitle(row, module),
    occurredAt: at,
    durationSeconds: getDuration(row, module),
    score: getScore(row, module),
    scoreScale: module === "telefun" ? 10 : 100,
    reviewStatus: getReviewStatus(row, module),
    simulationSubject,
    actor: {
      userId,
      email: asString(actor?.email),
      role: asString(actor?.role),
    },
  };
}

function applyCursor(
  query: any,
  module: SidakSimulationModule,
  timeColumn: string,
  cursor: SidakSimulationCursor | null,
): any {
  if (!cursor) return query;

  if (module < cursor.module) {
    return query.lt(timeColumn, cursor.occurredAt);
  }
  if (module > cursor.module) {
    return query.lte(timeColumn, cursor.occurredAt);
  }

  return query.or(
    `${timeColumn}.lt.${cursor.occurredAt},and(${timeColumn}.eq.${cursor.occurredAt},id.gt.${cursor.historyId})`,
  );
}

async function ensureAgentExists(agentId: string): Promise<void> {
  const { data, error } = await createAdminClient()
    .from("profiler_peserta")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new SidakSimulationDataError("profiler_peserta");
  if (!data) throw new SidakSimulationNotFoundError("Agent tidak ditemukan.");
}

async function readModuleRows(
  agentId: string,
  module: SidakSimulationModule,
  cursor: SidakSimulationCursor | null,
): Promise<RawSimulationRow[]> {
  const config = SOURCE_CONFIG[module];
  let query: any = createAdminClient()
    .from(config.table)
    .select(config.select)
    .eq("simulation_subject_type", "participant")
    .eq("simulation_subject_peserta_id", agentId);
  query = applyCursor(query, module, config.timeColumn, cursor);

  const { data, error } = await query
    .order(config.timeColumn, { ascending: false })
    .order("id", { ascending: true })
    .limit(SIDAK_SIMULATION_PAGE_SIZE + 1);

  if (error) throw new SidakSimulationDataError(config.table);
  return Array.isArray(data) ? (data as RawSimulationRow[]) : [];
}

async function readActors(
  rows: Array<{ row: RawSimulationRow; module: SidakSimulationModule }>,
): Promise<Map<string, ProfileRow>> {
  const userIds = [
    ...new Set(
      rows
        .map(({ row }) => asString(row.user_id))
        .filter((value): value is string => value !== null),
    ),
  ];
  if (userIds.length === 0) return new Map();

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, email, role")
    .in("id", userIds);
  if (error) throw new SidakSimulationDataError("profiles");

  return new Map(
    (Array.isArray(data) ? (data as ProfileRow[]) : [])
      .map((profile) => [asString(profile.id), profile] as const)
      .filter((item): item is readonly [string, ProfileRow] => item[0] !== null),
  );
}

export async function getSidakAgentSimulationHistory(params: {
  agentId: string;
  module: SidakSimulationModule | "all";
  cursor?: string | null;
  allowedModules?: readonly SidakSimulationModule[];
}): Promise<SidakSimulationPage> {
  await ensureAgentExists(params.agentId);
  const cursor = decodeSidakSimulationCursor(params.cursor);
  if (params.cursor && !cursor) {
    throw new SidakSimulationDataError("cursor", "Cursor riwayat simulasi tidak valid.");
  }
  if (cursor && params.module !== "all" && cursor.module !== params.module) {
    throw new SidakSimulationDataError(
      "cursor",
      "Cursor riwayat simulasi tidak sesuai dengan modul yang diminta.",
    );
  }

  const modules: SidakSimulationModule[] =
    params.module === "all"
      ? [...(params.allowedModules ?? ["ketik", "pdkt", "telefun"])]
      : [params.module];
  const rowGroups = await Promise.all(
    modules.map(async (module) => ({
      module,
      rows: await readModuleRows(params.agentId, module, cursor),
    })),
  );
  const flatRows = rowGroups.flatMap(({ module, rows }) =>
    rows.map((row) => ({ module, row })),
  );
  const profiles = await readActors(flatRows);
  const items = flatRows
    .map(({ row, module }) => toSummary(row, module, params.agentId, profiles))
    .filter((item): item is SidakSimulationSummary => item !== null)
    .sort(compareSidakSimulationItems);
  const pageItems = items.slice(0, SIDAK_SIMULATION_PAGE_SIZE);
  const last = pageItems.at(-1);

  return {
    items: pageItems,
    nextCursor:
      last && items.length > pageItems.length
        ? encodeSidakSimulationCursor({
            occurredAt: last.occurredAt,
            module: last.module,
            historyId: last.id,
          })
        : null,
  };
}

async function assertSimulationSessionBelongsToAgent(params: {
  agentId: string;
  module: SidakSimulationModule;
  historyId: string;
}): Promise<void> {
  await ensureAgentExists(params.agentId);
  const config = SOURCE_CONFIG[params.module];
  const { data, error } = await createAdminClient()
    .from(config.table)
    .select("id")
    .eq("id", params.historyId)
    .eq("simulation_subject_type", "participant")
    .eq("simulation_subject_peserta_id", params.agentId)
    .maybeSingle();

  if (error) throw new SidakSimulationDataError(config.table);
  if (!data) {
    throw new SidakSimulationNotFoundError("Sesi simulasi tidak ditemukan.");
  }
}

export async function getSidakAgentSimulationDetail(params: {
  agentId: string;
  module: SidakSimulationModule;
  historyId: string;
  canPlayTelefunRecording: boolean;
}) {
  await assertSimulationSessionBelongsToAgent(params);
  return getMonitoringReviewDetail({
    module: params.module,
    historyId: params.historyId,
    canSignTelefunRecording: params.canPlayTelefunRecording,
    allowLegacyTelefun: false,
  });
}
