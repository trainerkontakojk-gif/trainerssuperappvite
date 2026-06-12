import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import {
  analyzeVoiceQuality,
  generateCoachingSummary,
} from "../../lib/telefun-analysis";
import type { VoiceQualityAssessment } from "@trainers/types";
import { enqueueScoring } from "../../services/telefun-scoring-service";

type Variables = { user: User; profile: any };

const telefunRecordings = new Hono<{ Variables: Variables }>();

export function isTelefunRecordingPathOwnedBySession(params: {
  path: string;
  userId: string;
  sessionId: string;
  type: "full_call" | "agent_only";
}): boolean {
  const parts = params.path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === params.userId &&
    parts[1] === params.sessionId &&
    parts[2] === `${params.type}.webm`
  );
}

export function buildTelefunFeedbackSummary(
  assessment: VoiceQualityAssessment,
): string {
  const voiceParts = [
    assessment.speakingRate?.feedback,
    assessment.intonation?.feedback,
    assessment.articulation?.feedback,
    assessment.fillerWords?.feedback,
    assessment.emotionalTone?.feedback,
  ]
    .filter(Boolean)
    .slice(0, 3);
  const holdFeedback =
    assessment.holdManagement?.status &&
    assessment.holdManagement.status !== "not_used"
      ? assessment.holdManagement.feedback
      : null;
  return [...voiceParts, holdFeedback].filter(Boolean).join("\n\n");
}

telefunRecordings.post(
  "/finalize-recording",
  zValidator(
    "json",
    z.object({
      sessionId: z.string(),
      recordingPath: z.string().optional(),
      agentRecordingPath: z.string().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const adminClient = createAdminClient();
    const { sessionId, recordingPath, agentRecordingPath } =
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
            error: { message: "Invalid recording path ownership" },
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
            error: { message: "Invalid agent recording path ownership" },
          },
          400,
        );
      }

      const { error } = await adminClient
        .from("telefun_history")
        .update({
          recording_path: recordingPath,
          agent_recording_path: agentRecordingPath,
          status: "completed",
        })
        .eq("id", sessionId)
        .eq("user_id", user.id);

      if (error) throw error;

      // Auto-enqueue scoring worker (fire-and-forget)
      if (agentRecordingPath) {
        enqueueScoring(sessionId).catch((_err) => {
          // non-critical: worker will pick up pending sessions later
        });
      }

      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: { message: error.message } }, 500);
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

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Storage error.";
    return c.json(
      {
        success: false,
        error: {
          code: "STORAGE_ERROR",
          message,
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
    const { data: sessionOwner } = await adminClient
      .from("telefun_history")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

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

    // === Atomic Claim ===
    // Attempt to claim this session for scoring.
    // claim_telefun_scoring returns true only if status was pending/failed/stale-processing
    // and was atomically transitioned to 'processing'.
    const { data: claimed, error: claimError } = await adminClient.rpc(
      "claim_telefun_scoring",
      { p_session_id: id, p_claim_timeout_seconds: 120 },
    );

    if (claimError) {
      console.error("[Telefun] Claim scoring RPC error:", claimError);
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

    if (!claimed) {
      // Claim failed — another request is processing, or result is already cached.
      // Check current state to determine response.
      const { data: session } = await adminClient
        .from("telefun_history")
        .select("scoring_status, score, voice_assessment")
        .eq("id", id)
        .maybeSingle();

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
        // Return cached result
        const assessment = session.voice_assessment
          ? (session.voice_assessment as unknown as VoiceQualityAssessment)
          : undefined;
        const cachedScore = session.score;
        return c.json({
          success: true,
          data: {
            score: cachedScore ?? 0,
            feedback: assessment
              ? buildTelefunFeedbackSummary(assessment)
              : "",
            assessment,
          },
          cached: true,
        });
      }

      // Still processing or failed — return conflict
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_IN_PROGRESS",
            message:
              session.scoring_status === "processing"
                ? "Scoring sedang diproses."
                : "Scoring sebelumnya gagal. Coba lagi.",
            scoringStatus: session.scoring_status,
          },
        },
        409,
      );
    }

    // === Claim succeeded — proceed with analysis ===
    const result = await analyzeVoiceQuality(id, user.id);
    if (!result.success || !result.assessment) {
      // Mark scoring as failed
      await adminClient.rpc("fail_telefun_scoring", {
        p_session_id: id,
        p_error: result.error || "Analysis failed",
      });

      return c.json(
        {
          success: false,
          error: {
            code: "ANALYSIS_ERROR",
            message: result.error || "Gagal melakukan analisis suara.",
          },
        },
        500,
      );
    }

    // Mark scoring as completed
    const assessment = result.assessment;
    await adminClient.rpc("complete_telefun_scoring", {
      p_session_id: id,
      p_score: assessment.overallScore,
      p_voice_assessment: assessment as unknown as Record<string, unknown>,
    });

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
    const message =
      error instanceof Error ? error.message : "Internal server error.";

    // Attempt to mark as failed in catch block
    try {
      await adminClient.rpc("fail_telefun_scoring", {
        p_session_id: id,
        p_error: message,
      });
    } catch (_) {
      // ignore nested error
    }

    return c.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message,
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
