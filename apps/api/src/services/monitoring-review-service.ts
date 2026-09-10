import {
  mapSimulationSubjectRowToSnapshot,
  parseTelefunTranscript,
} from "@trainers/types";
import type {
  KetikMonitoringReview,
  PdktMonitoringReview,
  TelefunMonitoringReview,
} from "@trainers/types";
import { createAdminClient } from "../lib/supabase";
import { isTelefunRecordingPathOwnedBySession } from "../routes/telefun/recording-paths";
import { buildKetikEducation } from "./ketik/review-policy";
import {
  normalizeKetikMessages,
  normalizePdktConfig,
  normalizePdktEmails,
  normalizePdktEvaluation,
  normalizePdktMetadata,
  normalizeReviewStatus,
  normalizeTelefunAssessmentWithHold,
  normalizeTelefunCoachingRecommendations,
} from "./monitoring-history-service";

export type MonitoringReviewDetail =
  | KetikMonitoringReview
  | PdktMonitoringReview
  | TelefunMonitoringReview;

export class MonitoringReviewNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitoringReviewNotFoundError";
  }
}

export class MonitoringReviewDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitoringReviewDataError";
  }
}

const TELEFUN_RECORDING_SIGNED_URL_TTL_SECONDS = 3600;

function normalizePersonaConfig(
  value: unknown,
): { consumerType: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const consumerType = (value as Record<string, unknown>).consumerType;
  return typeof consumerType === "string" ? { consumerType } : null;
}

function isOwnedTelefunRecordingPath(
  path: unknown,
  userId: unknown,
  sessionId: string,
  type: "full_call" | "agent_only",
): path is string {
  return (
    typeof userId === "string" &&
    typeof path === "string" &&
    isTelefunRecordingPathOwnedBySession({ path, userId, sessionId, type })
  );
}

