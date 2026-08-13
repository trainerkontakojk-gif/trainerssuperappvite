import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import { env, isTelefunOpenAiWebRtcEligible } from "../../lib/env";
import {
  consumeTelefunDistributedRateLimit,
  TelefunDistributedRateLimitError,
  type TelefunDistributedRateLimitClient,
} from "../../middleware/rateLimit";
import {
  DEFAULT_TELEFUN_LIVE_MODEL_ID,
  getTelefunLiveModel,
  isValidTelefunModelTransportPair,
  telefunTranscriptSchema,
  type AiModelRealtimeMetadata,
  type TelefunTranscriptEntry,
  type TelefunTransport,
} from "@trainers/types";
import { isTelefunRecordingPathOwnedBySession } from "./recording-paths";
import { enrichTelefunHistoryFeedback } from "../../lib/telefun-feedback";

type Variables = { user: User; profile: any };

const telefunSessions = new Hono<{ Variables: Variables }>();

function isActiveWebRtcDeleteError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return (
    value.code === "55006" ||
    (typeof value.message === "string" &&
      value.message.includes("Active WebRTC sessions must be terminalized"))
  );
}

function activeWebRtcDeleteResponse(c: {
  json: (body: unknown, status: 409) => Response;
}) {
  return c.json(
    {
      success: false,
      error: {
        code: "ACTIVE_WEBRTC_SESSION",
        message: "Akhiri panggilan WebRTC sebelum menghapus riwayat.",
      },
    },
    409,
  );
}

function retryAfterSeconds(resetAt: string): string {
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs)) return "1";
  return String(Math.max(1, Math.ceil((resetMs - Date.now()) / 1_000)));
}

export class TelefunSessionValidationError extends Error {}

export const LIVE_PROMPT_INSTRUCTIONS_MAX_LENGTH = 16_000;

