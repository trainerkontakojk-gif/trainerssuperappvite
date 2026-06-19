import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import type { TelefunTranscriptEntry } from "@trainers/types";
import { telefunTranscriptSchema } from "@trainers/types";

type Variables = { user: User; profile: any };

const telefunSessions = new Hono<{ Variables: Variables }>();

telefunSessions.get("/sessions", async (c) => {
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

telefunSessions.post(
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
  messages?: TelefunTranscriptEntry[];
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

telefunSessions.patch(
  "/sessions/:id",
  zValidator(
    "json",
    z.object({
      status: z.enum(["pending", "active", "completed", "failed"]).optional(),
      duration_seconds: z.number().optional(),
      messages: telefunTranscriptSchema.optional(),
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

telefunSessions.get("/history/:id", async (c) => {
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

telefunSessions.delete("/history/:id", async (c) => {
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

telefunSessions.delete("/history", async (c) => {
  const user = c.get("user");
  const adminClient = createAdminClient();

  try {
    const { data: sessions, error: fetchError } = await adminClient
      .from("telefun_history")
      .select("recording_path, agent_recording_path")
      .eq("user_id", user.id);

    if (fetchError) throw fetchError;

    const filesToDelete = Array.from(
      new Set(
        (sessions ?? []).flatMap((session) =>
          [session.recording_path, session.agent_recording_path].filter(
            Boolean,
          ),
        ),
      ),
    ) as string[];

    for (let index = 0; index < filesToDelete.length; index += 1000) {
      const batch = filesToDelete.slice(index, index + 1000);
      const { error: storageError } = await adminClient.storage
        .from("telefun-recordings")
        .remove(batch);

      if (storageError) throw storageError;
    }

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

export { telefunSessions };
