/**
 * POST /score/:id — owner-checked voice-quality scoring for one Telefun
 * session: returns a cached assessment when one exists, claims the scoring
 * job, runs the analysis, and records success or failure.
 */

import type { Context } from "hono";
import { createAdminClient } from "../../lib/supabase";
import {
  analyzeVoiceQuality,
  generateCoachingSummary,
} from "../../lib/telefun-analysis";
import {
  isRetiredTelefunOpenAiRealtimeSelection,
  parseVoiceQualityAssessment,
} from "@trainers/types";
import type {
  TelefunHistoryScoringView,
  TelefunScoringStatus,
  VoiceQualityAssessment,
} from "@trainers/types";
import {
  completeScoringAssessment,
  failScoringJob,
  isWebRtcScoringReady,
  newScoringClaim,
  permanentlyFailRetiredOpenAiScoring,
  TELEFUN_SCORING_CLAIM_OWNER_API_ROUTE,
  TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS,
} from "../../services/telefun-scoring-service";
import {
  buildTelefunFeedbackSummary,
  buildTelefunHistoryScoringView,
} from "../../lib/telefun-feedback";
import { TELEFUN_OPENAI_SCORING_DISABLED_REASON } from "../../lib/telefun-openai-assessment";
import type { TelefunRecordingVariables } from "./recordings";

const SCORING_STATE_SELECT =
  "telefun_transport, status, recording_status, recording_error, scoring_ready_at, agent_recording_path, scoring_status, scoring_attempt_count, scoring_next_attempt_at, score, voice_assessment";

function cachedScoringResponse(session: {
  score?: number | null;
  voice_assessment?: unknown;
  scoring_status?: TelefunScoringStatus | null;
  scoring_ready_at?: string | null;
  scoring_next_attempt_at?: string | null;
  scoring_attempt_count?: number | null;
}): {
  success: true;
  data: TelefunHistoryScoringView & { assessment?: unknown };
  cached: true;
} {
  const assessment = session.voice_assessment
    ? (session.voice_assessment as VoiceQualityAssessment)
    : undefined;
  const view = buildTelefunHistoryScoringView(session);
  return {
    success: true as const,
    data: {
      ...view,
      feedback: assessment ? buildTelefunFeedbackSummary(assessment) : null,
      assessment,
    },
    cached: true as const,
  };
}

function isCanonicalCachedAssessment(session: {
  scoring_status?: TelefunScoringStatus | null;
  voice_assessment?: unknown;
}): boolean {
  return (
    session.scoring_status === "completed" &&
    parseVoiceQualityAssessment(session.voice_assessment) !== null
  );
}

function isTerminalHistoricalSession(status: unknown): boolean {
  return status === "completed" || status === "failed";
}

function isHistoricalOpenAiScoringModel(session: {
  telefun_model_id?: unknown;
  telefun_transport?: unknown;
}): boolean {
  return isRetiredTelefunOpenAiRealtimeSelection({
    modelId: session.telefun_model_id,
    transport: session.telefun_transport,
  });
}

function retiredOpenAiScoringResponse(c: {
  json: (body: unknown, status: 410) => Response;
}) {
  return c.json(
    {
      success: false,
      error: {
        code: "TELEFUN_OPENAI_SCORING_DISABLED",
        message: TELEFUN_OPENAI_SCORING_DISABLED_REASON,
      },
    },
    410,
  );
}

