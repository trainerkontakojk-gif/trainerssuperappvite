import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import * as sidakService from "../../services/sidak-service";
import { getRankingData } from "../../services/sidak-ranking-service";

type Variables = { user: User; profile: any };

const sidakDashboard = new Hono<{ Variables: Variables }>();

async function resolveSidakFilterScope(c: any): Promise<sidakService.SidakFilterScope | null> {
  const user = c.get("user");
  const profile = c.get("profile");
  return sidakService.getAccessibleSidakFilters(user.id, profile?.role ?? "");
}

// ── Agents ─────────────────────────────────────────────
sidakDashboard.get("/agents", requireRole("admin", "trainer", "leader"), async (c) => {
  const user = c.get("user");
  const profile = c.get("profile");
  const year = c.req.query("year")
    ? parseInt(c.req.query("year")!)
    : new Date().getFullYear();
  const showAll = c.req.query("show_all") === "true";
  const accessibleIds = await sidakService.getAccessibleAgentIds(
    user.id,
    profile?.role ?? "",
  );
  const filterScope = await resolveSidakFilterScope(c);
  const result = await sidakService.getAgentDirectorySummary(
    year,
    accessibleIds ?? undefined,
    showAll,
    filterScope?.allowedServices ?? undefined,
  );
  return c.json({ success: true, data: result });
});

sidakDashboard.get(
  "/agents/:id",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const id = c.req.param("id");
    const year = c.req.query("year")
      ? parseInt(c.req.query("year")!)
      : undefined;
    const serviceType = c.req.query("service_type") || undefined;
    const startMonth = c.req.query("startMonth")
      ? parseInt(c.req.query("startMonth")!)
      : undefined;
    const endMonth = c.req.query("endMonth")
      ? parseInt(c.req.query("endMonth")!)
      : undefined;
    const accessibleIds = await sidakService.getAccessibleAgentIds(
      user.id,
      profile?.role ?? "",
    );
    if (accessibleIds && !accessibleIds.includes(id)) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Anda tidak memiliki akses ke data agent ini.",
          },
        },
        403,
      );
    }
    const filterScope = await resolveSidakFilterScope(c);
    try {
      const detail = await sidakService.getAgentDetail(
        id,
        year,
        serviceType,
        startMonth,
        endMonth,
        filterScope?.allowedServices ?? undefined,
      );
      return c.json({ success: true, data: detail });
    } catch (e: any) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: e.message } },
        404,
      );
    }
  },
);

// ── Dashboard ──────────────────────────────────────────
sidakDashboard.get(
  "/dashboard",
  requireRole("admin", "trainer", "leader", "agent"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const period_ids = c.req.query("period_ids")?.split(",");
    const service_type = c.req.query("service_type");
    const folder_ids = c.req.query("folder_ids")?.split(",");
    const year = c.req.query("year")
      ? parseInt(c.req.query("year")!)
      : undefined;
    const startMonth = c.req.query("startMonth")
      ? parseInt(c.req.query("startMonth")!)
      : undefined;
    const endMonth = c.req.query("endMonth")
      ? parseInt(c.req.query("endMonth")!)
      : undefined;
    const showArchived = c.req.query("show_archived") === "true";

    const accessibleIds = await sidakService.getAccessibleAgentIds(
      user.id,
      profile?.role ?? "",
    );
    const filterScope = await resolveSidakFilterScope(c);
    const effectiveServiceType = sidakService.resolveScopedServiceType(
      service_type,
      filterScope,
    );

    const data = await sidakService.getDashboardData({
      period_ids,
      service_type: effectiveServiceType,
      folder_ids,
      year,
      startMonth,
      endMonth,
      agent_ids: accessibleIds ?? undefined,
      showArchived,
      allowedServiceTypes: filterScope?.allowedServices ?? undefined,
    });
    return c.json({ success: true, data });
  },
);

sidakDashboard.post(
  "/dashboard/refresh-summary",
  requireRole("admin", "trainer"),
  async (c) => {
    const body = await c.req.json();
    const parsed = z
      .object({
        periodId: z.string().uuid(),
        serviceType: z.string().optional(),
      })
      .safeParse(body);
    if (!parsed.success)
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Data tidak valid" },
        },
        400,
      );
    try {
      const result = await sidakService.refreshDashboardSummary(
        parsed.data.periodId,
        parsed.data.serviceType,
      );
      return c.json({ success: true, data: result });
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: { code: "REFRESH_ERROR", message: e.message },
        },
        400,
      );
    }
  },
);

