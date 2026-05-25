import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/supabase";
import {
  analyzeVoiceQuality,
  generateCoachingSummary,
} from "../lib/telefun-analysis";

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
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

    try {
      const { error } = await adminClient
        .from("telefun_history")
        .update(body)
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

    return c.json({ success: true, data: result.assessment });
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

export { telefun };
