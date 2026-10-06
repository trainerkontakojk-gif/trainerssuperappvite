import { ScopeUnavailableError } from "../../services/access/scope";
import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireCapability } from "../../middleware/role";
import * as sidakService from "../../services/sidak-service";
import { logActivity } from "../../services/activity-log-service";
import { serviceTypeSchema } from "@trainers/types";

type Variables = { user: User; profile: any };

const sidakCore = new Hono<{ Variables: Variables }>();

async function resolveSidakFilterScope(
  c: any,
): Promise<sidakService.SidakFilterScope | null> {
  const user = c.get("user");
  const profile = c.get("profile");
  return sidakService.getAccessibleSidakFilters(user.id, profile?.role ?? "");
}

// ── Periods ────────────────────────────────────────────
sidakCore.get("/periods", requireCapability("sidak.config.read"), async (c) => {
  const periods = await sidakService.getPeriods();
  return c.json({ success: true, data: periods });
});

sidakCore.post("/periods", requireCapability("sidak.write"), async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2000).max(2100),
    })
    .safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Data periode tidak valid",
          details: parsed.error,
        },
      },
      400,
    );
  }
  const period = await sidakService.createPeriod(
    parsed.data.month,
    parsed.data.year,
  );
  await logActivity({
    user_id: c.get("user").id,
    user_name: c.get("user").email ?? "",
    action: `Membuat Periode: ${period.label}`,
    module: "SIDAK",
    type: "add",
  });
  return c.json({ success: true, data: period }, 201);
});

sidakCore.delete(
  "/periods/:id",
  requireCapability("sidak.write"),
  async (c) => {
    const id = c.req.param("id");
    try {
      const period = await sidakService.deletePeriod(id);
      await logActivity({
        user_id: c.get("user").id,
        user_name: c.get("user").email ?? "",
        action: `Menghapus Periode ID: ${id}`,
        module: "SIDAK",
        type: "delete",
      });
      return c.json({ success: true, data: period });
    } catch (e: any) {
      if (e instanceof ScopeUnavailableError) throw e;
      return c.json(
        {
          success: false,
          error: { code: "DELETE_ERROR", message: e.message },
        },
        400,
      );
    }
  },
);

// ── Resolved Input Config ──────────────────────────────
sidakCore.get(
  "/resolved-input-config",
  requireCapability("sidak.config.read"),
  async (c) => {
    const serviceType = c.req.query("service_type");
    const periodId = c.req.query("period_id");

    const parsedService = serviceTypeSchema.safeParse(serviceType);
    if (!parsedService.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Tipe layanan tidak valid",
          },
        },
        400,
      );
    }

    if (periodId && !z.string().uuid().safeParse(periodId).success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Period ID tidak valid",
          },
        },
        400,
      );
    }

    try {
      const config = await sidakService.getResolvedInputConfig(
        parsedService.data,
        periodId || undefined,
      );
      return c.json({ success: true, data: config });
    } catch (e: any) {
      if (e instanceof ScopeUnavailableError) throw e;
      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: e.message,
          },
        },
        500,
      );
    }
  },
);

// ── Indicators ─────────────────────────────────────────
sidakCore.get(
  "/indicators",
  requireCapability("sidak.config.read"),
  async (c) => {
    const serviceType = c.req.query("service_type");
    const indicators = await sidakService.getIndicators(serviceType);
    return c.json({ success: true, data: indicators });
  },
);

sidakCore.post("/indicators", requireCapability("sidak.write"), async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      service_type: z.enum([
        "call",
        "chat",
        "email",
        "cso",
        "pencatatan",
        "bko",
        "slik",
      ]),
      name: z.string().min(1),
      parameter_group: z.string().trim().min(1).nullable().optional(),
      category: z.enum(["critical", "non_critical", "none"]),
      bobot: z.number().positive(),
      has_na: z.boolean().optional().default(false),
      sort_order: z.number().int().optional().default(0),
    })
    .safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Data indikator tidak valid",
          details: parsed.error,
        },
      },
      400,
    );
  }
  const indicator = await sidakService.createIndicator(parsed.data as any);
  return c.json({ success: true, data: indicator }, 201);
});

// ── Folders ────────────────────────────────────────────
sidakCore.get("/folders", requireCapability("sidak.read"), async (c) => {
  const filterScope = await resolveSidakFilterScope(c);
  if (filterScope) {
    return c.json({ success: true, data: filterScope.allowedFolders });
  }
  const folders = await sidakService.getAllFolders();
  return c.json({ success: true, data: folders });
});

// ── Agents by Folder ────────────────────────────────────
sidakCore.get(
  "/folders/:folder/agents",
  requireCapability("sidak.read"),
  async (c) => {
    const folder = c.req.param("folder");
    const filterScope = await resolveSidakFilterScope(c);

    if (filterScope) {
      const isAllowed = filterScope.allowedFolders.some(
        (f) => f.name === folder,
      );
      if (!isAllowed) {
        return c.json({ success: true, data: [] });
      }
    }

    const result = await sidakService.getAgentsByFolder(folder, filterScope);
    return c.json({ success: true, data: result });
  },
);

export { sidakCore };
