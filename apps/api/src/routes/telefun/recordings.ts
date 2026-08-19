import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import {
  analyzeVoiceQuality,
  generateCoachingSummary,
} from "../../lib/telefun-analysis";
import type {
  TelefunRecordingReadiness,
  TelefunRecordingStatus,
  TelefunScoringStatus,
  VoiceQualityAssessment,
} from "@trainers/types";
import {
  enqueueScoring,
  isWebRtcScoringReady,
} from "../../services/telefun-scoring-service";
import { isTelefunRecordingPathOwnedBySession } from "./recording-paths";
import {
  buildTelefunFeedbackSummary,
  buildTelefunHistoryScoringView,
} from "../../lib/telefun-feedback";
import type { TelefunHistoryScoringView } from "@trainers/types";

export { buildTelefunFeedbackSummary } from "../../lib/telefun-feedback";

type Variables = { user: User; profile: any };

const telefunRecordings = new Hono<{ Variables: Variables }>();

export { isTelefunRecordingPathOwnedBySession };

interface TelefunRecordingRpcRow {
  applied: boolean;
  recording_status: TelefunRecordingStatus;
  recording_ready: boolean;
  scoring_ready: boolean;
  scoring_ready_at?: string | null;
  scoring_status: TelefunScoringStatus;
  reason: string;
}

function firstRpcRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function normalizeRecordingRpcRow(
  row: TelefunRecordingRpcRow | null,
): (TelefunRecordingRpcRow & TelefunRecordingReadiness) | null {
  if (!row) return null;
  return {
    ...row,
    recordingStatus: row.recording_status,
    recordingReady: row.recording_ready,
    scoringReady: row.scoring_ready,
    scoringReadyAt: row.scoring_ready_at ?? null,
    scoringStatus: row.scoring_status,
  };
}

function recordingRpcFailureStatus(reason: string): 400 | 403 | 404 | 409 | 503 {
  if (reason === "session_not_found") return 404;
  if (reason === "not_owner") return 403;
  if (
    reason === "path_conflict" ||
    reason === "session_not_terminal" ||
    reason === "capture_failed" ||
    reason === "recording_failed"
  ) return 409;
  if (reason.startsWith("invalid_") || reason === "recording_required") return 400;
  return 503;
}

function safeRecordingError(code: string): string {
  switch (code) {
    case "INVALID_RECORDING_PATH":
      return "Path rekaman tidak valid.";
    case "RECORDING_CONFLICT":
      return "Path rekaman sudah dikunci oleh server.";
    case "SCORING_NOT_READY":
      return "Rekaman agen belum siap untuk scoring.";
    default:
      return "Status rekaman belum dapat disimpan. Coba lagi.";
  }
}

const SCORING_STATE_SELECT =
  "telefun_transport, status, recording_status, recording_error, scoring_ready_at, agent_recording_path, scoring_status, scoring_attempt_count, scoring_next_attempt_at, score, voice_assessment";

function readRpcBoolean(data: unknown): boolean | null {
  const value = Array.isArray(data) ? data[0] : data;
  return typeof value === "boolean" ? value : null;
}

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

telefunRecordings.post(
  "/finalize-recording",
  zValidator(
    "json",
    z.object({
      sessionId: z.string().uuid(),
      recordingPath: z.string().optional(),
      agentRecordingPath: z.string().optional(),
      captureStatus: z.enum(["ready", "failed"]).default("ready"),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const adminClient = createAdminClient();
    const { sessionId, recordingPath, agentRecordingPath, captureStatus } =
      c.req.valid("json");

    try {
      if (
        recordingPath &&
        !isTelefunRecordingPathOwnedBySession({
          path: recordingPath,
          userId: user.id,
          sessionId,
          type: "full_call",
        })
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_RECORDING_PATH",
              message: safeRecordingError("INVALID_RECORDING_PATH"),
            },
          },
          400,
        );
      }
      if (
        agentRecordingPath &&
        !isTelefunRecordingPathOwnedBySession({
          path: agentRecordingPath,
          userId: user.id,
          sessionId,
          type: "agent_only",
        })
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_RECORDING_PATH",
              message: safeRecordingError("INVALID_RECORDING_PATH"),
            },
          },
          400,
        );
      }
      if (captureStatus === "ready" && !recordingPath && !agentRecordingPath) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_RECORDING_PATH",
              message: "Setidaknya satu path rekaman diperlukan.",
            },
          },
          400,
        );
      }

      const { data: session, error: sessionError } = await adminClient
        .from("telefun_history")
        .select(
          "user_id, status, telefun_transport, recording_path, agent_recording_path, scoring_status, scoring_ready_at",
        )
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionError) {
        return c.json(
          {
            success: false,
            error: { code: "DATABASE_ERROR", message: "Sesi belum dapat diperiksa." },
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
      if (session.user_id !== user.id) {
        return c.json(
          {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Anda tidak memiliki akses." },
          },
          403,
        );
      }
      if (
        session.telefun_transport === "openai-webrtc" &&
        (session.status === "active" || session.status === "pending")
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SERVER_OWNED_LIFECYCLE",
              message: "Lifecycle WebRTC masih dikelola server.",
            },
          },
          409,
        );
      }

      const rpcResult = await adminClient.rpc("mark_telefun_recording_uploaded", {
        p_session_id: sessionId,
        p_user_id: user.id,
        p_recording_path: recordingPath ?? null,
        p_agent_recording_path: agentRecordingPath ?? null,
        p_capture_status: captureStatus,
      });
      if (rpcResult.error) {
        return c.json(
          {
            success: false,
            error: {
              code: "RECORDING_STATE_UNAVAILABLE",
              message: safeRecordingError("RECORDING_STATE_UNAVAILABLE"),
            },
          },
          503,
        );
      }

      const row = normalizeRecordingRpcRow(
        firstRpcRow(rpcResult.data as TelefunRecordingRpcRow | TelefunRecordingRpcRow[] | null),
      );
      if (!row) {
        return c.json(
          {
            success: false,
            error: {
              code: "RECORDING_STATE_UNAVAILABLE",
              message: safeRecordingError("RECORDING_STATE_UNAVAILABLE"),
            },
          },
          503,
        );
      }
      if (!row.applied) {
        const status = recordingRpcFailureStatus(row.reason);
        return c.json(
          {
            success: false,
            error: {
              code:
                status === 409
                  ? "RECORDING_CONFLICT"
                  : status === 400
                    ? "INVALID_RECORDING_PATH"
                    : "RECORDING_STATE_UNAVAILABLE",
              message:
                status === 409
                  ? safeRecordingError("RECORDING_CONFLICT")
                  : status === 400
                    ? safeRecordingError("INVALID_RECORDING_PATH")
                    : safeRecordingError("RECORDING_STATE_UNAVAILABLE"),
            },
          },
          status,
        );
      }

      // Legacy sessions retain the existing enqueue behavior. WebRTC scoring
      // is enqueued only by the seekable readiness RPC after remux.
      if (session.telefun_transport !== "openai-webrtc" && agentRecordingPath) {
        void enqueueScoring(sessionId).catch(() => undefined);
      }

      return c.json({
        success: true,
        data: {
          recordingStatus: row.recordingStatus,
          recordingReady: row.recordingReady,
          scoringReady: row.scoringReady,
          scoringStatus: row.scoringStatus,
        },
      });
    } catch (_error: unknown) {
      return c.json(
        {
          success: false,
          error: {
            code: "RECORDING_STATE_UNAVAILABLE",
            message: safeRecordingError("RECORDING_STATE_UNAVAILABLE"),
          },
        },
        503,
      );
    }
  },
);

