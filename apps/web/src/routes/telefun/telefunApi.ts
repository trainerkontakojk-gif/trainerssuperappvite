import { telefunClient, unwrapResponse } from "../../lib/api";
import type { TelefunAppSettings } from "./telefunSettings";
import type { CallRecord } from "./types";
import { validateAssessment } from "../../lib/voiceAssessmentUtils";
import type {
  SessionMetrics,
  TelefunScoringStatus,
} from "@trainers/types";
import { parseTelefunTranscript } from "@trainers/types";

export interface TelefunSessionRow {
  id: string;
  created_at?: string | null;
  date?: string | null;
  recording_url?: string | null;
  consumer_name?: string | null;
  consumer_phone?: string | null;
  consumer_city?: string | null;
  scenario_title?: string | null;
  duration?: number | null;
  duration_seconds?: number | null;
  configured_duration?: number | null;
  recording_path?: string | null;
  agent_recording_path?: string | null;
  score?: number | null;
  feedback?: string | null;
  voice_assessment?: unknown;
  /** Additive scoring view (contract §1.2). `null` score stays undefined in the UI. */
  scoring_status?: TelefunScoringStatus | null;
  scoring_ready_at?: string | null;
  scoring_next_attempt_at?: string | null;
  scoring_retryable?: boolean;
  session_metrics?: SessionMetrics | null;
  realistic_mode_enabled?: boolean;
  voice_dashboard_metrics?: CallRecord["voiceDashboardMetrics"];
  persona_config?: CallRecord["personaConfig"];
  disruption_config?: CallRecord["disruptionConfig"];
  disruption_results?: CallRecord["disruptionResults"];
  response_pacing_mode?: string | null;
  telefun_model_id?: string | null;
  telefun_transport?: string | null;
  live_prompt_instructions?: string | null;
  messages?: unknown;
}

export interface CreateTelefunSessionInput {
  scenario_title: string;
  consumer_name: string;
  consumer_gender?: string;
  consumer_phone?: string;
  consumer_city?: string;
  realistic_mode_enabled?: boolean;
  persona_config?: { consumerType?: string };
  disruption_config?: string[];
  configured_duration?: number;
  response_pacing_mode?: string;
  telefun_model_id?: string;
  telefun_transport?: string;
  live_prompt_instructions?: string | null;
}

export async function getTelefunSettings(): Promise<Record<
  string,
  unknown
> | null> {
  return (await unwrapResponse(await telefunClient.settings.$get())) as Record<
    string,
    unknown
  > | null;
}

export async function saveTelefunSettings(
  settings: TelefunAppSettings,
): Promise<void> {
  await unwrapResponse(await telefunClient.settings.$put({ json: settings }));
}

export async function getTelefunSessions(): Promise<TelefunSessionRow[]> {
  return (await unwrapResponse(
    await telefunClient.sessions.$get(),
  )) as TelefunSessionRow[];
}

/**
 * Typed detail fetch for a single session (contract §2.1).
 * The Hono client path already exists and is used by delete; this adds the
 * missing typed read with abort support for the session reconciler.
 */
export async function getTelefunSession(
  id: string,
  options?: { signal?: AbortSignal },
): Promise<TelefunSessionRow> {
  return (await unwrapResponse(
    await telefunClient.history[":id"].$get({
      param: { id },
      ...(options?.signal ? { signal: options.signal } : {}),
    }),
  )) as TelefunSessionRow;
}

export async function createTelefunSession(
  input: CreateTelefunSessionInput,
): Promise<TelefunSessionRow> {
  return (await unwrapResponse(
    await telefunClient.sessions.$post({ json: input }),
  )) as TelefunSessionRow;
}

export async function deleteTelefunSession(id: string): Promise<void> {
  await unwrapResponse(
    await telefunClient.history[":id"].$delete({ param: { id } }),
  );
}

export async function clearTelefunHistory(): Promise<void> {
  await unwrapResponse(await telefunClient.history.$delete());
}

export function mapTelefunSessionRow(row: TelefunSessionRow): CallRecord {
  const voiceAssessment = validateAssessment(row.voice_assessment);
  const dashboardScore =
    row.voice_dashboard_metrics &&
    typeof row.voice_dashboard_metrics.score === "number"
      ? row.voice_dashboard_metrics.score
      : undefined;

  const transcript = parseTelefunTranscript(row.messages);

  return {
    id: row.id,
    date: row.created_at ?? row.date ?? "",
    url: row.recording_url ?? "",
    consumerName: row.consumer_name || "",
    consumerPhone: row.consumer_phone ?? undefined,
    consumerCity: row.consumer_city ?? undefined,
    scenarioTitle: row.scenario_title || "",
    duration: row.duration ?? row.duration_seconds ?? 0,
    configuredDuration: row.configured_duration ?? 0,
    recordingPath: row.recording_path ?? undefined,
    agentRecordingPath: row.agent_recording_path ?? undefined,
    // A missing score must stay undefined ("—") — never force it to 0.
    score: row.score ?? dashboardScore ?? undefined,
    feedback: row.feedback ?? undefined,
    voiceAssessment,
    scoringStatus: row.scoring_status ?? undefined,
    scoringReadyAt: row.scoring_ready_at ?? null,
    scoringNextAttemptAt: row.scoring_next_attempt_at ?? null,
    scoringRetryable: row.scoring_retryable ?? false,
    sessionMetrics: row.session_metrics ?? null,
    legacyRealisticModeEnabled: row.realistic_mode_enabled,
    voiceDashboardMetrics: row.voice_dashboard_metrics,
    personaConfig: row.persona_config,
    disruptionConfig: row.disruption_config,
    disruptionResults: row.disruption_results,
    responsePacingMode: row.response_pacing_mode ?? undefined,
    telefunModelId: row.telefun_model_id ?? undefined,
    telefunTransport: row.telefun_transport ?? undefined,
    transcript,
  };
}

export interface TelefunSessionUpsertInput {
  record: CallRecord;
  history: CallRecord[];
  reviewRecord: CallRecord | null;
  canOverwriteLocalHistory: boolean;
}

export interface TelefunSessionUpsertResult {
  history: CallRecord[];
  reviewRecord: CallRecord | null;
  /** Serialized history to persist, present only when a write is allowed. */
  localHistory?: string;
}

/**
 * Authoritative upsert keyed by session ID. Updates the history list, the
 * open Review record (when it belongs to the same session), and the valid
 * local storage copy together, so score, feedback, voiceAssessment, and
 * scoringStatus always change as one unit.
 */
export function upsertTelefunSessionRecord(
  input: TelefunSessionUpsertInput,
): TelefunSessionUpsertResult {
  const { record, history, reviewRecord, canOverwriteLocalHistory } = input;
  const merged = [
    record,
    ...history.filter((existing) => existing.id !== record.id),
  ].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return {
    history: merged,
    reviewRecord: reviewRecord?.id === record.id ? record : reviewRecord,
    ...(canOverwriteLocalHistory
      ? { localHistory: JSON.stringify(merged) }
      : {}),
  };
}
