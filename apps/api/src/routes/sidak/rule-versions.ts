import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import * as sidakService from "../../services/sidak-service";
import { logActivity } from "../../services/activity-log-service";

type Variables = { user: User; profile: any };

const sidakRuleVersions = new Hono<{ Variables: Variables }>();

// ── QA Rule Versions ────────────────────────────────────
sidakRuleVersions.get(
  "/rule-versions",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const serviceType = c.req.query("service_type");
    try {
      const versions = await sidakService.getRuleVersions(
        serviceType || undefined,
      );
      return c.json({ success: true, data: versions });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.get(
  "/rule-versions/meta",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const serviceType = c.req.query("service_type");
    if (
      !serviceType ||
      !["call", "chat", "email", "cso", "pencatatan", "bko", "slik"].includes(
        serviceType,
      )
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Service type tidak valid",
          },
        },
        400,
      );
    }
    const meta = await sidakService.getRuleVersionMeta(serviceType);
    return c.json({ success: true, data: meta });
  },
);

sidakRuleVersions.post(
  "/rule-versions",
  requireRole("admin", "trainer"),
  async (c) => {
    const user = c.get("user");
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
        effective_period_id: z.string().uuid().optional(),
        critical_weight: z.number().min(0).max(1).optional(),
        non_critical_weight: z.number().min(0).max(1).optional(),
        scoring_mode: z.enum(["weighted", "flat", "no_category"]).optional(),
        change_reason: z.string().optional(),
        source_version_id: z.string().uuid().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data versi aturan tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const version = await sidakService.createRuleVersion(
        parsed.data,
        user.id,
      );
      return c.json({ success: true, data: version }, 201);
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.put(
  "/rule-versions/:id",
  requireRole("admin", "trainer"),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = z
      .object({
        critical_weight: z.number().min(0).max(1).optional(),
        non_critical_weight: z.number().min(0).max(1).optional(),
        scoring_mode: z.enum(["weighted", "flat", "no_category"]).optional(),
        change_reason: z.string().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const version = await sidakService.updateRuleVersion(
        id,
        parsed.data,
        user.id,
      );
      return c.json({ success: true, data: version });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.delete(
  "/rule-versions/:id",
  requireRole("admin", "trainer"),
  async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    try {
      await sidakService.deleteRuleVersionDraft(id);
      await logActivity({
        user_id: user.id,
        user_name: user.email ?? "",
        action: `Menghapus draft QA Rule Version ID: ${id}`,
        module: "SIDAK",
        type: "delete",
      });
      return c.json({ success: true, message: "Draft berhasil dihapus" });
    } catch (error: any) {
      const isNotFound = error.message?.includes("tidak ditemukan");
      return c.json(
        {
          success: false,
          error: {
            code: isNotFound ? "NOT_FOUND" : "INTERNAL_ERROR",
            message: error.message,
          },
        },
        isNotFound ? 404 : 400,
      );
    }
  },
);

sidakRuleVersions.post(
  "/rule-versions/:id/publish",
  requireRole("admin", "trainer"),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = z
      .object({
        change_reason: z.string().optional(),
        effective_period_id: z.string().uuid().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const version = await sidakService.publishRuleVersion(
        id,
        user.id,
        parsed.data.change_reason,
        parsed.data.effective_period_id,
      );
      await logActivity({
        user_id: user.id,
        user_name: user.email ?? "",
        action: `Mempublikasi QA Rule Version ID: ${id}`,
        module: "SIDAK",
        type: "publish",
      });
      return c.json({ success: true, data: version });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.post(
  "/rule-versions/:id/supersede",
  requireRole("admin", "trainer"),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = z
      .object({
        change_reason: z.string().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const version = await sidakService.supersedeRuleVersion(
        id,
        user.id,
        parsed.data.change_reason,
      );
      await logActivity({
        user_id: user.id,
        user_name: user.email ?? "",
        action: `Superseding QA Rule Version ID: ${id}`,
        module: "SIDAK",
        type: "publish",
      });
      return c.json({ success: true, data: version });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.get(
  "/rule-versions/:id/indicators",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const id = c.req.param("id");
    try {
      const indicators = await sidakService.getRuleVersionIndicators(id);
      return c.json({ success: true, data: indicators });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.post(
  "/rule-versions/:id/indicators",
  requireRole("admin", "trainer"),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
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
        threshold: z.number().optional(),
        sort_order: z.number().int().optional().default(0),
        legacy_indicator_id: z.string().uuid().optional(),
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
    try {
      const indicator = await sidakService.addRuleVersionIndicator(
        { rule_version_id: id, ...parsed.data },
        user.id,
      );
      return c.json({ success: true, data: indicator }, 201);
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.delete(
  "/rule-versions/:versionId/indicators/:indicatorId",
  requireRole("admin", "trainer"),
  async (c) => {
    const indicatorId = c.req.param("indicatorId");
    const user = c.get("user");
    try {
      await sidakService.deleteRuleVersionIndicator(indicatorId);
      await logActivity({
        user_id: user.id,
        user_name: user.email ?? "",
        action: `Menghapus Rule Version Indicator ID: ${indicatorId}`,
        module: "SIDAK",
        type: "delete",
      });
      return c.json({ success: true, message: "Indikator berhasil dihapus" });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidakRuleVersions.put(
  "/rule-versions/:versionId/indicators/:indicatorId",
  requireRole("admin", "trainer"),
  async (c) => {
    const indicatorId = c.req.param("indicatorId");
    const body = await c.req.json();
    const parsed = z
      .object({
        name: z.string().min(1).optional(),
        parameter_group: z.string().trim().min(1).nullable().optional(),
        category: z.enum(["critical", "non_critical", "none"]).optional(),
        bobot: z.number().positive().optional(),
        has_na: z.boolean().optional(),
        threshold: z.number().optional(),
        sort_order: z.number().int().optional(),
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
    try {
      const indicator = await sidakService.updateRuleVersionIndicator(
        indicatorId,
        parsed.data,
      );
      return c.json({ success: true, data: indicator });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

export { sidakRuleVersions };