telefunRecordings.get("/recording/:id", async (c) => {
  const sessionId = c.req.param("id");
  const type = c.req.query("type");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select("user_id, agent_recording_path, recording_path")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session)
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
        },
        404,
      );

    const canAccessCrossUserRecording = ["admin", "trainer"].includes(
      profile?.role,
    );
    if (!canAccessCrossUserRecording && session.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses.",
          },
        },
        403,
      );
    }

    let path = session.recording_path;
    if (type === "agent_only" && session.agent_recording_path) {
      path = session.agent_recording_path;
    } else if (type === "full_call" && session.recording_path) {
      path = session.recording_path;
    } else if (!path && session.agent_recording_path) {
      path = session.agent_recording_path;
    }

    if (!path)
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Rekaman tidak ditemukan." },
        },
        404,
      );

    const { data, error } = await adminClient.storage
      .from("telefun-recordings")
      .createSignedUrl(path, 3600);

    if (error) throw error;
    return c.json({
      success: true,
      data: { url: data.signedUrl },
      url: data.signedUrl,
    });
  } catch (_error: unknown) {
    return c.json(
      {
        success: false,
        error: {
          code: "STORAGE_ERROR",
          message: "Rekaman belum dapat diakses.",
        },
      },
      500,
    );
  }
});

telefunRecordings.post("/score/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const adminClient = createAdminClient();

  try {
    // === Ownership Check ===
    const { data: sessionOwner, error: ownerError } = await adminClient
      .from("telefun_history")
      .select(
        "user_id, status, telefun_transport, recording_status, recording_error, scoring_ready_at, agent_recording_path, scoring_status, score, voice_assessment",
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
        { success: false, error: { code: "NOT_FOUND", message: "Session tidak ditemukan." } },
        404,
      );
    }

    if (sessionOwner.user_id !== user.id) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Anda tidak memiliki akses ke session ini." } },
        403,
      );
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
    // and was atomically transitioned to 'processing'.
    const { data: claimed, error: claimError } = await adminClient.rpc(
      "claim_telefun_scoring",
      { p_session_id: id, p_claim_timeout_seconds: 120 },
    );

    const normalizedClaimed = Array.isArray(claimed)
      ? claimed[0]
      : claimed;
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
      const {
        data: failedState,
        error: failedStateError,
      } = await adminClient
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

      // Mark scoring as failed
      const failureRpc = await adminClient.rpc("fail_telefun_scoring", {
        p_session_id: id,
        p_error: result.error || "Analysis failed",
      });
      if (failureRpc.error || failureRpc.data === false) {
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
    let completionData: unknown = null;
    let completionError: unknown = null;
    try {
      const completionRpc = await adminClient.rpc("complete_telefun_scoring", {
        p_session_id: id,
        p_score: assessment.overallScore,
        p_voice_assessment: assessment as unknown as Record<string, unknown>,
      });
      completionData = completionRpc.data;
      completionError = completionRpc.error;
    } catch (_error: unknown) {
      completionError = new Error("Scoring completion unavailable");
    }
    const completionResult = readRpcBoolean(completionData);
    if (completionError || completionResult === null) {
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

    if (completionResult === false) {
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
      const failureRpc = await adminClient.rpc("fail_telefun_scoring", {
        p_session_id: id,
        p_error: diagnostic,
      });
      if (failureRpc.error || failureRpc.data === false) {
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
});

telefunRecordings.get("/coaching-summary/:id", async (c) => {
  const sessionId = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
        },
        404,
      );
    }

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses ke sesi ini.",
          },
        },
        403,
      );
    }

    const { data, error } = await adminClient
      .from("telefun_coaching_summary")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) throw error;
    return c.json({ success: true, data: data || null });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: error?.message || "Database error.",
        },
      },
      500,
    );
  }
});

export { telefunRecordings };