const livePromptInstructionsSchema = z
  .string()
  .nullable()
  .optional()
  .superRefine((value, ctx) => {
    if (value === undefined || value === null) return;
    if (value.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Instruksi prompt tidak boleh kosong.",
      });
      return;
    }
    if (value.length > LIVE_PROMPT_INSTRUCTIONS_MAX_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Instruksi prompt maksimum ${LIVE_PROMPT_INSTRUCTIONS_MAX_LENGTH} karakter.`,
      });
    }
  });

function resolveTelefunSessionModelPair(params: {
  modelId?: string;
  transport?: string;
}) {
  if (params.modelId === undefined && params.transport !== undefined) {
    throw new TelefunSessionValidationError(
      "Model Telefun wajib dikirim ketika transport disediakan.",
    );
  }

  const modelId = params.modelId ?? DEFAULT_TELEFUN_LIVE_MODEL_ID;
  const model = getTelefunLiveModel(modelId);
  if (!model) {
    throw new TelefunSessionValidationError("Model Telefun tidak dikenal.");
  }

  const transport = params.transport ?? model.realtime.transport;
  if (!isValidTelefunModelTransportPair(model.id, transport)) {
    throw new TelefunSessionValidationError(
      "Model dan transport Telefun tidak cocok.",
    );
  }

  return { model, transport: transport as TelefunTransport };
}

export function validateTelefunSessionDuration(
  model: { realtime: AiModelRealtimeMetadata },
  configuredDuration?: number,
) {
  const maxSessionMinutes = model.realtime.maxSessionMinutes;
  if (maxSessionMinutes === undefined) return;

  const maxSessionSeconds = maxSessionMinutes * 60;
  if ((configuredDuration ?? 0) > maxSessionSeconds) {
    throw new TelefunSessionValidationError(
      `Durasi maksimum model Telefun adalah ${maxSessionSeconds} detik.`,
    );
  }
}

function validateLivePromptForTransport(params: {
  transport: TelefunTransport;
  instructions?: string | null;
}): void {
  if (params.transport !== "openai-webrtc") return;
  if (
    typeof params.instructions !== "string" ||
    params.instructions.trim().length === 0
  ) {
    throw new TelefunSessionValidationError(
      "OpenAI WebRTC memerlukan prompt snapshot yang lengkap.",
    );
  }
}

export const telefunSessionCreatePayloadSchema = z
  .object({
    scenario_title: z.string(),
    consumer_name: z.string(),
    consumer_gender: z.enum(["male", "female"]).optional(),
    consumer_phone: z.string().optional(),
    consumer_city: z.string().optional(),
    realistic_mode_enabled: z.boolean().default(false),
    persona_config: z.any().optional(),
    disruption_config: z.any().optional(),
    configured_duration: z.number().optional(),
    response_pacing_mode: z.string().optional(),
    telefun_model_id: z.string().optional(),
    telefun_transport: z.string().optional(),
    live_prompt_instructions: livePromptInstructionsSchema,
  })
  .superRefine((body, ctx) => {
    try {
      const pair = resolveTelefunSessionModelPair({
        modelId: body.telefun_model_id,
        transport: body.telefun_transport,
      });
      validateTelefunSessionDuration(pair.model, body.configured_duration);
      validateLivePromptForTransport({
        transport: pair.transport,
        instructions: body.live_prompt_instructions,
      });
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : "Konfigurasi model Telefun tidak valid.",
      });
    }
  });

export const telefunSessionUpdatePayloadSchema = z
  .object({
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
  })
  .superRefine((body, ctx) => {
    const hasModel = body.telefun_model_id !== undefined;
    const hasTransport = body.telefun_transport !== undefined;
    if (!hasModel && !hasTransport) return;

    if (!hasModel || !hasTransport) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Model dan transport Telefun harus diperbarui bersama.",
      });
      return;
    }

    try {
      resolveTelefunSessionModelPair({
        modelId: body.telefun_model_id,
        transport: body.telefun_transport,
      });
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : "Konfigurasi model Telefun tidak valid.",
      });
    }
  });

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
    return c.json({
      success: true,
      data: (data ?? []).map(enrichTelefunHistoryFeedback),
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
    live_prompt_instructions?: string | null;
  };
}) {
  const pair = resolveTelefunSessionModelPair({
    modelId: params.body.telefun_model_id,
    transport: params.body.telefun_transport,
  });
  validateTelefunSessionDuration(pair.model, params.body.configured_duration);
  validateLivePromptForTransport({
    transport: pair.transport,
    instructions: params.body.live_prompt_instructions,
  });

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
    telefun_model_id: pair.model.id,
    telefun_transport: pair.transport,
    live_prompt_instructions: params.body.live_prompt_instructions ?? null,
  };
}

telefunSessions.post(
  "/sessions",
  zValidator("json", telefunSessionCreatePayloadSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    try {
      const insertPayload = buildTelefunSessionInsertPayload({
        userId: user.id,
        body,
      });
      if (
        insertPayload.telefun_transport === "openai-webrtc" &&
        !isTelefunOpenAiWebRtcEligible(user.id)
      ) {
        throw new TelefunSessionValidationError(
          "OpenAI WebRTC rollout tidak tersedia untuk akun ini.",
        );
      }
      const adminClient = createAdminClient();
      if (insertPayload.telefun_transport === "openai-webrtc") {
        const rateLimitClient =
          adminClient as unknown as Partial<TelefunDistributedRateLimitClient>;
        if (typeof rateLimitClient.rpc !== "function") {
          throw new TelefunDistributedRateLimitError();
        }
        const rate = await consumeTelefunDistributedRateLimit({
          client: rateLimitClient as TelefunDistributedRateLimitClient,
          userId: user.id,
          provider: "openai-webrtc",
          scope: "session-create",
          requestLimit: env.TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE,
        });
        if (!rate.allowed) {
          c.header("Retry-After", retryAfterSeconds(rate.resetAt));
          return c.json(
            {
              success: false,
              error: {
                code: "RATE_LIMITED",
                message: "Terlalu banyak sesi WebRTC. Coba lagi nanti.",
              },
            },
            429,
          );
        }
      }
      const { data, error } = await adminClient
        .from("telefun_history")
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;
      return c.json({ success: true, data });
    } catch (error: any) {
      if (error instanceof TelefunDistributedRateLimitError) {
        return c.json(
          {
            success: false,
            error: {
              code: "RATE_LIMIT_UNAVAILABLE",
              message: "Pembatasan sesi belum tersedia. Coba lagi nanti.",
            },
          },
          503,
        );
      }
      if (error instanceof TelefunSessionValidationError) {
        return c.json(
          {
            success: false,
            error: { code: "BAD_REQUEST", message: error.message },
          },
          400,
        );
      }
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

export function buildTelefunSessionUpdatePayload(
  body: {
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
  },
  ownership?: {
    userId: string;
    sessionId: string;
  },
) {
  const hasModel = body.telefun_model_id !== undefined;
  const hasTransport = body.telefun_transport !== undefined;
  if (hasModel !== hasTransport) {
    throw new TelefunSessionValidationError(
      "Model dan transport Telefun harus diperbarui bersama.",
    );
  }
  if (hasModel && hasTransport) {
    resolveTelefunSessionModelPair({
      modelId: body.telefun_model_id,
      transport: body.telefun_transport,
    });
  }

  if (
    ownership &&
    body.recording_path !== undefined &&
    !isTelefunRecordingPathOwnedBySession({
      path: body.recording_path,
      userId: ownership.userId,
      sessionId: ownership.sessionId,
      type: "full_call",
    })
  ) {
    throw new Error("Invalid recording path ownership");
  }

  if (
    ownership &&
    body.agent_recording_path !== undefined &&
    !isTelefunRecordingPathOwnedBySession({
      path: body.agent_recording_path,
      userId: ownership.userId,
      sessionId: ownership.sessionId,
      type: "agent_only",
    })
  ) {
    throw new Error("Invalid agent recording path ownership");
  }

  return {
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.duration_seconds !== undefined
      ? { duration_seconds: body.duration_seconds }
      : {}),
    ...(body.messages !== undefined ? { messages: body.messages } : {}),
    ...(body.recording_path !== undefined
      ? { recording_path: body.recording_path }
      : {}),
    ...(body.agent_recording_path !== undefined
      ? { agent_recording_path: body.agent_recording_path }
      : {}),
    ...(body.session_metrics !== undefined
      ? { session_metrics: body.session_metrics }
      : {}),
    ...(body.voice_dashboard_metrics !== undefined
      ? { voice_dashboard_metrics: body.voice_dashboard_metrics }
      : {}),
    ...(body.disruption_results !== undefined
      ? { disruption_results: body.disruption_results }
      : {}),
    ...(body.persona_config !== undefined
      ? { persona_config: body.persona_config }
      : {}),
    ...(body.realistic_mode_enabled !== undefined
      ? { realistic_mode_enabled: body.realistic_mode_enabled }
      : {}),
    ...(body.score !== undefined ? { score: body.score } : {}),
    ...(body.feedback !== undefined ? { feedback: body.feedback } : {}),
    ...(body.configured_duration !== undefined
      ? { configured_duration: body.configured_duration }
      : {}),
    ...(body.response_pacing_mode !== undefined
      ? { response_pacing_mode: body.response_pacing_mode }
      : {}),
    ...(body.telefun_model_id !== undefined
      ? { telefun_model_id: body.telefun_model_id }
      : {}),
    ...(body.telefun_transport !== undefined
      ? { telefun_transport: body.telefun_transport }
      : {}),
  };
}

telefunSessions.patch(
  "/sessions/:id",
  zValidator("json", telefunSessionUpdatePayloadSchema),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

    try {
      if (
        body.telefun_transport === "openai-webrtc" &&
        !isTelefunOpenAiWebRtcEligible(user.id)
      ) {
        throw new TelefunSessionValidationError(
          "OpenAI WebRTC rollout tidak tersedia untuk akun ini.",
        );
      }

      const { data: existingSession, error: existingSessionError } =
        await adminClient
          .from("telefun_history")
          .select("user_id, telefun_transport")
          .eq("id", id)
          .maybeSingle();

      if (existingSessionError) {
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
      if (!existingSession) {
        return c.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
          },
          404,
        );
      }
      if (existingSession.user_id !== user.id) {
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

      const webRtcLifecycleFields = [
        "status",
        "messages",
        "duration_seconds",
        "recording_path",
        "agent_recording_path",
        "score",
        "feedback",
      ] as const;
      const isWebRtcSession =
        existingSession.telefun_transport === "openai-webrtc" ||
        body.telefun_transport === "openai-webrtc";
      if (
        isWebRtcSession &&
        webRtcLifecycleFields.some((field) => body[field] !== undefined)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SERVER_OWNED_LIFECYCLE",
              message: "Lifecycle WebRTC dikelola oleh server.",
            },
          },
          400,
        );
      }

      const updatePayload = buildTelefunSessionUpdatePayload(body, {
        userId: user.id,
        sessionId: id,
      });
      if (isWebRtcSession) {
        const rateLimitClient =
          adminClient as unknown as Partial<TelefunDistributedRateLimitClient>;
        if (typeof rateLimitClient.rpc !== "function") {
          throw new TelefunDistributedRateLimitError();
        }
        const rate = await consumeTelefunDistributedRateLimit({
          client: rateLimitClient as TelefunDistributedRateLimitClient,
          userId: user.id,
          sessionId: id,
          provider: "openai-webrtc",
          scope: "session-write",
          requestLimit: env.TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE,
        });
        if (!rate.allowed) {
          c.header("Retry-After", retryAfterSeconds(rate.resetAt));
          return c.json(
            {
              success: false,
              error: {
                code: "RATE_LIMITED",
                message:
                  "Terlalu banyak perubahan sesi WebRTC. Coba lagi nanti.",
              },
            },
            429,
          );
        }
      }
      const { error } = await adminClient
        .from("telefun_history")
        .update(updatePayload)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      return c.json({ success: true, message: "Sesi diperbarui." });
    } catch (error: any) {
      if (error instanceof TelefunDistributedRateLimitError) {
        return c.json(
          {
            success: false,
            error: {
              code: "RATE_LIMIT_UNAVAILABLE",
              message: "Pembatasan sesi belum tersedia. Coba lagi nanti.",
            },
          },
          503,
        );
      }
      if (
        error?.message === "Invalid recording path ownership" ||
        error?.message === "Invalid agent recording path ownership" ||
        error instanceof TelefunSessionValidationError
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: error.message,
            },
          },
          400,
        );
      }

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

    return c.json({
      success: true,
      data: enrichTelefunHistoryFeedback(data),
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

telefunSessions.delete("/history/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data: session, error: fetchError } = await adminClient
      .from("telefun_history")
      .select(
        "user_id, status, telefun_transport, recording_path, agent_recording_path",
      )
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
    if (
      session.telefun_transport === "openai-webrtc" &&
      (session.status === "active" || session.status === "pending")
    ) {
      return activeWebRtcDeleteResponse(c);
    }

    const filesToDelete = [
      session.recording_path,
      session.agent_recording_path,
    ].filter(Boolean) as string[];

    // Delete the guarded history row first. The database trigger is the final
    // race check; storage cleanup must never run after a rejected live delete.
    const { error: deleteError } = await adminClient
      .from("telefun_history")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    if (filesToDelete.length > 0) {
      await adminClient.storage
        .from("telefun-recordings")
        .remove(filesToDelete);
    }

    return c.json({ success: true, message: "Riwayat berhasil dihapus." });
  } catch (error: any) {
    if (isActiveWebRtcDeleteError(error)) {
      return activeWebRtcDeleteResponse(c);
    }
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
      .select(
        "id, status, telefun_transport, recording_path, agent_recording_path",
      )
      .eq("user_id", user.id);

    if (fetchError) throw fetchError;
    const activeWebRtcSession = (sessions ?? []).find(
      (session) =>
        session.telefun_transport === "openai-webrtc" &&
        (session.status === "active" || session.status === "pending"),
    );
    if (activeWebRtcSession) return activeWebRtcDeleteResponse(c);

    const filesToDelete = Array.from(
      new Set(
        (sessions ?? []).flatMap((session) =>
          [session.recording_path, session.agent_recording_path].filter(
            Boolean,
          ),
        ),
      ),
    ) as string[];

    // The guarded bulk DELETE performs the final active-session race check
    // before any storage object is removed.
    const { error } = await adminClient
      .from("telefun_history")
      .delete()
      .eq("user_id", user.id);
    if (error) throw error;

    for (let index = 0; index < filesToDelete.length; index += 1000) {
      const batch = filesToDelete.slice(index, index + 1000);
      const { error: storageError } = await adminClient.storage
        .from("telefun-recordings")
        .remove(batch);

      if (storageError) throw storageError;
    }

    return c.json({
      success: true,
      message: "Semua riwayat berhasil dihapus.",
    });
  } catch (error: any) {
    if (isActiveWebRtcDeleteError(error)) {
      return activeWebRtcDeleteResponse(c);
    }
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
