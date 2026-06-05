import { getApi, putApi, deleteApi } from "../../hooks/useApi";
import type { TelefunAppSettings } from "./telefunSettings";
import type { CallRecord } from "./types";
import { validateAssessment } from "../../lib/voiceAssessmentUtils";
import type { TelefunHistory } from "@trainers/types";

export interface TelefunSessionRow
  extends Omit<TelefunHistory, "voice_assessment"> {
  voice_assessment: unknown;
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
  return {
    id: row.id,
    date: row.created_at,
    url: row.recording_path || "",
    consumerName: row.consumer_name || "",
    consumerPhone: row.consumer_phone,
    consumerCity: row.consumer_city,
    scenarioTitle: row.scenario_title || "",
    duration: row.duration_seconds || 0,
    configuredDuration: row.configured_duration || 0,
    recordingPath: row.recording_path,
    agentRecordingPath: row.agent_recording_path,
    score: row.score ?? 0,
    feedback: row.feedback || undefined,
    voiceAssessment,
    sessionMetrics: row.session_metrics || null,
    realisticModeEnabled: row.realistic_mode_enabled,
    voiceDashboardMetrics: row.voice_dashboard_metrics,
    personaConfig: row.persona_config,
    disruptionConfig: row.disruption_config,
    disruptionResults: row.disruption_results,
    responsePacingMode: row.response_pacing_mode || undefined,
    telefunModelId: row.telefun_model_id || undefined,
    telefunTransport: row.telefun_transport || undefined,
  };
}