async function readActorProjection(
  admin: ReturnType<typeof createAdminClient>,
  userId: unknown,
): Promise<{ email: string | null; role: string | null }> {
  if (typeof userId !== "string") return { email: null, role: null };
  const { data, error } = await admin
    .from("profiles")
    .select("email, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new MonitoringReviewDataError("Gagal membaca pelaksana sesi.");
  return {
    email: typeof data?.email === "string" ? data.email : null,
    role: typeof data?.role === "string" ? data.role : null,
  };
}

async function createTelefunRecordingUrl(
  admin: ReturnType<typeof createAdminClient>,
  path: string | null | undefined,
): Promise<string | null> {
  if (typeof path !== "string") return null;

  const { data, error } = await admin.storage
    .from("telefun-recordings")
    .createSignedUrl(path, TELEFUN_RECORDING_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.warn("[monitoring] Failed to sign Telefun recording URL:", error);
    return null;
  }

  return data.signedUrl;
}

export async function getMonitoringReviewDetail(params: {
  module: "ketik" | "pdkt" | "telefun";
  historyId: string;
  canSignTelefunRecording: boolean;
  allowLegacyTelefun?: boolean;
}): Promise<MonitoringReviewDetail> {
  const admin = createAdminClient();

  if (params.module === "ketik") {
    const { data: history, error: historyError } = await admin
      .from("ketik_history")
      .select(
        "review_status, final_score, empathy_score, probing_score, resolution_score, typo_score, compliance_score, consumer_name, consumer_phone, consumer_city, simulation_duration, messages, user_id, simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name, simulation_subject_batch_name, simulation_subject_team",
      )
      .eq("id", params.historyId)
      .single();

    if (historyError || !history) {
      const notFound =
        !history || (historyError as { code?: string } | null)?.code === "PGRST116";
      throw notFound
        ? new MonitoringReviewNotFoundError("Sesi KETIK tidak ditemukan.")
        : new MonitoringReviewDataError("Gagal membaca sesi KETIK.");
    }

    const ketikActor = await readActorProjection(admin, history.user_id);
    const ketikSubject = mapSimulationSubjectRowToSnapshot(history);

    if (history.review_status !== "completed") {
      return {
        module: "ketik",
        user_id: history.user_id ?? null,
        user_email: ketikActor.email,
        user_role: ketikActor.role,
        simulationSubject: ketikSubject,
        review_status: history.review_status || "not_started",
        scores: {
          final: history.final_score,
          empathy: history.empathy_score,
          probing: history.probing_score,
          resolution: history.resolution_score,
          typo: history.typo_score,
          compliance: history.compliance_score,
        },
        session: {
          consumerName: history.consumer_name ?? null,
          consumerPhone: history.consumer_phone ?? null,
          consumerCity: history.consumer_city ?? null,
          simulationDuration: history.simulation_duration ?? null,
          messages: normalizeKetikMessages(history.messages),
        },
        review: null,
        typos: [],
      };
    }

    const [reviewResult, typosResult] = await Promise.all([
      admin
        .from("ketik_session_reviews")
        .select("*")
        .eq("session_id", params.historyId)
        .maybeSingle(),
      admin.from("ketik_typo_findings").select("*").eq("session_id", params.historyId),
    ]);

    if (reviewResult.error || typosResult.error) {
      throw new MonitoringReviewDataError("Gagal membaca hasil review KETIK.");
    }

    return {
      module: "ketik",
      user_id: history.user_id ?? null,
      user_email: ketikActor.email,
      user_role: ketikActor.role,
      simulationSubject: ketikSubject,
      review_status: "completed",
      scores: {
        final: history.final_score,
        empathy: history.empathy_score,
        probing: history.probing_score,
        resolution: history.resolution_score,
        typo: history.typo_score,
        compliance: history.compliance_score,
      },
      review: reviewResult.data
        ? {
            id: reviewResult.data.id,
            sessionId: reviewResult.data.session_id,
            aiSummary: reviewResult.data.ai_summary,
            strengths: reviewResult.data.strengths,
            weaknesses: reviewResult.data.weaknesses,
            coachingFocus: reviewResult.data.coaching_focus,
            education:
              reviewResult.data.education ??
              buildKetikEducation(undefined, {
                final: history.final_score ?? 0,
                empathy: history.empathy_score ?? 0,
                probing: history.probing_score ?? 0,
                resolution: history.resolution_score ?? 0,
                typo: history.typo_score ?? 0,
                compliance: history.compliance_score ?? 0,
              }),
            createdAt: reviewResult.data.created_at,
          }
        : null,
      session: {
        consumerName: history.consumer_name ?? null,
        consumerPhone: history.consumer_phone ?? null,
        consumerCity: history.consumer_city ?? null,
        simulationDuration: history.simulation_duration ?? null,
        messages: normalizeKetikMessages(history.messages),
      },
      typos: (typosResult.data || []).map((typo: any) => ({
        id: typo.id,
        sessionId: typo.session_id,
        messageId: typo.message_id,
        originalWord: typo.original_word,
        correctedWord: typo.corrected_word,
        severity: typo.severity,
      })),
    };
  }

  if (params.module === "pdkt") {
    const { data: history, error: historyError } = await admin
      .from("pdkt_history")
      .select(
        "evaluation, evaluation_status, evaluation_error, time_taken, emails, config, timestamp, created_at, user_id, simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name, simulation_subject_batch_name, simulation_subject_team",
      )
      .eq("id", params.historyId)
      .single();

    if (historyError || !history) {
      const notFound =
        !history || (historyError as { code?: string } | null)?.code === "PGRST116";
      throw notFound
        ? new MonitoringReviewNotFoundError("Sesi PDKT tidak ditemukan.")
        : new MonitoringReviewDataError("Gagal membaca sesi PDKT.");
    }

    const config = normalizePdktConfig(history.config);
    const emails = normalizePdktEmails(history.emails);
    const metadata = normalizePdktMetadata(history.config, emails);
    const actor = await readActorProjection(admin, history.user_id);

    return {
      module: "pdkt",
      user_id: history.user_id ?? null,
      user_email: actor.email,
      user_role: actor.role,
      simulationSubject: mapSimulationSubjectRowToSnapshot(history),
      review_status: normalizeReviewStatus(history.evaluation_status),
      session: {
        config,
        emails,
        created_at: history.created_at ?? history.timestamp ?? null,
        consumer_name: metadata.consumer_name ?? null,
        consumer_type: metadata.consumer_type ?? null,
        recipient: metadata.recipient ?? null,
        contact: metadata.contact ?? null,
      },
      evaluation: normalizePdktEvaluation(history.evaluation),
      evaluation_error: history.evaluation_error || null,
      time_taken: history.time_taken ?? null,
      emails,
    };
  }

  const { data: history, error: historyError } = await admin
    .from("telefun_history")
    .select(
      "id, user_id, score, status, scoring_status, recording_path, agent_recording_path, scenario_title, duration_seconds, voice_assessment, session_metrics, ai_summary, strengths, weaknesses, coaching_focus, messages, consumer_name, consumer_phone, consumer_city, consumer_gender, persona_config, simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name, simulation_subject_batch_name, simulation_subject_team",
    )
    .eq("id", params.historyId)
    .single();

  let legacy = false;
  let telefunHistory = history;
  if (historyError && historyError.code !== "PGRST116") {
    throw new MonitoringReviewDataError("Gagal membaca sesi Telefun.");
  }

  if (!telefunHistory && params.allowLegacyTelefun !== false) {
    const { data: legacyRow, error: legacyError } = await admin
      .from("results")
      .select("id, module, score, details, history, created_at")
      .eq("id", params.historyId)
      .eq("module", "telefun")
      .maybeSingle();
    if (legacyError) {
      throw new MonitoringReviewDataError("Gagal membaca riwayat Telefun.");
    }
    if (!legacyRow) {
      throw new MonitoringReviewNotFoundError("Sesi Telefun tidak ditemukan.");
    }
    const details =
      legacyRow.details && typeof legacyRow.details === "object"
        ? legacyRow.details
        : {};
    telefunHistory = {
      id: params.historyId,
      user_id: null,
      score: typeof legacyRow.score === "number" ? legacyRow.score : null,
      status: null,
      scoring_status: null,
      recording_path: null,
      agent_recording_path: null,
      session_metrics: null,
      scenario_title:
        typeof details.scenario_title === "string"
          ? details.scenario_title
          : typeof details.scenario === "string"
            ? details.scenario
            : "Simulasi Telepon",
      duration_seconds:
        typeof details.duration === "number" && Number.isFinite(details.duration)
          ? details.duration
          : null,
      voice_assessment: null,
      ai_summary: null,
      strengths: null,
      weaknesses: null,
      coaching_focus: null,
      messages: Array.isArray(legacyRow.history) ? legacyRow.history : [],
      consumer_name: null,
      consumer_phone: null,
      consumer_city: null,
      consumer_gender: null,
      persona_config: null,
      simulation_subject_type: null,
      simulation_subject_peserta_id: null,
      simulation_subject_name: null,
      simulation_subject_batch_name: null,
      simulation_subject_team: null,
    };
    legacy = true;
  }

  if (!telefunHistory) {
    throw new MonitoringReviewNotFoundError("Sesi Telefun tidak ditemukan.");
  }

  const telefunActor = await readActorProjection(admin, telefunHistory.user_id);
  const telefunSubject = mapSimulationSubjectRowToSnapshot(telefunHistory);
  const voiceAssessment = legacy
    ? null
    : normalizeTelefunAssessmentWithHold(
        telefunHistory.voice_assessment,
        telefunHistory.session_metrics,
      );
  const normalizedScore =
    voiceAssessment &&
    typeof voiceAssessment === "object" &&
    typeof voiceAssessment.overallScore === "number"
      ? voiceAssessment.overallScore
      : telefunHistory.score;

  const transcript = parseTelefunTranscript(telefunHistory.messages);
  const { data: coachingSummary, error: coachingError } = await admin
    .from("telefun_coaching_summary")
    .select("recommendations, generated_at")
    .eq("session_id", params.historyId)
    .maybeSingle();
  if (coachingError) {
    throw new MonitoringReviewDataError("Gagal membaca coaching Telefun.");
  }

  const ownedFullPath = isOwnedTelefunRecordingPath(
    telefunHistory.recording_path,
    telefunHistory.user_id,
    params.historyId,
    "full_call",
  )
    ? telefunHistory.recording_path
    : null;
  const ownedAgentPath = isOwnedTelefunRecordingPath(
    telefunHistory.agent_recording_path,
    telefunHistory.user_id,
    params.historyId,
    "agent_only",
  )
    ? telefunHistory.agent_recording_path
    : null;
  const recordingUrl = params.canSignTelefunRecording
    ? await createTelefunRecordingUrl(admin, ownedFullPath || ownedAgentPath)
    : null;

  return {
    module: "telefun",
    user_id: telefunHistory.user_id ?? null,
    user_email: telefunActor.email,
    user_role: telefunActor.role,
    simulationSubject: telefunSubject,
    review_status:
      typeof telefunHistory.scoring_status === "string"
        ? normalizeReviewStatus(telefunHistory.scoring_status)
        : telefunHistory.status === "pending"
          ? "pending"
          : telefunHistory.status === "active"
            ? "processing"
            : telefunHistory.status === "failed"
              ? "failed"
              : typeof normalizedScore === "number"
                ? "completed"
                : "not_started",
    score: normalizedScore,
    recording_path: ownedFullPath,
    agent_recording_path: ownedAgentPath,
    recording_url: recordingUrl,
    scenario_title: telefunHistory.scenario_title,
    duration_seconds: telefunHistory.duration_seconds,
    voice_assessment: voiceAssessment || null,
    transcript,
    ai_summary: telefunHistory.ai_summary || null,
    strengths: telefunHistory.strengths || null,
    weaknesses: telefunHistory.weaknesses || null,
    coaching_focus: telefunHistory.coaching_focus || null,
    coaching_recommendations: normalizeTelefunCoachingRecommendations(
      coachingSummary?.recommendations,
    ),
    coaching_generated_at: coachingSummary?.generated_at ?? null,
    consumer_name: telefunHistory.consumer_name ?? null,
    consumer_phone: telefunHistory.consumer_phone ?? null,
    consumer_city: telefunHistory.consumer_city ?? null,
    consumer_gender: telefunHistory.consumer_gender ?? null,
    persona_config: normalizePersonaConfig(telefunHistory.persona_config),
    telefun_legacy: legacy,
  };
}
