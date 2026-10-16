import { getActor } from "../middleware/role";
import { resolveAccountScope } from "../services/access/scope";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import {
  KETIK_ERROR_MESSAGES,
  KETIK_SESSION_ERRORS,
  ketikQuickTemplateSchema,
  ketikAppSettingsSchema,
} from "@trainers/types";
import * as ketikService from "../services/ketik-service";
import { requireCapability } from "../middleware/role";
import { aiRateLimitMiddleware } from "../middleware/rateLimit";
import { createAdminClient } from "../lib/supabase";
import { isSettingsConflictError } from "../lib/guarded-user-settings";
import { z } from "zod";
import { ketikAssignments } from "./ketik-assignments";
import { ketikSessions } from "./ketik-sessions";
import { ketikHistory } from "./ketik-history";

type Variables = { user: User; profile: any };

const ketik = new Hono<{ Variables: Variables }>()
  .route("/assignments", ketikAssignments)
  .route("/sessions", ketikSessions)
  .route("/history", ketikHistory);

function publicError(code: keyof typeof KETIK_ERROR_MESSAGES) {
  return { code, message: KETIK_ERROR_MESSAGES[code] };
}

ketik.get("/scenarios", requireCapability("ketik.use"), (c) => {
  return c.json({ success: true, data: ketikService.getScenarios() });
});

ketik.get("/consumer-types", requireCapability("ketik.use"), (c) => {
  return c.json({ success: true, data: ketikService.getConsumerTypes() });
});

ketik.post("/generate", requireCapability("ketik.use"), (c) =>
  c.json(
    {
      success: false,
      error: {
        code: "LEGACY_SESSION_WRITE_DISABLED",
        message: KETIK_SESSION_ERRORS.LEGACY_SESSION_WRITE_DISABLED,
      },
    },
    410,
  ),
);

ketik.get("/settings", requireCapability("ketik.settings.read"), async (c) => {
  try {
    const snapshot = await ketikService.getSettingsSnapshot(
      resolveAccountScope(getActor(c)).userId,
    );
    c.header("x-settings-version", snapshot.version);
    c.header("x-ketik-templates-version", snapshot.globalTemplatesVersion);
    return c.json({ success: true, data: snapshot.settings });
  } catch (err: unknown) {
    console.error("[KETIK] Settings load failed", err);
    return c.json(
      {
        success: false,
        error: publicError("SETTINGS_LOAD_FAILED"),
      },
      500,
    );
  }
});

