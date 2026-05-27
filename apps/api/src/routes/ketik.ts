import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { generateMessageSchema } from "@trainers/types";
import * as ketikService from "../services/ketik-service";
import { requireRole } from "../middleware/role";
import { aiRateLimitMiddleware } from "../middleware/rateLimit";
import { createAdminClient } from "../lib/supabase";
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
  requireRole("admin", "trainer", "qa", "tl", "spv", "om", "agent"),
  aiRateLimitMiddleware,
  zValidator("json", generateMessageSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    const scenarios = ketikService.getScenarios();
    const consumerTypes = ketikService.getConsumerTypes();
    const scenario = scenarios.find((s) => s.id === body.scenarioId);
    const consumerType = consumerTypes.find(
      (ct) => ct.id === body.consumerTypeId,
    );

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
    const settings = await ketikService.getSettings(user.id);
    return c.json({ success: true, data: settings });
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

ketik.put("/settings", zValidator("json", z.any()), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  try {
    await ketikService.saveSettings(user.id, body);
    return c.json({ success: true, message: "Pengaturan berhasil disimpan." });
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
      messages: z.array(z.any()),
      simulationDuration: z.number().optional(),
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

      // 2. Check existing job state (legacy parity)
      const { data: existingJob } = await adminClient
        .from("ketik_review_jobs")
        .select("status")
        .eq("session_id", body.sessionId)
        .maybeSingle();

      if (existingJob?.status === "completed") {
        if (session.review_status !== "completed") {
          await adminClient
            .from("ketik_history")
            .update({ review_status: "completed" })
            .eq("id", body.sessionId);
        }
        return c.json({
          success: true,
          data: { status: "completed" },
        });
      }

      if (existingJob?.status === "processing") {
        if (session.review_status !== "processing") {
          await adminClient
            .from("ketik_history")
            .update({ review_status: "processing" })
            .eq("id", body.sessionId);
        }
        return c.json({
          success: true,
          data: { status: "processing" },
        });
      }

      if (existingJob?.status === "queued") {
        return c.json({
          success: true,
          data: { status: "processing" },
        });
      }

      if (existingJob?.status === "failed") {
        // Reset failed job for retry
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
      await ketikService.triggerKetikAIReview(body.sessionId, user.id);

      // 4. Update history to processing so polling doesn't stick on pending
      await adminClient
        .from("ketik_history")
        .update({ review_status: "processing" })
        .eq("id", body.sessionId);

      // 5. Process (fire-and-forget with waitUntil if available)
      const processPromise = ketikService.claimAndProcessKetikReviewJob(
        body.sessionId,
        body.workerId || "immediate-web",
      );
      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(processPromise);
      } else {
        processPromise.catch((err) =>
          console.error("[KETIK Immediate Process Error]", err),
        );
      }

      return c.json({
        success: true,
        data: { status: "processing" },
      });
    } catch (err: any) {
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
