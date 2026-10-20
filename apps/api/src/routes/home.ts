import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { getActor, requireCapability } from "../middleware/role";
import { getHomeAttention } from "../services/home/attention";
import { getAgentHomeSummary } from "../services/home/agent-summary";

export const home = new Hono<{ Variables: AuthVariables }>()
  .get("/attention", requireCapability("dashboard.view"), async (c) => {
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
  })
  .get(
    "/agent-summary",
    requireCapability("sidak.dashboard.read"),
    async (c) => {
      const actor = getActor(c);
      if (actor.role !== "agent")
        return c.json(
          {
            success: false as const,
            error: {
              code: "FORBIDDEN",
              message: "Ringkasan ini hanya tersedia untuk akun agent.",
            },
          },
          403,
        );
      if (Object.keys(c.req.query()).length)
        return c.json(
          {
            success: false as const,
            error: {
              code: "INVALID_INPUT",
              message: "Ringkasan pribadi tidak menerima filter tambahan.",
            },
          },
          400,
        );
      try {
        return c.json({
          success: true as const,
          data: await getAgentHomeSummary(actor),
        });
      } catch {
        return c.json(
          {
            success: false as const,
            error: {
              code: "HOME_AGENT_SUMMARY_UNAVAILABLE",
              message: "Ringkasan QA belum dapat dimuat. Silakan coba lagi.",
            },
          },
          503,
        );
      }
    },
  );
