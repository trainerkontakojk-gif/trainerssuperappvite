import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import {
  chatMessageSchema,
  generateMessageSchema,
  ketikAppSettingsSchema,
} from "@trainers/types";
import * as ketikService from "../services/ketik-service";
import { requireRole } from "../middleware/role";
import { aiRateLimitMiddleware } from "../middleware/rateLimit";
import { createAdminClient } from "../lib/supabase";
import { isSettingsConflictError } from "../lib/guarded-user-settings";
import { z } from "zod";

type Variables = { user: User; profile: any };

const ketik = new Hono<{ Variables: Variables }>();

ketik.get("/scenarios", (c) => {
  return c.json({ success: true, data: ketikService.getScenarios() });
});

ketik.get("/consumer-types", (c) => {
  return c.json({ success: true, data: ketikService.getConsumerTypes() });
});

ketik.post(
  "/generate",
  requireRole("admin", "trainer", "leader", "qa", "tl", "spv", "om", "agent"),
  aiRateLimitMiddleware,
  zValidator("json", generateMessageSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    const scenarios = ketikService.getScenarios();
    const consumerTypes = ketikService.getConsumerTypes();
    // Prioritize scenarioDraft (custom scenarios) over ID lookup (default scenarios)
    const scenario = body.scenarioDraft
      ? body.scenarioDraft
      : scenarios.find((s) => s.id === body.scenarioId);
    const consumerType = body.consumerTypeDraft
      ? body.consumerTypeDraft
      : consumerTypes.find((ct) => ct.id === body.consumerTypeId);

    if (!scenario || !consumerType) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Scenario atau consumer type tidak ditemukan.",
          },
        },
        404,
      );
    }

    const result = await ketikService.generateConsumerResponse(
      {
        scenarios: [scenario],
        consumerType,
        identity: body.identity,
        selectedModel: body.selectedModel,
        simulationDuration: body.simulationDuration,
        responsePacingMode: body.responsePacingMode,
      },
      scenario,
      body.chatHistory,
      { module: "ketik", action: "generate_consumer_response" },
      userId,
      {
        remainingSeconds: body.remainingSeconds,
        elapsedSeconds: body.elapsedSeconds,
        totalDurationSeconds: body.simulationDuration
          ? body.simulationDuration * 60
          : undefined,
      },
    );

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "AI_ERROR",
            message: result.error || "Gagal generate response.",
          },
        },
        502,
      );
    }

    return c.json({ success: true, data: { text: result.text } });
  },
);

ketik.get("/settings", async (c) => {
  const user = c.get("user");
  try {
    const snapshot = await ketikService.getSettingsSnapshot(user.id);
    c.header("x-settings-version", snapshot.version);
    return c.json({ success: true, data: snapshot.settings });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      500,
    );
  }
});

ketik.put(
  "/settings",
  zValidator("json", ketikAppSettingsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    try {
      const version = c.req.header("x-settings-version");
      const newVersion = await ketikService.saveSettings(
        user.id,
        body,
        version,
      );
      c.header("x-settings-version", newVersion);
      return c.json({
        success: true,
        message: "Pengaturan berhasil disimpan.",
      });
    } catch (err: unknown) {
      if (isSettingsConflictError(err)) {
        return c.json(
          {
            success: false,
            error: { code: "SETTINGS_CONFLICT", message: err.message },
          },
          409,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message },
        },
        500,
      );
    }
  },
);

ketik.get("/history", async (c) => {
  const user = c.get("user");
  try {
    const history = await ketikService.getHistory(user.id);
    return c.json({ success: true, data: history });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      500,
    );
  }
});

ketik.post(
  "/history",
  zValidator(
    "json",
    z.object({
      scenarioTitle: z.string(),
      consumerName: z.string(),
      consumerPhone: z.string(),
      consumerCity: z.string(),
      messages: z.array(chatMessageSchema),
      simulationDuration: z.number().finite().min(1).max(60).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    try {
      const session = await ketikService.persistSession(user.id, body);
      return c.json({ success: true, data: session });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: err.message },
        },
        500,
      );
    }
  },
);

ketik.delete("/history", async (c) => {
  const user = c.get("user");
  try {
    await ketikService.clearHistory(user.id);
    return c.json({ success: true, message: "Riwayat berhasil dihapus." });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      500,
    );
  }
});

ketik.delete("/history/:id", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("id");
  try {
    await ketikService.deleteSession(sessionId, user.id);
    return c.json({ success: true, message: "Sesi berhasil dihapus." });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      500,
    );
  }
});

