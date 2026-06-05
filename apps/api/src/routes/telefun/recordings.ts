import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import {
  analyzeVoiceQuality,
  generateCoachingSummary,
} from "../../lib/telefun-analysis";

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

export function buildTelefunFeedbackSummary(assessment: any): string {
  if (!assessment) return "";
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
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: {
          code: "STORAGE_ERROR",
          message: error?.message || "Storage error.",
        },
      },
      500,
    );
  }
});

telefunRecordings.post("/score/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  try {
    const result = await analyzeVoiceQuality(id, user.id);
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: { code: "ANALYSIS_ERROR", message: result.error },
        },
        500,
      );
    }

    // Also trigger coaching summary generation in background/sequentially
    await generateCoachingSummary(id, user.id);

    const assessment = result.assessment;
    return c.json({
      success: true,
      data: {
        score: assessment?.overallScore ?? 0,
        feedback: assessment ? buildTelefunFeedbackSummary(assessment) : "",
        assessment: assessment,
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error?.message || "Internal server error.",
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