export async function scoreRecording(
  c: Context<{ Variables: TelefunRecordingVariables }, "/score/:id">,
) {
  const id = c.req.param("id");
  const user = c.get("user");
  const adminClient = createAdminClient();
  let activeClaimTokenHash: string | null = null;

  try {
    // === Ownership Check ===
    const { data: sessionOwner, error: ownerError } = await adminClient
      .from("telefun_history")
      .select(
        "user_id, status, telefun_model_id, telefun_transport, recording_status, recording_error, scoring_ready_at, agent_recording_path, scoring_status, score, voice_assessment",
      )
      .eq("id", id)
      .maybeSingle();

    if (ownerError) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: "Sesi belum dapat diperiksa.",
          },
        },
        503,
      );
    }
    if (!sessionOwner) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Session tidak ditemukan." },
        },
        404,
      );
    }

    if (sessionOwner.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses ke session ini.",
          },
        },
        403,
      );
    }

    const isRetiredOpenAiSession = isHistoricalOpenAiScoringModel(sessionOwner);
    if (isRetiredOpenAiSession) {
      // A valid cache is immutable historical evidence and is returned before
      // the retired WebRTC artifact gate can classify it as not-ready.
      if (isCanonicalCachedAssessment(sessionOwner)) {
        return c.json(cachedScoringResponse(sessionOwner));
      }
      if (
        sessionOwner.telefun_transport === "openai-webrtc" &&
        (sessionOwner.status === "active" || sessionOwner.status === "pending")
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_NOT_READY",
              message: "Rekaman agen belum siap untuk scoring.",
            },
          },
          409,
        );
      }
      if (!isTerminalHistoricalSession(sessionOwner.status)) {
        return retiredOpenAiScoringResponse(c);
      }

      const retiredClaim = newScoringClaim();
      activeClaimTokenHash = retiredClaim.claimTokenHash;
      const { data: retiredClaimed, error: retiredClaimError } =
        await adminClient.rpc("claim_telefun_scoring", {
          p_session_id: id,
          p_claim_timeout_seconds: TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS,
          p_claim_token_hash: retiredClaim.claimTokenHash,
          p_claim_owner: TELEFUN_SCORING_CLAIM_OWNER_API_ROUTE,
        });
      if (retiredClaimError) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_STATE_UNAVAILABLE",
              message: "Status scoring belum dapat disimpan.",
            },
          },
          503,
        );
      }
      const claimed = Array.isArray(retiredClaimed)
        ? retiredClaimed[0]
        : retiredClaimed;
      if (
        claimed !== true ||
        !(await permanentlyFailRetiredOpenAiScoring(
          id,
          retiredClaim.claimTokenHash,
        ))
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_STATE_UNAVAILABLE",
              message: "Status scoring belum dapat disimpan.",
            },
          },
          503,
        );
      }
      return retiredOpenAiScoringResponse(c);
    }

    if (
      sessionOwner.telefun_transport === "openai-webrtc" &&
      !isWebRtcScoringReady(sessionOwner, user.id, id)
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_NOT_READY",
            message: "Rekaman agen belum siap untuk scoring.",
          },
        },
        409,
      );
    }

    // === Atomic Claim ===
    // Attempt to claim this session for scoring.
    // claim_telefun_scoring returns true only if status was pending/failed/stale-processing
    // and was atomically transitioned to 'processing'. The token fences all
    // later writes so a superseded claim cannot overwrite the new owner.
    const manualClaim = newScoringClaim();
    activeClaimTokenHash = manualClaim.claimTokenHash;
    const { data: claimed, error: claimError } = await adminClient.rpc(
      "claim_telefun_scoring",
      {
        p_session_id: id,
        p_claim_timeout_seconds: TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS,
        p_claim_token_hash: manualClaim.claimTokenHash,
        p_claim_owner: TELEFUN_SCORING_CLAIM_OWNER_API_ROUTE,
      },
    );

    const normalizedClaimed = Array.isArray(claimed) ? claimed[0] : claimed;
    if (claimError) {
      console.error("[Telefun] Claim scoring RPC error");
      return c.json(
        {
          success: false,
          error: {
            code: "CLAIM_ERROR",
            message: "Gagal mengklaim sesi scoring.",
          },
        },
        500,
      );
    }

    if (normalizedClaimed !== true) {
      // Claim failed — another request is processing, the readiness latch won,
      // or a result is already cached. Read the full state before classifying it.
      let session: any = null;
      let stateError: unknown = null;
      try {
        const result = await adminClient
          .from("telefun_history")
          .select(SCORING_STATE_SELECT)
          .eq("id", id)
          .maybeSingle();
        session = result.data;
        stateError = result.error;
      } catch (_error: unknown) {
        stateError = new Error("Scoring state read-back unavailable");
      }

      if (stateError) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_STATE_UNAVAILABLE",
              message: "Status scoring belum dapat disimpan.",
            },
          },
          503,
        );
      }
      if (!session) {
        return c.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
          },
          404,
        );
      }

      if (session.scoring_status === "completed") {
        return c.json(cachedScoringResponse(session));
      }

      if (
        session.telefun_transport === "openai-webrtc" &&
        !isWebRtcScoringReady(session, user.id, id)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_NOT_READY",
              message: "Rekaman agen belum siap untuk scoring.",
            },
          },
          409,
        );
      }

      // Still processing or failed — return conflict with structured details.
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_IN_PROGRESS",
            message:
              session.scoring_status === "processing"
                ? "Scoring sedang diproses."
                : "Scoring sebelumnya gagal. Coba lagi.",
            details: { scoringStatus: session.scoring_status },
          },
        },
        409,
      );
    }

    // === Claim succeeded — proceed with analysis ===
    const result = await analyzeVoiceQuality(id, user.id);
    if (!result.success || !result.assessment) {
      // A failed WebRTC capture owns the terminal scoring latch. Re-read it
      // before writing a generic analysis failure so it cannot be overwritten.
      const { data: failedState, error: failedStateError } = await adminClient
        .from("telefun_history")
        .select(SCORING_STATE_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (failedStateError) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_STATE_UNAVAILABLE",
              message: "Status scoring belum dapat disimpan.",
            },
          },
          503,
        );
      }
      if (
        failedState?.telefun_transport === "openai-webrtc" &&
        !isWebRtcScoringReady(failedState, user.id, id)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_NOT_READY",
              message: "Rekaman agen belum siap untuk scoring.",
            },
          },
          409,
        );
      }

      // Mark scoring as failed through the same fenced service boundary used by
      // the worker.
      const failurePersisted = await failScoringJob(
        id,
        result.error || "Analysis failed",
        activeClaimTokenHash,
      );
      if (!failurePersisted) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_STATE_UNAVAILABLE",
              message: "Status scoring belum dapat disimpan.",
            },
          },
          503,
        );
      }

      return c.json(
        {
          success: false,
          error: {
            code: "ANALYSIS_ERROR",
            message: "Gagal melakukan analisis suara.",
          },
        },
        500,
      );
    }

    // Mark scoring as completed
    const assessment = result.assessment;
    let completionAccepted = false;
    let completionError: unknown = null;
    try {
      completionAccepted = await completeScoringAssessment(
        id,
        assessment,
        activeClaimTokenHash,
      );
    } catch (error: unknown) {
      completionError = error;
    }
    if (completionError) {
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_STATE_UNAVAILABLE",
            message: "Status scoring belum dapat disimpan.",
          },
        },
        503,
      );
    }

    if (!completionAccepted) {
      let current: any = null;
      let stateError: unknown = null;
      try {
        const result = await adminClient
          .from("telefun_history")
          .select(SCORING_STATE_SELECT)
          .eq("id", id)
          .maybeSingle();
        current = result.data;
        stateError = result.error;
      } catch (_error: unknown) {
        stateError = new Error("Scoring state read-back unavailable");
      }

      if (stateError || !current) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_STATE_UNAVAILABLE",
              message: "Status scoring belum dapat disimpan.",
            },
          },
          503,
        );
      }

      if (current.scoring_status === "completed") {
        return c.json(cachedScoringResponse(current));
      }

      if (
        current.telefun_transport === "openai-webrtc" &&
        !isWebRtcScoringReady(current, user.id, id)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_NOT_READY",
              message: "Rekaman agen belum siap untuk scoring.",
            },
          },
          409,
        );
      }

      if (current.scoring_status === "processing") {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_IN_PROGRESS",
              message: "Scoring sedang diproses.",
              details: { scoringStatus: current.scoring_status },
            },
          },
          409,
        );
      }

      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_STATE_UNAVAILABLE",
            message: "Status scoring belum dapat disimpan.",
          },
        },
        503,
      );
    }

    // Also trigger coaching summary generation in background/sequentially
    await generateCoachingSummary(id, user.id);

    return c.json({
      success: true,
      data: {
        score: assessment.overallScore,
        feedback: buildTelefunFeedbackSummary(assessment),
        assessment,
      },
    });
  } catch (error: unknown) {
    const diagnostic =
      error instanceof Error ? error.message : "Internal server error.";

    // Preserve the failed-capture latch if an exception races the scoring
    // analysis; a generic failure RPC must not overwrite it.
    try {
      const { data: current, error: stateError } = await adminClient
        .from("telefun_history")
        .select(SCORING_STATE_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (
        !stateError &&
        current?.telefun_transport === "openai-webrtc" &&
        !isWebRtcScoringReady(current, user.id, id)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_NOT_READY",
              message: "Rekaman agen belum siap untuk scoring.",
            },
          },
          409,
        );
      }
    } catch (_stateError: unknown) {
      // Fall through to the existing bounded failure persistence path.
    }

    // Attempt to mark as failed in catch block; the public response remains bounded.
    try {
      const failurePersisted = await failScoringJob(
        id,
        diagnostic,
        activeClaimTokenHash,
      );
      if (!failurePersisted) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_STATE_UNAVAILABLE",
              message: "Status scoring belum dapat disimpan.",
            },
          },
          503,
        );
      }
    } catch (_) {
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_STATE_UNAVAILABLE",
            message: "Status scoring belum dapat disimpan.",
          },
        },
        503,
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Scoring gagal diproses.",
        },
      },
      500,
    );
  }
}
