import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import * as sidakService from "../../services/sidak-service";
import { logActivity } from "../../services/activity-log-service";
import { createTemuanBatchSchema } from "@trainers/types";

type Variables = { user: User; profile: any };

const sidakTemuan = new Hono<{ Variables: Variables }>();

// ── Temuan (Findings) ──────────────────────────────────
sidakTemuan.get("/temuan", requireRole("admin", "trainer", "leader"), async (c) => {
  const user = c.get("user");
  const profile = c.get("profile");
  const peserta_id = c.req.query("peserta_id");
  const period_id = c.req.query("period_id");
  const service_type = c.req.query("service_type");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 50;
  const offset = c.req.query("offset") ? parseInt(c.req.query("offset")!) : 0;

  const accessibleIds = await sidakService.getAccessibleAgentIds(
    user.id,
    profile?.role ?? "",
  );
  const result = await sidakService.getTemuan({
    peserta_id,
    period_id,
    service_type,
    limit,
    offset,
    agent_ids: accessibleIds ?? undefined,
  });
  return c.json({
    success: true,
    data: { items: result.data, total: result.total },
  });
});

sidakTemuan.post("/temuan/batch", requireRole("admin", "trainer"), async (c) => {
  const user = c.get("user");
  const profile = c.get("profile");
  const body = await c.req.json();
  const parsed = createTemuanBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Data temuan tidak valid",
          details: parsed.error,
        },
      },
      400,
    );
  }
  try {
    const result = await sidakService.createTemuanBatch(
      parsed.data,
      user.id,
      profile?.full_name ?? undefined,
    );
    return c.json({ success: true, data: result }, 201);
  } catch (e: any) {
    return c.json(
      { success: false, error: { code: "INSERT_ERROR", message: e.message } },
      400,
    );
  }
});

sidakTemuan.post(
  "/temuan/batch/preview",
  requireRole("admin", "trainer"),
  async (c) => {
    const body = await c.req.json();
    const parsed = createTemuanBatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data temuan tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const result = await sidakService.validateTemuanBatch(parsed.data);
      return c.json({ success: true, data: result });
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: e.message },
        },
        400,
      );
    }
  },
);

sidakTemuan.put("/temuan/:id", requireRole("admin", "trainer"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = z
    .object({
      nilai: z.number().int().min(0).max(3).optional(),
      ketidaksesuaian: z.string().nullable().optional(),
      sebaiknya: z.string().nullable().optional(),
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
    const result = await sidakService.updateTemuan(id, parsed.data);
    return c.json({ success: true, data: result });
  } catch (e: any) {
    return c.json(
      { success: false, error: { code: "UPDATE_ERROR", message: e.message } },
      400,
    );
  }
});

sidakTemuan.delete("/temuan/:id", requireRole("admin", "trainer"), async (c) => {
  const id = c.req.param("id");
  try {
    await sidakService.deleteTemuan(id);
    await logActivity({
      user_id: c.get("user").id,
      user_name: c.get("user").email ?? "",
      action: `Menghapus Temuan SIDAK ID: ${id}`,
      module: "SIDAK",
      type: "delete",
    });
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json(
      { success: false, error: { code: "DELETE_ERROR", message: e.message } },
      400,
    );
  }
});

sidakTemuan.post("/temuan/perfect-session", requireRole("admin", "trainer"), async (c) => {
  const user = c.get("user");
  const profile = c.get("profile");
  const body = await c.req.json();
  const parsed = z
    .object({
      peserta_id: z.string().uuid(),
      period_id: z.string().uuid(),
      service_type: z.string(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Data tidak valid" } },
      400,
    );
  }
  try {
    const result = await sidakService.createPerfectScoreSession(
      parsed.data.peserta_id,
      parsed.data.period_id,
      parsed.data.service_type as any,
    );
    await logActivity({
      user_id: user.id,
      user_name: user.email ?? profile?.full_name ?? "",
      action: `Input Sesi Tanpa Temuan SIDAK (phantom x5) untuk Peserta ID: ${parsed.data.peserta_id}`,
      module: "SIDAK",
      type: "add",
    });
    sidakService.refreshDashboardSummary(parsed.data.period_id, parsed.data.service_type).catch((err) => {
      console.error("Summary refresh failed:", err);
    });
    return c.json({ success: true, data: result }, 201);
  } catch (e: any) {
    return c.json(
      { success: false, error: { code: "CREATE_ERROR", message: e.message } },
      400,
    );
  }
});

export { sidakTemuan };
