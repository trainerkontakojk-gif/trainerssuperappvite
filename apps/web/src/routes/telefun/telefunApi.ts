import { getApi, putApi, deleteApi } from "../../hooks/useApi";
import type { TelefunAppSettings } from "./telefunSettings";
import type { CallRecord } from "./types";
import { validateAssessment } from "../../lib/voiceAssessmentUtils";
import type { SessionMetrics } from "@trainers/types";
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
  session_metrics?: SessionMetrics | null;
  realistic_mode_enabled?: boolean;
  voice_dashboard_metrics?: CallRecord["voiceDashboardMetrics"];
  persona_config?: CallRecord["personaConfig"];
  disruption_config?: CallRecord["disruptionConfig"];
  disruption_results?: CallRecord["disruptionResults"];
  response_pacing_mode?: string | null;
  telefun_model_id?: string | null;
  telefun_transport?: string | null;
  messages?: unknown;
}

export async function getTelefunSettings(): Promise<any> {
  return getApi<any>("/telefun/settings");
}

export async function saveTelefunSettings(
  settings: TelefunAppSettings,
): Promise<void> {
  await putApi("/telefun/settings", settings);
}

export async function getTelefunSessions(): Promise<TelefunSessionRow[]> {
  return getApi<TelefunSessionRow[]>("/telefun/sessions");
}

export async function deleteTelefunSession(id: string): Promise<void> {
  await deleteApi(`/telefun/history/${id}`);
}

export async function clearTelefunHistory(): Promise<void> {
  await deleteApi("/telefun/history");
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
    score: row.score ?? dashboardScore ?? 0,
    feedback: row.feedback ?? undefined,
    voiceAssessment,
    sessionMetrics: row.session_metrics ?? null,
    realisticModeEnabled: row.realistic_mode_enabled,
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
