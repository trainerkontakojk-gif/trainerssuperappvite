import {
  resolveAccountScope,
  isAccountInScope,
} from "../../services/access/scope";
import { getActor } from "../../middleware/role";
import { can } from "@trainers/types";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import type {
  TelefunRecordingReadiness,
  TelefunRecordingStatus,
  TelefunScoringStatus,
} from "@trainers/types";
import { enqueueScoring } from "../../services/telefun-scoring-service";
import { isTelefunRecordingPathOwnedBySession } from "./recording-paths";
import { scoreRecording } from "./recording-scoring";
import { aiRateLimitMiddleware } from "../../middleware/rateLimit";

export { buildTelefunFeedbackSummary } from "../../lib/telefun-feedback";

export type TelefunRecordingVariables = { user: User; profile: any };
type Variables = TelefunRecordingVariables;

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

function recordingRpcFailureStatus(
  reason: string,
): 400 | 403 | 404 | 409 | 503 {
  if (reason === "session_not_found") return 404;
  if (reason === "not_owner") return 403;
  if (
    reason === "path_conflict" ||
    reason === "session_not_terminal" ||
    reason === "capture_failed" ||
    reason === "recording_failed"
  )
    return 409;
  if (reason.startsWith("invalid_") || reason === "recording_required")
    return 400;
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
      if (
        captureStatus === "ready" &&
        (!recordingPath || !agentRecordingPath)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_RECORDING_PATH",
              message: "Kedua rekaman wajib tersedia sebelum scoring.",
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
            error: {
              code: "DATABASE_ERROR",
              message: "Sesi belum dapat diperiksa.",
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
      if (session.user_id !== user.id) {
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

      const rpcResult = await adminClient.rpc(
        "mark_telefun_recording_uploaded",
        {
          p_session_id: sessionId,
          p_user_id: user.id,
          p_recording_path: recordingPath ?? null,
          p_agent_recording_path: agentRecordingPath ?? null,
          p_capture_status: captureStatus,
        },
      );
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
        firstRpcRow(
          rpcResult.data as
            TelefunRecordingRpcRow | TelefunRecordingRpcRow[] | null,
        ),
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

      // Admit scoring only when this transition durably supplied both required
      // tracks. The RPC is still authoritative against stale/late callbacks.
      if (
        captureStatus === "ready" &&
        session.telefun_transport !== "openai-webrtc" &&
        recordingPath &&
        agentRecordingPath
      ) {
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

    const canAccessCrossUserRecording = can(
      profile?.role,
      "telefun.recording.read",
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

telefunRecordings.post("/score/:id", aiRateLimitMiddleware, scoreRecording);

telefunRecordings.get("/coaching-summary/:id", async (c) => {
  const sessionId = c.req.param("id");

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

    if (
      !isAccountInScope(
        resolveAccountScope(getActor(c), "telefun.manage"),
        session.user_id,
      )
    ) {
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
