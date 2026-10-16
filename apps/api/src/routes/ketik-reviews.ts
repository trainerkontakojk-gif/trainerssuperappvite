import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import {
  KETIK_ERROR_MESSAGES,
  ketikReviewRequestSchema,
  type Role,
} from "@trainers/types";
import { getActor, requireCapability } from "../middleware/role";
import { aiRateLimitMiddleware } from "../middleware/rateLimit";
import {
  enqueueKetikReview,
  getKetikReviewStatus,
} from "../services/ketik/review-lifecycle";
import { getReviewDetail } from "../services/ketik/settings-history";

type Variables = { user: User; profile: { role: Role } };
const missing = {
  success: false as const,
  error: { code: "NOT_FOUND", message: KETIK_ERROR_MESSAGES.NOT_FOUND },
};
export const ketikReviews = new Hono<{ Variables: Variables }>()
  .post(
    "/",
    requireCapability("ketik.review"),
    aiRateLimitMiddleware,
    zValidator("json", ketikReviewRequestSchema),
    async (c) => {
      const body = c.req.valid("json");
      try {
        const data = await enqueueKetikReview(
          body.sessionId,
          getActor(c).id,
          body.requestId ?? randomUUID(),
          body.rerun,
        );
        return c.json(
          { success: true as const, data },
          data.status === "queued" || data.status === "processing" ? 202 : 200,
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "message" in error &&
          error.message === "REVIEW_NOT_FOUND"
        )
          return c.json(missing, 404);
        console.error("[KETIK] Review enqueue failed", {
          errorClass: error instanceof Error ? error.name : "DatabaseError",
        });
        return c.json(
          {
            success: false as const,
            error: {
              code: "REVIEW_FAILED",
              message: KETIK_ERROR_MESSAGES.REVIEW_FAILED,
            },
          },
          500,
        );
      }
    },
  )
  .get(
    "/status/:sessionId",
    requireCapability("ketik.review.read"),
    zValidator("param", z.object({ sessionId: z.uuid() })),
    async (c) => {
      try {
        const data = await getKetikReviewStatus(
          c.req.valid("param").sessionId,
          getActor(c).id,
        );
        return data
          ? c.json({ success: true as const, data })
          : c.json(missing, 404);
      } catch {
        return c.json(
          {
            success: false as const,
            error: {
              code: "REVIEW_LOAD_FAILED",
              message: KETIK_ERROR_MESSAGES.REVIEW_LOAD_FAILED,
            },
          },
          500,
        );
      }
    },
  )
  .get(
    "/:sessionId",
    requireCapability("ketik.review.read"),
    zValidator("param", z.object({ sessionId: z.uuid() })),
    async (c) => {
      try {
        const data = await getReviewDetail(
          c.req.valid("param").sessionId,
          getActor(c).id,
        );
        return data
          ? c.json({ success: true as const, data })
          : c.json(missing, 404);
      } catch {
        return c.json(
          {
            success: false as const,
            error: {
              code: "REVIEW_LOAD_FAILED",
              message: KETIK_ERROR_MESSAGES.REVIEW_LOAD_FAILED,
            },
          },
          500,
        );
      }
    },
  );