ketik.put(
  "/templates",
  requireCapability("ketik.templates.shared.write"),
  zValidator(
    "json",
    z.object({ templates: z.array(ketikQuickTemplateSchema) }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const version = c.req.header("x-ketik-templates-version");
      const newVersion = await ketikService.saveGlobalKetikQuickTemplates(
        body.templates,
        version,
      );
      c.header("x-ketik-templates-version", newVersion);
      return c.json({
        success: true,
        message: "Template standar berhasil disimpan.",
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
      console.error("[KETIK] Templates save failed", err);
      return c.json(
        {
          success: false,
          error: publicError("TEMPLATES_SAVE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.put(
  "/settings",
  requireCapability("ketik.settings.write"),
  zValidator("json", ketikAppSettingsSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const version = c.req.header("x-settings-version");
      const newVersion = await ketikService.saveSettings(
        resolveAccountScope(getActor(c)).userId,
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
      console.error("[KETIK] Settings save failed", err);
      return c.json(
        {
          success: false,
          error: publicError("SETTINGS_SAVE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.post("/history", requireCapability("ketik.history.write"), (c) =>
  c.json(
    {
      success: false,
      error: {
        code: "LEGACY_SESSION_WRITE_DISABLED",
        message: KETIK_SESSION_ERRORS.LEGACY_SESSION_WRITE_DISABLED,
      },
    },
    410,
  ),
);

ketik.delete(
  "/history",
  requireCapability("ketik.history.delete"),
  async (c) => {
    try {
      await ketikService.clearHistory(resolveAccountScope(getActor(c)).userId);
      return c.json({ success: true, message: "Riwayat berhasil dihapus." });
    } catch (err: unknown) {
      console.error("[KETIK] History delete failed", err);
      return c.json(
        {
          success: false,
          error: publicError("HISTORY_DELETE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.delete(
  "/history/:id",
  requireCapability("ketik.history.delete"),
  async (c) => {
    const sessionId = c.req.param("id");
    try {
      await ketikService.deleteSession(
        sessionId,
        resolveAccountScope(getActor(c)).userId,
      );
      return c.json({ success: true, message: "Sesi berhasil dihapus." });
    } catch (err: unknown) {
      console.error("[KETIK] Session delete failed", err);
      return c.json(
        {
          success: false,
          error: publicError("HISTORY_DELETE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.get(
  "/review/:sessionId",
  requireCapability("ketik.review.read"),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const detail = await ketikService.getReviewDetail(
        sessionId,
        resolveAccountScope(getActor(c)).userId,
      );
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
    } catch (err: unknown) {
      console.error("[KETIK] Review load failed", err);
      return c.json(
        {
          success: false,
          error: publicError("REVIEW_LOAD_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.post(
  "/review",
  requireCapability("ketik.review"),
  aiRateLimitMiddleware,
  zValidator(
    "json",
    z.object({
      sessionId: z.string(),
      workerId: z.string().optional(),
      // Telaah ulang sesi yang sudah selesai; hasil lama dipakai bila gagal.
      rerun: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");

    const adminClient = createAdminClient();
    const nowIso = new Date().toISOString();
    let isRerun = false;

    try {
      // 1. Verify session ownership
      const { data: session, error: sessionError } = await adminClient
        .from("ketik_history")
        .select("user_id, review_status")
        .eq("id", body.sessionId)
        .eq("user_id", resolveAccountScope(getActor(c)).userId)
        .single();

      if (sessionError && sessionError.code !== "PGRST116") throw sessionError;
      if (!session) {
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

      isRerun = body.rerun === true && session.review_status === "completed";
      if (isRerun) {
        const reopened = await ketikService.reopenKetikReviewForRerun(
          body.sessionId,
        );
        if (!reopened) {
          console.log(
            `[KETIK Review] session=${body.sessionId} action=rerun_busy`,
          );
          return c.json({ success: true, data: { status: "processing" } });
        }
        console.log(`[KETIK Review] session=${body.sessionId} action=rerun`);
      }

      // 2. Check existing job state with lease info (legacy parity)
      const { data: existingJob, error: jobError } = await adminClient
        .from("ketik_review_jobs")
        .select(
          "status, lease_owner, lease_expires_at, attempt_count, error_message",
        )
        .eq("session_id", body.sessionId)
        .maybeSingle();

      if (jobError) throw jobError;
      if (existingJob?.status === "completed") {
        if (session.review_status !== "completed") {
          await adminClient
            .from("ketik_history")
            .update({ review_status: "completed" })
            .eq("id", body.sessionId);
        }
        console.log(
          `[KETIK Review] session=${body.sessionId} status=completed action=skip`,
        );
        return c.json({
          success: true,
          data: { status: "completed" },
        });
      }

      // For processing: check if lease is still active
      if (existingJob?.status === "processing") {
        const leaseExpired =
          existingJob.lease_expires_at && existingJob.lease_expires_at < nowIso;
        if (!leaseExpired) {
          // Active lease — let the existing worker finish
          if (session.review_status !== "processing") {
            await adminClient
              .from("ketik_history")
              .update({ review_status: "processing" })
              .eq("id", body.sessionId);
          }
          console.log(
            `[KETIK Review] session=${body.sessionId} status=processing action=skip_active_lease`,
          );
          return c.json({
            success: true,
            data: { status: "processing" },
          });
        }
        // Expired lease — reclaim by falling through to processing
        console.log(
          `[KETIK Review] session=${body.sessionId} status=processing action=reclaim_expired_lease`,
        );
      }

      // For queued: fall through to claim/process directly
      if (existingJob?.status === "queued") {
        console.log(
          `[KETIK Review] session=${body.sessionId} status=queued action=claim`,
        );
      }

      // For failed: reset job for retry
      if (existingJob?.status === "failed") {
        console.log(
          `[KETIK Review] session=${body.sessionId} status=failed action=retry`,
        );
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
      const triggerResult = await ketikService.triggerKetikAIReview(
        body.sessionId,
        resolveAccountScope(getActor(c)).userId,
      );

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

      console.log(
        `[KETIK Review] session=${body.sessionId} action=process result=${processResult.status}${processResult.error ? ` error=${processResult.error}` : ""}`,
      );

      const previousKept =
        isRerun && processResult.status === "failed"
          ? await ketikService.restoreKetikReviewAfterFailedRerun(
              body.sessionId,
            )
          : false;

      return c.json({
        success: true,
        data: {
          status: processResult.status,
          scores: processResult.scores || undefined,
          error: processResult.error
            ? KETIK_ERROR_MESSAGES.REVIEW_FAILED
            : undefined,
          previousKept: previousKept || undefined,
        },
      });
    } catch (err: any) {
      console.error(
        `[KETIK Review] session=${body.sessionId} action=error error=${err.message}`,
      );
      if (isRerun) {
        await ketikService
          .restoreKetikReviewAfterFailedRerun(body.sessionId)
          .catch((restoreError) =>
            console.error(
              `[KETIK Review] session=${body.sessionId} action=rerun_restore_error`,
              restoreError,
            ),
          );
      }
      return c.json(
        {
          success: false,
          error: publicError("REVIEW_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.get(
  "/review/status/:sessionId",
  requireCapability("ketik.review.read"),
  async (c) => {
    const sessionId = c.req.param("sessionId");

    try {
      const result = await ketikService.getKetikReviewStatus(
        sessionId,
        resolveAccountScope(getActor(c)).userId,
      );
      if (!result) {
        return c.json(
          {
            success: false,
            error: publicError("NOT_FOUND"),
          },
          404,
        );
      }
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      console.error("[KETIK] Review status load failed", err);
      return c.json(
        {
          success: false,
          error: publicError("REVIEW_LOAD_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.get("/worker", requireCapability("ketik.worker.process"), async (c) => {
  const workerId = c.req.query("workerId") || "web-daemon";
  try {
    const result = await ketikService.processOldestQueuedJob(workerId);
    return c.json({
      success: true,
      data: {
        ...result,
        ...(result.error ? { error: KETIK_ERROR_MESSAGES.REVIEW_FAILED } : {}),
      },
    });
  } catch (err: unknown) {
    console.error("[KETIK] Review worker failed", err);
    return c.json(
      {
        success: false,
        error: publicError("REVIEW_FAILED"),
      },
      500,
    );
  }
});

export { ketik };
