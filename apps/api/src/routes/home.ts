import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { getActor, requireCapability } from "../middleware/role";
import { getHomeAttention } from "../services/home/attention";

export const home = new Hono<{ Variables: AuthVariables }>().get(
  "/attention",
  requireCapability("dashboard.view"),
  async (c) => {
    try {
      const data = await getHomeAttention(getActor(c));
      return c.json({ success: true as const, data });
    } catch {
      return c.json(
        {
          success: false as const,
          error: {
            code: "HOME_ATTENTION_UNAVAILABLE",
            message: "Daftar tindakan belum dapat dimuat. Silakan coba lagi.",
          },
        },
        503,
      );
    }
  },
);