ketik.get("/review/:sessionId", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("sessionId");
  try {
    const detail = await ketikService.getReviewDetail(sessionId, user.id);
    if (!detail) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Review tidak ditemukan atau belum selesai.",
          },
        },
        404,
      );
    }
    return c.json({ success: true, data: detail });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      500,
    );
  }
});

ketik.post(
  "/review",
  requireRole("admin", "trainer", "qa"),
  aiRateLimitMiddleware,
  zValidator(
    "json",
    z.object({ sessionId: z.string(), workerId: z.string().optional() }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const adminClient = createAdminClient();
    const nowIso = new Date().toISOString();

    try {
      // 1. Verify session ownership
      const { data: session, error: sessionError } = await adminClient
        .from("ketik_history")
        .select("user_id, review_status")
        .eq("id", body.sessionId)
        .eq("user_id", user.id)
        .single();

      if (sessionError || !session) {
        return c.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Sesi tidak ditemukan atau bukan milik Anda.",
            },
          },
          404,
        );
      }

      // 2. Check existing job state with lease info (legacy parity)
      const { data: existingJob } = await adminClient
        .from("ketik_review_jobs")
        .select("status, lease_owner, lease_expires_at, attempt_count, error_message")
        .eq("session_id", body.sessionId)
        .maybeSingle();

      if (existingJob?.status === "completed") {
        if (session.review_status !== "completed") {
          await adminClient
            .from("ketik_history")
            .update({ review_status: "completed" })
            .eq("id", body.sessionId);
        }
        console.log(`[KETIK Review] session=${body.sessionId} status=completed action=skip`);
        return c.json({
          success: true,
          data: { status: "completed" },
        });
      }

      // For processing: check if lease is still active
      if (existingJob?.status === "processing") {
        const leaseExpired =
          existingJob.lease_expires_at &&
          existingJob.lease_expires_at < nowIso;
        if (!leaseExpired) {
          // Active lease — let the existing worker finish
          if (session.review_status !== "processing") {
            await adminClient
              .from("ketik_history")
              .update({ review_status: "processing" })
              .eq("id", body.sessionId);
          }
          console.log(`[KETIK Review] session=${body.sessionId} status=processing action=skip_active_lease`);
          return c.json({
            success: true,
            data: { status: "processing" },
          });
        }
        // Expired lease — reclaim by falling through to processing
        console.log(`[KETIK Review] session=${body.sessionId} status=processing action=reclaim_expired_lease`);
      }

      // For queued: fall through to claim/process directly
      if (existingJob?.status === "queued") {
        console.log(`[KETIK Review] session=${body.sessionId} status=queued action=claim`);
      }

      // For failed: reset job for retry
      if (existingJob?.status === "failed") {
        console.log(`[KETIK Review] session=${body.sessionId} status=failed action=retry`);
        await adminClient
          .from("ketik_review_jobs")
          .update({
            status: "queued",
            lease_owner: null,
            lease_expires_at: null,
            error_message: null,
          })
          .eq("session_id", body.sessionId);
      }

      // 3. Trigger review (handles missing job + enqueue)
      const triggerResult = await ketikService.triggerKetikAIReview(body.sessionId, user.id);

      if (triggerResult?.status === "skipped") {
        console.log(`[KETIK Review] session=${body.sessionId} action=skipped`);
        return c.json({
          success: true,
          data: { status: "completed" },
        });
      }

      // 4. Update history to processing so polling doesn't stick on pending
      await adminClient
        .from("ketik_history")
        .update({ review_status: "processing" })
        .eq("id", body.sessionId);

      // 5. Process synchronously (legacy parity — await completion)
      const processResult = await ketikService.claimAndProcessKetikReviewJob(
        body.sessionId,
        body.workerId || "immediate-web",
      );

      console.log(`[KETIK Review] session=${body.sessionId} action=process result=${processResult.status}${processResult.error ? ` error=${processResult.error}` : ""}`);

      return c.json({
        success: true,
        data: {
          status: processResult.status,
          scores: processResult.scores || undefined,
          error: processResult.error || undefined,
        },
      });
    } catch (err: any) {
      console.error(`[KETIK Review] session=${body.sessionId} action=error error=${err.message}`);
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: err.message },
        },
        400,
      );
    }
  },
);

ketik.get("/review/status/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const user = c.get("user");

  try {
    const result = await ketikService.getKetikReviewStatus(sessionId, user.id);
    if (!result) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Session not found." },
        },
        404,
      );
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      500,
    );
  }
});

ketik.get("/worker", requireRole("admin", "trainer", "qa"), async (c) => {
  const workerId = c.req.query("workerId") || "web-daemon";
  try {
    const result = await ketikService.processOldestQueuedJob(workerId);
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      500,
    );
  }
});

export { ketik };
