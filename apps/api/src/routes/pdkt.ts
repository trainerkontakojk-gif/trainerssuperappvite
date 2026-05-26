import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import {
  generateEmailSchema,
  evaluateSchema,
  pdktMailboxBatchSchema,
  pdktMailboxReplySchema,
} from "@trainers/types";
import type { PdktSessionConfig } from "@trainers/types";
import * as pdktService from "../services/pdkt-service";
import { readPdktSettings, writePdktSettings } from "../lib/pdkt-settings";
import { requireRole } from "../middleware/role";
import { aiRateLimitMiddleware } from "../middleware/rateLimit";
import { createUserClient, createAdminClient } from "../lib/supabase";

type Variables = { user: User; profile: any };

function pdktErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Terjadi kesalahan yang tidak diketahui.";
  const msg = err.message.toLowerCase();
  if (msg.includes("duplicate key") || msg.includes("unique constraint"))
    return "Data sudah ada, tidak dapat membuat duplikat.";
  if (msg.includes("foreign key") || msg.includes("violates foreign key"))
    return "Data terkait tidak ditemukan atau rusak.";
  if (msg.includes("jwt expired") || msg.includes("token")) return "Sesi Anda telah berakhir. Silakan login kembali.";
  if (msg.includes("permission") || msg.includes("policy")) return "Anda tidak memiliki izin untuk melakukan tindakan ini.";
  return err.message || "Terjadi kesalahan saat menghubungi database.";
}

const pdkt = new Hono<{ Variables: Variables }>();

pdkt.get(
  "/scenarios",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  (c) => {
    return c.json({ success: true, data: pdktService.getScenarios() });
  },
);

pdkt.get(
  "/consumer-types",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  (c) => {
    return c.json({ success: true, data: pdktService.getConsumerTypes() });
  },
);

pdkt.post(
  "/generate-identity",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  (c) => {
    return c.json({
      success: true,
      data: pdktService.generateRandomIdentity(),
    });
  },
);

pdkt.post(
  "/generate-template",
  requireRole("admin", "trainer", "leader"),
  aiRateLimitMiddleware,
  zValidator("json", generateEmailSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    const scenarios = pdktService.getScenarios();
    const consumerTypes = pdktService.getConsumerTypes();
    const scenario = body.scenarioId
      ? scenarios.find((s) => s.id === body.scenarioId)
      : body.scenarioDraft;
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

    const config: PdktSessionConfig = {
      scenarios: [scenario],
      consumerType,
      identity: body.identity,
      enableImageGeneration: true,
      selectedModel: body.selectedModel,
      resolvedConsumerNameMentionPattern:
        body.resolvedConsumerNameMentionPattern,
      writingStyleMode: body.writingStyleMode,
    };

    const result = await pdktService.generateScenarioEmailTemplate(
      scenario,
      config,
      { module: "pdkt", action: "generate_email_template" },
      userId,
    );

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "AI_ERROR",
            message: result.error || "Gagal generate template.",
          },
        },
        502,
      );
    }

    return c.json({
      success: true,
      data: { subject: result.subject, body: result.body },
    });
  },
);

pdkt.post(
  "/evaluate",
  requireRole("admin", "trainer", "leader"),
  aiRateLimitMiddleware,
  zValidator("json", evaluateSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    const result = await pdktService.evaluateAgentResponse(
      body.config,
      body.emails,
      { module: "pdkt", action: "evaluate_agent_response" },
      userId,
    );

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "AI_ERROR",
            message: result.error || "Gagal evaluasi.",
          },
        },
        502,
      );
    }

    return c.json({
      success: true,
      data: {
        score: result.score,
        feedback: result.feedback,
        typos: result.typos,
        clarityIssues: result.clarityIssues,
        contentGaps: result.contentGaps,
      },
    });
  },
);

pdkt.get(
  "/mailbox",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);

    try {
      const data = await pdktService.fetchMailboxItems(userClient, user.id);
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.post(
  "/mailbox/batch",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  zValidator("json", pdktMailboxBatchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);

    try {
      const data = await pdktService.createMailboxItem(userClient, body);
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.delete(
  "/mailbox/:id",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);

    try {
      await pdktService.softDeleteMailboxItem(userClient, id, user.id);
      return c.json({ success: true, message: "Mailbox item deleted." });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.post(
  "/mailbox/reply",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  zValidator("json", pdktMailboxReplySchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);

    try {
      const historyId = await pdktService.submitMailboxReply(userClient, body);

      // Process evaluation in background
      const evalPromise = pdktService.processPdktEvaluation(historyId, user.id);
      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(evalPromise);
      } else {
        evalPromise.catch((err) =>
          console.error("[PDKT Async Eval Error]", err),
        );
      }

      return c.json({ success: true, data: { historyId } });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.get(
  "/history/eval/:id",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);

    try {
      const { data, error } = await userClient
        .from("pdkt_history")
        .select("evaluation_status, evaluation, evaluation_error")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        return c.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "History not found or access denied.",
            },
          },
          404,
        );
      }

      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.post(
  "/history/retry-eval",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    try {
      const body = await c.req.json();
      const historyId = body.historyId;
      if (!historyId) {
        return c.json(
          {
            success: false,
            error: { code: "BAD_REQUEST", message: "historyId is required" },
          },
          400,
        );
      }

      const user = c.get("user");
      const authHeader = c.req.header("Authorization");
      const token = authHeader!.split(" ")[1];
      const userClient = createUserClient(token);

      // Verify ownership
      const { data, error } = await userClient
        .from("pdkt_history")
        .select("id")
        .eq("id", historyId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        return c.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "History item not found or access denied.",
            },
          },
          404,
        );
      }

      const evalPromise = pdktService.processPdktEvaluation(historyId, user.id);
      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(evalPromise);
      } else {
        evalPromise.catch((err) =>
          console.error("[PDKT Async Eval Retry Error]", err),
        );
      }

      return c.json({ success: true, message: "Evaluation retrying." });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.get(
  "/settings",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);

    try {
      const { data, error } = await userClient
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      return c.json({
        success: true,
        data: readPdktSettings(data?.settings),
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.post(
  "/settings",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);
    const body = await c.req.json();

    try {
      const { data: existing, error: existingError } = await userClient
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      const updatedSettings = writePdktSettings(
        existing?.settings,
        body.settings,
      );

      const { data, error } = await userClient
        .from("user_settings")
        .upsert(
          {
            user_id: user.id,
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
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
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.get(
  "/history",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const authHeader = c.req.header("Authorization");
    const token = authHeader!.split(" ")[1];
    const userClient = createUserClient(token);

    try {
      const { data, error } = await userClient
        .from("pdkt_history")
        .select("*")
        .eq("user_id", user.id)
        .order("timestamp", { ascending: false });

      if (error) throw error;

      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.delete(
  "/history",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const adminClient = createAdminClient();

    try {
      const { error } = await adminClient
        .from("pdkt_history")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      return c.json({ success: true, message: "All PDKT history deleted." });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

pdkt.delete(
  "/history/:id",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const adminClient = createAdminClient();

    try {
      const { error } = await adminClient
        .from("pdkt_history")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      return c.json({ success: true, message: "PDKT history item deleted." });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: pdktErrorMessage(error),
          },
        },
        500,
      );
    }
  },
);

export { pdkt };