sidakDashboard.post(
  "/dashboard/forecast",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const body = await c.req.json();

    const parsed = z
      .object({
        filters: z.object({
          year: z.number().optional(),
          periodIds: z.array(z.string().uuid()).optional(),
          serviceType: z.string().optional(),
          folderIds: z.array(z.string().uuid()).optional(),
          batchNames: z.array(z.string()).optional(),
          startMonth: z.number().int().min(1).max(12).optional(),
          endMonth: z.number().int().min(1).max(12).optional(),
        }),
        horizonMonths: z.number().min(1).max(6).optional(),
        forceRefresh: z.boolean().optional(),
        cacheOnly: z.boolean().optional(),
      })
      .safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Data tidak valid" },
        },
        400,
      );
    }

    const accessibleIds = await sidakService.getAccessibleAgentIds(
      user.id,
      profile?.role ?? "",
    );
    if (accessibleIds && accessibleIds.length === 0) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Anda belum memiliki scope agent SIDAK.",
          },
        },
        403,
      );
    }
    const filterScope = await resolveSidakFilterScope(c);
    const effectiveServiceType = sidakService.resolveScopedServiceType(
      parsed.data.filters.serviceType,
      filterScope,
    );

    try {
      const result = await sidakService.generateSidakTrendForecast({
        ...parsed.data,
        forceRefresh: parsed.data.forceRefresh ?? false,
        cacheOnly: parsed.data.cacheOnly ?? false,
        filters: {
          ...parsed.data.filters,
          serviceType: effectiveServiceType,
          agentIds: accessibleIds ?? undefined,
          allowedServiceTypes: filterScope?.allowedServices ?? undefined,
        },
        userId: user.id,
      });
      return c.json({ success: true, data: result });
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: { code: "FORECAST_ERROR", message: e.message },
        },
        400,
      );
    }
  },
);

sidakDashboard.get(
  "/dashboard/available-years",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const accessibleIds = profile
      ? await sidakService.getAccessibleAgentIds(user.id, profile?.role ?? "")
      : null;
    try {
      const years = await sidakService.getAvailableYears(
        accessibleIds ?? undefined,
      );
      return c.json({ success: true, data: years });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakDashboard.get(
  "/dashboard/trend",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const yearQuery = c.req.query("year");
    const startMonthQuery = c.req.query("startMonth");
    const endMonthQuery = c.req.query("endMonth");
    const service_type = c.req.query("service_type");
    const accessibleIds = profile
      ? await sidakService.getAccessibleAgentIds(user.id, profile?.role ?? "")
      : null;

    try {
      if (yearQuery) {
        const year = parseInt(yearQuery);
        const startMonth = startMonthQuery ? parseInt(startMonthQuery) : 1;
        const endMonth = endMonthQuery ? parseInt(endMonthQuery) : 12;
        const trend = await sidakService.getServiceTrendForDashboardByRange(
          year,
          startMonth,
          endMonth,
          accessibleIds ?? undefined,
          service_type,
        );
        return c.json({ success: true, data: trend });
      } else {
        const trendAll = await sidakService.getServiceTrendForDashboard(
          "all",
          accessibleIds ?? undefined,
          service_type,
        );
        const trendMap = {
          "3m": sidakService.sliceTrendData(trendAll, 3),
          "6m": sidakService.sliceTrendData(trendAll, 6),
          all: trendAll,
        };
        return c.json({ success: true, data: { trendMap } });
      }
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

// ── Service Weights ────────────────────────────────────
sidakDashboard.get(
  "/service-weights",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const weights = await sidakService.getServiceWeights();
    return c.json({ success: true, data: weights });
  },
);

sidakDashboard.put(
  "/service-weights/:serviceType",
  requireRole("admin", "trainer"),
  async (c) => {
    const serviceType = c.req.param("serviceType");
    const body = await c.req.json();
    const parsed = z
      .object({
        critical_weight: z.number().min(0).max(1).optional(),
        non_critical_weight: z.number().min(0).max(1).optional(),
        scoring_mode: z.enum(["weighted", "flat", "no_category"]).optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Data tidak valid" },
        },
        400,
      );
    }
    try {
      const result = await sidakService.updateServiceWeight(
        serviceType,
        parsed.data,
      );
      return c.json({ success: true, data: result });
    } catch (e: any) {
      return c.json(
        { success: false, error: { code: "UPDATE_ERROR", message: e.message } },
        400,
      );
    }
  },
);

// ── Ranking ──────────────────────────────────────────────
sidakDashboard.get(
  "/ranking",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const period = c.req.query("period") || "ytd";
    const service_type = c.req.query("service_type") || "call";
    const year = c.req.query("year")
      ? parseInt(c.req.query("year")!)
      : new Date().getFullYear();
    const folder = c.req.query("folder") || "ALL";

    const accessibleIds = await sidakService.getAccessibleAgentIds(
      user.id,
      profile?.role ?? "",
    );
    const filterScope = await resolveSidakFilterScope(c);

    try {
      const data = await getRankingData({
        period,
        service_type,
        year,
        folder,
        accessibleIds,
        filterScope,
      });

      return c.json({
        success: true,
        data,
      });
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: e.message },
        },
        500,
      );
    }
  },
);

export { sidakDashboard };
