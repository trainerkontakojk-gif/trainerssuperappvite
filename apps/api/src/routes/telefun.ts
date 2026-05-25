import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/supabase";
import {
  analyzeVoiceQuality,
  generateCoachingSummary,
} from "../lib/telefun-analysis";
import { generateGeminiContent } from "../lib/gemini";

type Variables = { user: User; profile: any };

const telefun = new Hono<{ Variables: Variables }>();

telefun.get("/sessions", async (c) => {
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    let query = adminClient
      .from("telefun_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!isManager) {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return c.json({ success: true, data: data ?? [] });
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

export function buildTelefunSessionInsertPayload(params: {
  userId: string;
  body: {
    scenario_title: string;
    consumer_name: string;
    consumer_gender?: string;
    consumer_phone?: string;
    consumer_city?: string;
    realistic_mode_enabled?: boolean;
    persona_config?: any;
    disruption_config?: any;
    configured_duration?: number;
    response_pacing_mode?: string;
    telefun_model_id?: string;
    telefun_transport?: string;
  };
}) {
  return {
    user_id: params.userId,
    scenario_title: params.body.scenario_title,
    consumer_name: params.body.consumer_name,
    consumer_gender: params.body.consumer_gender || "female",
    consumer_phone: params.body.consumer_phone || null,
    consumer_city: params.body.consumer_city || null,
    realistic_mode_enabled: params.body.realistic_mode_enabled || false,
    persona_config: params.body.persona_config,
    disruption_config: params.body.disruption_config,
    status: "active",
    configured_duration: params.body.configured_duration || null,
    response_pacing_mode: params.body.response_pacing_mode || null,
    telefun_model_id: params.body.telefun_model_id || null,
    telefun_transport: params.body.telefun_transport || null,
  };
}

telefun.post(
  "/sessions",
  zValidator(
    "json",
    z.object({
      scenario_title: z.string(),
      consumer_name: z.string(),
      consumer_gender: z.string().optional(),
      consumer_phone: z.string().optional(),
      consumer_city: z.string().optional(),
      realistic_mode_enabled: z.boolean().default(false),
      persona_config: z.any().optional(),
      disruption_config: z.any().optional(),
      configured_duration: z.number().optional(),
      response_pacing_mode: z.string().optional(),
      telefun_model_id: z.string().optional(),
      telefun_transport: z.string().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

    try {
      const insertPayload = buildTelefunSessionInsertPayload({
        userId: user.id,
        body,
      });
      const { data, error } = await adminClient
        .from("telefun_history")
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;
      return c.json({ success: true, data });
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
  },
);

export function buildTelefunSessionUpdatePayload(body: {
  status?: "pending" | "active" | "completed" | "failed";
  duration_seconds?: number;
  messages?: any[];
  recording_path?: string;
  agent_recording_path?: string;
  session_metrics?: any;
  voice_dashboard_metrics?: any;
  disruption_results?: any;
  persona_config?: any;
  realistic_mode_enabled?: boolean;
  score?: number;
  feedback?: string;
  configured_duration?: number;
  response_pacing_mode?: string;
  telefun_model_id?: string;
  telefun_transport?: string;
}) {
  return {
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.duration_seconds !== undefined ? { duration_seconds: body.duration_seconds } : {}),
    ...(body.messages !== undefined ? { messages: body.messages } : {}),
    ...(body.recording_path !== undefined ? { recording_path: body.recording_path } : {}),
    ...(body.agent_recording_path !== undefined ? { agent_recording_path: body.agent_recording_path } : {}),
    ...(body.session_metrics !== undefined ? { session_metrics: body.session_metrics } : {}),
    ...(body.voice_dashboard_metrics !== undefined ? { voice_dashboard_metrics: body.voice_dashboard_metrics } : {}),
    ...(body.disruption_results !== undefined ? { disruption_results: body.disruption_results } : {}),
    ...(body.persona_config !== undefined ? { persona_config: body.persona_config } : {}),
    ...(body.realistic_mode_enabled !== undefined ? { realistic_mode_enabled: body.realistic_mode_enabled } : {}),
    ...(body.score !== undefined ? { score: body.score } : {}),
    ...(body.feedback !== undefined ? { feedback: body.feedback } : {}),
    ...(body.configured_duration !== undefined ? { configured_duration: body.configured_duration } : {}),
    ...(body.response_pacing_mode !== undefined ? { response_pacing_mode: body.response_pacing_mode } : {}),
    ...(body.telefun_model_id !== undefined ? { telefun_model_id: body.telefun_model_id } : {}),
    ...(body.telefun_transport !== undefined ? { telefun_transport: body.telefun_transport } : {}),
  };
}

export function buildTelefunFeedbackSummary(assessment: any): string {
  if (!assessment) return "";
  const parts = [
    assessment.speakingRate?.feedback,
    assessment.intonation?.feedback,
    assessment.articulation?.feedback,
    assessment.fillerWords?.feedback,
    assessment.emotionalTone?.feedback,
  ].filter(Boolean);
  return parts.slice(0, 3).join("\n\n");
}

telefun.patch(
  "/sessions/:id",
  zValidator(
    "json",
    z.object({
      status: z.enum(["pending", "active", "completed", "failed"]).optional(),
      duration_seconds: z.number().optional(),
      messages: z.array(z.any()).optional(),
      recording_path: z.string().optional(),
      agent_recording_path: z.string().optional(),
      session_metrics: z.any().optional(),
      voice_dashboard_metrics: z.any().optional(),
      disruption_results: z.any().optional(),
      persona_config: z.any().optional(),
      realistic_mode_enabled: z.boolean().optional(),
      score: z.number().optional(),
      feedback: z.string().optional(),
      configured_duration: z.number().optional(),
      response_pacing_mode: z.string().optional(),
      telefun_model_id: z.string().optional(),
      telefun_transport: z.string().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

    try {
      const updatePayload = buildTelefunSessionUpdatePayload(body);
      const { error } = await adminClient
        .from("telefun_history")
        .update(updatePayload)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      return c.json({ success: true, message: "Sesi diperbarui." });
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
  },
);

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

telefun.post(
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
      if (recordingPath && !isTelefunRecordingPathOwnedBySession({
        path: recordingPath,
        userId: user.id,
        sessionId,
        type: "full_call"
      })) {
        return c.json(
          {
            success: false,
            error: { message: "Invalid recording path ownership" },
          },
          400,
        );
      }
      if (agentRecordingPath && !isTelefunRecordingPathOwnedBySession({
        path: agentRecordingPath,
        userId: user.id,
        sessionId,
        type: "agent_only"
      })) {
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

telefun.get("/recording/:id", async (c) => {
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
    return c.json({ success: true, url: data.signedUrl });
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

telefun.post("/score/:id", async (c) => {
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

telefun.delete("/history/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data: session, error: fetchError } = await adminClient
      .from("telefun_history")
      .select("user_id, recording_path, agent_recording_path")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
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

    // Delete files from storage
    const filesToDelete = [
      session.recording_path,
      session.agent_recording_path,
    ].filter(Boolean) as string[];
    if (filesToDelete.length > 0) {
      await adminClient.storage
        .from("telefun-recordings")
        .remove(filesToDelete);
    }

    const { error: deleteError } = await adminClient
      .from("telefun_history")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    return c.json({ success: true, message: "Riwayat berhasil dihapus." });
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

telefun.delete("/history", async (c) => {
  const user = c.get("user");
  const adminClient = createAdminClient();

  try {
    // Note: This only deletes the history records. Storage cleanup for bulk is more complex,
    // usually handled by a background job or bucket lifecycle policy.
    const { error } = await adminClient
      .from("telefun_history")
      .delete()
      .eq("user_id", user.id);

    if (error) throw error;
    return c.json({
      success: true,
      message: "Semua riwayat berhasil dihapus.",
    });
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

telefun.get("/settings", async (c) => {
  const user = c.get("user");
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from("user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    const telefunSettings = data?.settings?.telefun || null;
    return c.json({ success: true, settings: telefunSettings });
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

export function buildTelefunSettingsUpsertPayload(params: {
  userId: string;
  existingSettings: any;
  telefunSettings: any;
  now: string;
}) {
  return {
    user_id: params.userId,
    settings: {
      ...(params.existingSettings || {}),
      telefun: params.telefunSettings,
    },
    updated_at: params.now,
  };
}

telefun.put(
  "/settings",
  zValidator(
    "json",
    z
      .object({
        selectedModel: z.string(),
        voiceName: z.string(),
        systemInstruction: z.string(),
        consumerName: z.string(),
        consumerGender: z.string(),
        scenarioTitle: z.string().optional(),
        scenarios: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              instruction: z.string(),
              isActive: z.boolean(),
              category: z.string().optional(),
              script: z.string().optional(),
            }),
          )
          .optional(),
        consumerTypes: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              gender: z.string(),
              description: z.string(),
              difficulty: z.string().optional(),
            }),
          )
          .optional(),
        maxCallDuration: z.number().optional(),
        responsePacingMode: z.enum(["realistic", "training_fast"]).optional(),
        realisticModeEnabled: z.boolean().optional(),
        realisticModeDisruptionTypes: z.array(z.string()).optional(),
        preferredConsumerTypeId: z.string().optional(),
        identitySettings: z.any().optional(),
        telefunModelId: z.string().optional(),
        telefunTransport: z.enum(["gemini-live", "openai-audio"]).optional(),
      })
      .passthrough(),
  ),
  async (c) => {
    const user = c.get("user");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

    try {
      const { data: existing } = await adminClient
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      const upsertPayload = buildTelefunSettingsUpsertPayload({
        userId: user.id,
        existingSettings: existing?.settings,
        telefunSettings: body,
        now: new Date().toISOString(),
      });

      const { error } = await adminClient
        .from("user_settings")
        .upsert(upsertPayload, { onConflict: "user_id" });

      if (error) throw error;
      return c.json({
        success: true,
        message: "Pengaturan Telefun berhasil disimpan.",
      });
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
  },
);

telefun.get("/history/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from("telefun_history")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
        },
        404,
      );
    }

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && data.user_id !== user.id) {
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

    return c.json({ success: true, data });
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

telefun.get("/coaching-summary/:id", async (c) => {
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

telefun.get("/annotations/:id", async (c) => {
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
      .from("telefun_replay_annotations")
      .select("*")
      .eq("session_id", sessionId)
      .order("timestamp_ms", { ascending: true });

    if (error) throw error;
    return c.json({ success: true, data: data ?? [] });
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

telefun.post(
  "/annotations/:id",
  zValidator(
    "json",
    z.object({
      timestamp_ms: z.number().int(),
      category: z.enum([
        "strength",
        "improvement_area",
        "critical_moment",
        "technique_used",
      ]),
      moment: z.string(),
      text: z.string().max(500),
      is_manual: z.boolean().default(true),
    }),
  ),
  async (c) => {
    const sessionId = c.req.param("id");
    const user = c.get("user");
    const profile = c.get("profile");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

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
        .from("telefun_replay_annotations")
        .insert({
          session_id: sessionId,
          user_id: session.user_id,
          timestamp_ms: body.timestamp_ms,
          category: body.category,
          moment: body.moment,
          text: body.text,
          is_manual: true,
        })
        .select()
        .single();

      if (error) throw error;
      return c.json({ success: true, data });
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
  },
);

telefun.delete("/annotations/:annotationId", async (c) => {
  const annotationId = c.req.param("annotationId");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data: annotation, error: fetchError } = await adminClient
      .from("telefun_replay_annotations")
      .select("user_id, session_id, is_manual")
      .eq("id", annotationId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!annotation) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Anotasi tidak ditemukan." },
        },
        404,
      );
    }

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && annotation.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses untuk menghapus anotasi ini.",
          },
        },
        403,
      );
    }

    if (!annotation.is_manual) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Hanya anotasi manual yang dapat dihapus.",
          },
        },
        400,
      );
    }

    const { error: deleteError } = await adminClient
      .from("telefun_replay_annotations")
      .delete()
      .eq("id", annotationId)
      .eq("is_manual", true);

    if (deleteError) throw deleteError;
    return c.json({ success: true, message: "Anotasi berhasil dihapus." });
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

// --- AI Annotation Generation ---

const REPLAY_ANNOTATION_SCHEMA = {
  type: "object",
  properties: {
    annotations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp_ms: { type: "number", description: "Waktu dalam milidetik pada rekaman" },
          category: {
            type: "string",
            enum: ["strength", "improvement_area", "critical_moment", "technique_used"],
          },
          moment: {
            type: "string",
            enum: ["missed_empathy", "good_de_escalation", "long_pause", "interruption", "technique_usage"],
          },
          text: { type: "string", description: "Deskripsi maksimal 500 karakter", maxLength: 500 },
        },
        required: ["timestamp_ms", "category", "moment", "text"],
      },
      maxItems: 30,
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          priority: { type: "number", minimum: 1, maximum: 5 },
        },
        required: ["text", "priority"],
      },
      maxItems: 5,
    },
  },
  required: ["annotations", "recommendations"],
};

telefun.post("/annotations/generate/:id", async (c) => {
  const sessionId = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    // 1. Validate session ownership
    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." } },
        404,
      );
    }

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Anda tidak memiliki akses ke sesi ini." },
        },
        403,
      );
    }

    // 2. Get recording
    const recordingPath = session.agent_recording_path;
    if (!recordingPath) {
      return c.json(
        {
          success: false,
          error: { code: "NO_RECORDING", message: "Tidak ada rekaman agen untuk sesi ini." },
        },
        400,
      );
    }

    const { data: audioData, error: downloadError } = await adminClient.storage
      .from("telefun-recordings")
      .download(recordingPath);

    if (downloadError || !audioData) {
      return c.json(
        {
          success: false,
          error: { code: "DOWNLOAD_FAILED", message: "Gagal mengunduh rekaman." },
        },
        500,
      );
    }

    const base64Audio = Buffer.from(await audioData.arrayBuffer()).toString("base64");

    // 3. Call Gemini for annotations
    const prompt = `Analisis rekaman telepon simulasi layanan konsumen berikut.
Skenario: ${session.scenario_title || "Tidak diketahui"}
Konsumen: ${session.consumer_name || "Tidak diketahui"}

Identifikasi momen-momen penting dalam percakapan:
- strength: Kekuatan agen (penanganan baik, empati, solusi tepat)
- improvement_area: Area yang perlu perbaikan
- critical_moment: Momen kritis (eskalasi, konfrontasi, titik balik)
- technique_used: Teknik yang digunakan (probing, clarifying, summarizing)

Jenis momen (moment):
- missed_empathy: Kesempatan empati terlewat
- good_de_escalation: De-eskalasi yang baik
- long_pause: Jeda panjang yang signifikan
- interruption: Interupsi
- technique_usage: Penggunaan teknik spesifik

Berikan maksimal 30 anotasi dan 5 rekomendasi coaching. Deskripsi maksimal 500 karakter.`;

    const result = await generateGeminiContent({
      model: "gemini-3.1-flash-lite",
      systemInstruction:
        "Anda adalah pelatih komunikasi profesional. Analisis rekaman telepon dan berikan catatan objektif dalam format JSON. Gunakan Bahasa Indonesia.",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "audio/webm",
                data: base64Audio,
              },
            },
          ],
        },
      ],
      responseMimeType: "application/json",
      responseSchema: REPLAY_ANNOTATION_SCHEMA,
      usageContext: { module: "telefun", action: "replay-annotation-generation" },
      userId: user.id,
    });

    const resultText = result.text || "";
    let parsed: { annotations?: any[]; recommendations?: any[] } = {};
    try {
      parsed = JSON.parse(resultText);
    } catch {
      const match = resultText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const annotations = (parsed.annotations || []).slice(0, 30);
    const recommendations = (parsed.recommendations || []).slice(0, 5);

    if (annotations.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: "NO_ANNOTATIONS", message: "AI tidak menghasilkan anotasi." },
        },
        500,
      );
    }

    // 4. Delete stale AI annotations
    await adminClient
      .from("telefun_replay_annotations")
      .delete()
      .eq("session_id", sessionId)
      .eq("is_manual", false);

    // 5. Insert new AI annotations
    const annotationRows = annotations.map((a: any) => ({
      session_id: sessionId,
      user_id: session.user_id,
      timestamp_ms: a.timestamp_ms,
      category: a.category,
      moment: a.moment,
      text: (a.text || "").slice(0, 500),
      is_manual: false,
    }));

    const { data: insertedAnnotations, error: insertError } = await adminClient
      .from("telefun_replay_annotations")
      .insert(annotationRows)
      .select("*");

    if (insertError) throw insertError;

    // 6. Update coaching summary
    const checksum = Buffer.from(
      JSON.stringify(
        annotations
          .map((a: any) => `${a.timestamp_ms}:${a.category}:${a.text}`)
          .sort()
          .join("|"),
      ),
    ).toString("base64").slice(0, 64);

    await adminClient.rpc("upsert_telefun_coaching_summary", {
      p_session_id: sessionId,
      p_user_id: session.user_id,
      p_recommendations: recommendations.map((r: any) => ({
        text: r.text,
        priority: r.priority,
      })),
      p_ai_annotation_count: annotations.length,
      p_ai_annotation_checksum: checksum,
    });

    return c.json({
      success: true,
      data: {
        annotations: insertedAnnotations || [],
        recommendations,
      },
    });
  } catch (error: any) {
    console.error("[Telefun] Annotation generation error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "GENERATION_ERROR",
          message: error?.message || "Gagal menghasilkan anotasi.",
        },
      },
      500,
    );
  }
});

export { telefun };
