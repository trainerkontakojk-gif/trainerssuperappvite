import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  pdktMailboxBatchSchema,
  pdktMailboxReplySchema,
  evaluateSchema,
  pdktMailboxBulkDeleteSchema,
} from "@trainers/types";
import * as pdktService from "../../services/pdkt-service";
import { requireRole } from "../../middleware/role";
import { aiRateLimitMiddleware } from "../../middleware/rateLimit";
import {
  Variables,
  getUserClient,
  jsonAiError,
  jsonServerError,
} from "./route-utils";

const mailbox = new Hono<{ Variables: Variables }>();

mailbox.get(
  "/",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const userClient = getUserClient(c);

    try {
      const data = await pdktService.fetchMailboxItems(userClient, {
        id: user.id,
        role: profile.role,
      });
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

mailbox.post(
  "/batch",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  zValidator("json", pdktMailboxBatchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const userClient = getUserClient(c);

    try {
      const data = await pdktService.createMailboxItem(userClient, body);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      console.error("[PDKT /mailbox/batch] Raw error:", error);
      console.error("[PDKT /mailbox/batch] Error detail:", {
        message: error instanceof Error ? error.message : String(error),
        code: typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined,
        details:
          typeof error === "object" && error !== null
            ? (error as { details?: unknown }).details
            : undefined,
        hint:
          typeof error === "object" && error !== null
            ? (error as { hint?: unknown }).hint
            : undefined,
      });
      return jsonServerError(c, error);
    }
  },
);

mailbox.delete(
  "/:id",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const profile = c.get("profile");
    const userClient = getUserClient(c);

    try {
      await pdktService.softDeleteMailboxItem(userClient, id, {
        id: user.id,
        role: profile.role,
      });
      return c.json({ success: true, message: "Mailbox item deleted." });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

mailbox.post(
  "/batch-delete",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  zValidator("json", pdktMailboxBulkDeleteSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const profile = c.get("profile");
    const userClient = getUserClient(c);

    try {
      const result = await pdktService.bulkSoftDeleteMailboxItems(
        userClient,
        body.ids,
        {
          id: user.id,
          role: profile.role,
        },
      );
      return c.json({ success: true, data: result });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

mailbox.post(
  "/reply",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  zValidator("json", pdktMailboxReplySchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userClient = getUserClient(c);

    try {
      const historyId = await pdktService.submitMailboxReply(userClient, body);

      // Process evaluation in background (fire-and-forget, graceful on test context)
      const evalPromise = pdktService.processPdktEvaluation(historyId, user.id);
      try {
        if (c.executionCtx?.waitUntil) {
          c.executionCtx.waitUntil(evalPromise);
        } else {
          evalPromise.catch((err) =>
            console.error("[PDKT Async Eval Error]", err),
          );
        }
      } catch (_execCtxErr) {
        // No ExecutionContext (e.g. app.request() in tests) — silently ignore
        evalPromise.catch((err) =>
          console.error("[PDKT Async Eval Error]", err),
        );
      }

      return c.json({ success: true, data: { historyId } });
    } catch (error: unknown) {
      console.error("[PDKT /mailbox/reply] Raw error:", error);
      console.error("[PDKT /mailbox/reply] Error detail:", {
        message: error instanceof Error ? error.message : String(error),
        code: typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined,
        details:
          typeof error === "object" && error !== null
            ? (error as { details?: unknown }).details
            : undefined,
        hint:
          typeof error === "object" && error !== null
            ? (error as { hint?: unknown }).hint
            : undefined,
      });
      return jsonServerError(c, error);
    }
  },
);

// This endpoint was in pdkt.ts as /evaluate, but it's related to mailbox/agent responses
mailbox.post(
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
      return jsonAiError(c, result.error || "Gagal evaluasi.");
    }

    return c.json({
      success: true,
      data: {
        score: result.score,
        feedback: result.feedback,
        typos: result.typos,
        clarityIssues: result.clarityIssues,
        contentGaps: result.contentGaps,
        scoreBreakdown: result.scoreBreakdown,
      },
    });
  },
);

export { mailbox };
