import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import {
  ketikHistoryQuerySchema,
  KETIK_ERROR_MESSAGES,
  type Role,
} from "@trainers/types";
import { getActor, requireCapability } from "../middleware/role";
import { resolveAccountScope } from "../services/access/scope";
import {
  getHistoryPage,
  getHistorySummary,
  getHistoryDetail,
  InvalidHistoryCursor,
} from "../services/ketik/history-read";

type Variables = { user: User; profile: { role: Role } };
const loadError = {
  success: false as const,
  error: {
    code: "HISTORY_LOAD_FAILED",
    message: KETIK_ERROR_MESSAGES.HISTORY_LOAD_FAILED,
  },
};
export const ketikHistory = new Hono<{ Variables: Variables }>()
  .use("*", requireCapability("ketik.history.read"))
  .get("/", zValidator("query", ketikHistoryQuerySchema), async (c) => {
    try {
      return c.json({
        success: true,
        data: await getHistoryPage(
          resolveAccountScope(getActor(c)).userId,
          c.req.valid("query"),
        ),
      });
    } catch (error) {
      if (error instanceof InvalidHistoryCursor)
        return c.json(
          {
            success: false,
            error: {
              code: "INVALID_HISTORY_CURSOR",
              message: "Tautan halaman tidak valid. Muat ulang riwayat.",
            },
          },
          400,
        );
      console.error("[KETIK] History page failed", error);
      return c.json(loadError, 500);
    }
  })
  .get("/summary", async (c) => {
    try {
      return c.json({
        success: true,
        data: await getHistorySummary(resolveAccountScope(getActor(c)).userId),
      });
    } catch (error) {
      console.error("[KETIK] History summary failed", error);
      return c.json(loadError, 500);
    }
  })
  .get("/:id", zValidator("param", z.object({ id: z.uuid() })), async (c) => {
    try {
      const data = await getHistoryDetail(
        resolveAccountScope(getActor(c)).userId,
        c.req.valid("param").id,
      );
      if (!data)
        return c.json(
          {
            success: false,
            error: {
              code: "SESSION_NOT_FOUND",
              message: KETIK_ERROR_MESSAGES.NOT_FOUND,
            },
          },
          404,
        );
      return c.json({ success: true, data });
    } catch (error) {
      console.error("[KETIK] History detail failed", error);
      return c.json(loadError, 500);
    }
  });
