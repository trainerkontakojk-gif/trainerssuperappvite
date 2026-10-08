import { ScopeUnavailableError } from "../../services/access/scope";
import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireCapability } from "../../middleware/role";
import * as sidakService from "../../services/sidak-service";

type Variables = { user: User; profile: any };

const sidakReports = new Hono<{ Variables: Variables }>();

// ── Reports ──────────────────────────────────────────────
sidakReports.post(
  "/reports/data",
  requireCapability("sidak.reports.generate"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const body = await c.req.json();
    const parsed = z
      .object({
        serviceType: z.string().optional(),
        year: z.number().int().optional(),
        startMonth: z.number().int().min(1).max(12).optional(),
        endMonth: z.number().int().min(1).max(12).optional(),
        folderId: z.string().optional(),
        pesertaId: z.string().optional(),
        indicatorId: z.string().optional(),
        showArchived: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success)
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Filter tidak valid" },
        },
        400,
      );
    const accessibleIds = await sidakService.getAccessibleAgentIds(
      user.id,
      profile?.role ?? "",
    );
    try {
      const rows = await sidakService.getDataReportRows({
        ...parsed.data,
        agent_ids: accessibleIds ?? undefined,
      });
      return c.json({ success: true, data: rows });
    } catch (e: any) {
      if (e instanceof ScopeUnavailableError) throw e;
      return c.json(
        { success: false, error: { code: "REPORT_ERROR", message: e.message } },
        400,
      );
    }
  },
);

export { sidakReports };
