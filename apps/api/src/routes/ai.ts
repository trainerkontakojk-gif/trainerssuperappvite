import { can, normalizeRole } from "@trainers/types";
import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { AI_MODELS, getModelsForModule } from "../lib/ai-models";
import type { AiModelModule } from "@trainers/types";
import { requireCapability } from "../middleware/role";
import { createAdminClient } from "../lib/supabase";
import { getWibMonthBounds } from "../lib/timezone";
import {
  assertSessionInScope,
  listMonitoringSessions,
  resolveMonitoringScope,
  scopedUsageUserIds,
} from "../services/monitoring-sessions-service";
import {
  getMonitoringReviewDetail,
  MonitoringReviewDataError,
  MonitoringReviewNotFoundError,
} from "../services/monitoring-review-service";
import { getAiUsageSummary } from "../services/ai-usage-summary-service";
import { getBillingRate, upsertBillingRate } from "../lib/ai-billing-settings";
import {
  deleteMonitoringHistory,
  MonitoringHistoryDeleteError,
} from "../services/monitoring-history-delete-service";

import { isUsageActionInCategory } from "../lib/ai-usage-categories";
import { pricingUpsertSchema } from "../lib/pricing-contract";
import {
  cancelPricingSchedule,
  listPricing,
  PricingError,
  savePricing,
} from "../services/ai-pricing-service";

type Variables = { user: User; profile: any };

const ai = new Hono<{ Variables: Variables }>();
const monitoringHistoryModuleSchema = z.enum(["ketik", "pdkt", "telefun"]);
const monitoringHistoryIdSchema = z.string().uuid();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monitoringHistoryQuerySchema = z.object({
  module: monitoringHistoryModuleSchema.optional(),
  status: z.enum(["completed", "processing", "failed", "not_started"]).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

function monitoringActor(c: Context<{ Variables: Variables }>) {
  return { id: c.get("user").id, role: normalizeRole(c.get("profile")?.role) };
}

function canSignCrossUserRecording(profile: any): boolean {
  return can(profile?.role, "monitoring.recording.sign");
}

const DB_ERROR_MESSAGE = "Data belum bisa dimuat. Coba lagi beberapa saat lagi.";

/** Detail database hanya masuk log server; pengguna menerima pesan yang ramah. */
function dbErrorResponse(
  c: Context,
  scope: string,
  error: unknown,
  message = DB_ERROR_MESSAGE,
) {
  console.error(
    `[ai] ${scope} failed`,
    error instanceof Error ? error.message : (error as { message?: string })?.message,
  );
  return c.json(
    { success: false as const, error: { code: "DB_ERROR", message } },
    500,
  );
}

ai.get("/models", requireCapability("ai.models.read"), (c) => {
  const module = c.req.query("module") as AiModelModule | undefined;
  const models = module ? getModelsForModule(module) : AI_MODELS;
  return c.json({ success: true, data: models });
});

// ── My Usage (own logs) ─────────────────────────────────
ai.get("/usage", requireCapability("usage.read"), async (c) => {
  const user = c.get("user");
  const userId = user?.id;

  const admin = createAdminClient();
  const module = c.req.query("module");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  let query = admin
    .from("ai_usage_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));

  if (module) query = query.eq("module", module);

  const { data, error } = await query;
  if (error) return dbErrorResponse(c, "usage", error);
  return c.json({ success: true, data });
});

ai.get("/usage/summary", requireCapability("usage.read"), async (c) => {
  const user = c.get("user");
  const userId = user?.id;
  const moduleParam = c.req.query("module") || "pdkt";

  const admin = createAdminClient();

  const now = new Date();
  const wibTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = wibTime.getUTCFullYear();
  const month = wibTime.getUTCMonth() + 1;

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  start.setUTCHours(start.getUTCHours() - 7);

  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  end.setUTCHours(end.getUTCHours() - 7);

  try {
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];
    const startMonth = months[month - 1];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const periodLabel = `1 ${startMonth} ${year} - ${lastDay} ${startMonth} ${year} WIB`;

    const summary = await getAiUsageSummary({
      admin,
      userId,
      module: moduleParam,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      year,
      month,
      periodLabel,
    });

    return c.json({ success: true, data: summary });
  } catch (error) {
    return dbErrorResponse(c, "usage/summary", error);
  }
});

// ── Monitoring History ──────────────────────────────
ai.get(
  "/monitoring/history",
  requireCapability("monitoring.read"),
  zValidator("query", monitoringHistoryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false as const,
          error: { code: "BAD_REQUEST", message: "Filter riwayat tidak valid." },
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const scope = await resolveMonitoringScope(monitoringActor(c));
      const data = await listMonitoringSessions(c.req.valid("query"), scope);
      return c.json({ success: true, data });
    } catch (error) {
      return dbErrorResponse(
        c,
        "monitoring/history",
        error,
        "Gagal memuat riwayat monitoring.",
      );
    }
  },
);

// ── Monitoring Review Detail (admin-only, cross-user) ──
ai.get(
  "/monitoring/history/:module/:id/review",
  requireCapability("monitoring.read"),
  async (c) => {
    const parsedModule = monitoringHistoryModuleSchema.safeParse(
      c.req.param("module"),
    );
    const parsedId = monitoringHistoryIdSchema.safeParse(c.req.param("id"));

    if (!parsedModule.success || !parsedId.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: !parsedModule.success
              ? `Modul tidak dikenal: ${c.req.param("module")}`
              : "ID sesi tidak valid.",
          },
        },
        400,
      );
    }

    try {
      await assertSessionInScope(
        parsedModule.data,
        parsedId.data,
        await resolveMonitoringScope(monitoringActor(c)),
      );
      const data = await getMonitoringReviewDetail({
        module: parsedModule.data,
        historyId: parsedId.data,
        canSignTelefunRecording: canSignCrossUserRecording(c.get("profile")),
      });
      return c.json({ success: true, data });
    } catch (error) {
      if (error instanceof MonitoringReviewNotFoundError) {
        return c.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: error.message },
          },
          404,
        );
      }
      if (error instanceof MonitoringReviewDataError) {
        return c.json(
          {
            success: false,
            error: { code: "DB_ERROR", message: error.message },
          },
          500,
        );
      }
      return c.json(
        {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Gagal memuat detail review monitoring.",
          },
        },
        500,
      );
    }
  },
);

// ── Monitoring Delete History ──────────────────────────
ai.delete(
  "/monitoring/history/:module/:id",
  requireCapability("monitoring.history.delete"),
  async (c) => {
    const { module, id } = c.req.param();

    const parsedModule = monitoringHistoryModuleSchema.safeParse(module);
    const parsedId = monitoringHistoryIdSchema.safeParse(id);

    if (!parsedModule.success || !parsedId.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: !parsedModule.success
              ? `Modul tidak dikenal: ${module}`
              : "ID riwayat tidak valid.",
          },
        },
        400,
      );
    }

    try {
      await deleteMonitoringHistory(parsedModule.data, parsedId.data);
      return c.json({ success: true, data: null });
    } catch (error: unknown) {
      if (error instanceof MonitoringHistoryDeleteError) {
        if (error.code === "NOT_FOUND") {
          return c.json(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: error.message,
              },
            },
            404,
          );
        }

        return c.json(
          {
            success: false,
            error: {
              code: "DB_ERROR",
              message: error.message,
            },
          },
          500,
        );
      }

      return c.json(
        {
          success: false,
          error: {
            code: "DB_ERROR",
            message: "Gagal menghapus riwayat.",
          },
        },
        500,
      );
    }
  },
);

// ── Usage Aggregation ──────────────────────────────────
const AGGREGATION_PAGE_SIZE = 1000;
const aggregationQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  module: z
    .enum(["ketik", "pdkt", "telefun", "qa-analyzer"])
    .or(z.literal("").transform(() => undefined))
    .optional(),
  action_category: z.enum(["simulation", "review"]).optional(),
  /** Rincian satu orang (halaman Biaya AI per pengguna). */
  user_id: z.string().uuid().optional(),
});
type AggregationLogRow = {
  user_id: string;
  model_id: string;
  module: string;
  action: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_idr: number | null;
  final_cost_idr: number | null;
};

ai.get(
  "/monitoring/aggregation",
  requireCapability("monitoring.read"),
  async (c) => {
    const parsedQuery = aggregationQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Periode atau filter penggunaan tidak valid.",
          },
        },
        400,
      );
    }
    const now = new Date();
    const {
      year = now.getFullYear(),
      month = now.getMonth() + 1,
      module,
      action_category: actionCategory,
      user_id: userId,
    } = parsedQuery.data;

    let allowedUserIds: string[] | null;
    try {
      allowedUserIds = await scopedUsageUserIds(
        await resolveMonitoringScope(monitoringActor(c)),
      );
    } catch (error) {
      return dbErrorResponse(c, "aggregation", error);
    }
    if (userId) {
      if (allowedUserIds && !allowedUserIds.includes(userId))
        return c.json({ success: true, data: [] });
      allowedUserIds = [userId];
    }
    if (allowedUserIds?.length === 0) return c.json({ success: true, data: [] });

    const admin = createAdminClient();
    const { start: monthStart, end: monthEnd } = getWibMonthBounds(year, month);

    // Supabase memotong satu respons di batas baris (default 1000), jadi
    // bulan yang ramai dibaca per halaman sampai habis. Urutan naik supaya
    // baris baru yang masuk selama pembacaan jatuh di akhir, tidak menggeser
    // halaman yang sudah dibaca.
    const allLogs: AggregationLogRow[] = [];
    for (let from = 0; ; from += AGGREGATION_PAGE_SIZE) {
      let query = admin
        .from("ai_usage_logs")
        .select(
          "user_id, model_id, module, action, input_tokens, output_tokens, total_tokens, estimated_cost_idr, final_cost_idr",
        )
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      if (module) query = query.eq("module", module);
      if (allowedUserIds) query = query.in("user_id", allowedUserIds);

      const { data, error } = await query
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + AGGREGATION_PAGE_SIZE - 1);
      if (error) return dbErrorResponse(c, "aggregation", error);
      allLogs.push(...((data ?? []) as AggregationLogRow[]));
      if (!data || data.length < AGGREGATION_PAGE_SIZE) break;
    }

    let logs = allLogs;

    // Filter by action_category AFTER fetch (since action is a derived field)
    if (actionCategory === "simulation") {
      logs = logs.filter((l) =>
        isUsageActionInCategory(l.action, "simulation"),
      );
    } else if (actionCategory === "review") {
      logs = logs.filter((l) => isUsageActionInCategory(l.action, "review"));
    }

    if (logs.length === 0) return c.json({ success: true, data: [] });

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, role, full_name")
      .in("id", userIds);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p) => {
      profileMap[p.id] = p;
    });

    const userAgg: Record<string, any> = {};
    for (const log of logs) {
      if (!userAgg[log.user_id]) {
        userAgg[log.user_id] = {
          user_id: log.user_id,
          total_calls: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tokens: 0,
          total_cost_idr: 0,
          simulation_cost_idr: 0,
          review_cost_idr: 0,
          other_cost_idr: 0,
          models: {},
        };
      }
      const agg = userAgg[log.user_id];
      const cost = Number(log.final_cost_idr ?? log.estimated_cost_idr ?? 0);
      agg.total_calls += 1;
      agg.total_input_tokens += log.input_tokens || 0;
      agg.total_output_tokens += log.output_tokens || 0;
      agg.total_tokens += log.total_tokens || 0;
      agg.total_cost_idr += cost;

      if (isUsageActionInCategory(log.action, "simulation")) {
        agg.simulation_cost_idr += cost;
      } else if (isUsageActionInCategory(log.action, "review")) {
        agg.review_cost_idr += cost;
      } else {
        agg.other_cost_idr += cost;
      }

      const key = `${log.model_id}|${log.module}|${log.action}`;
      if (!agg.models[key])
        agg.models[key] = {
          model_id: log.model_id,
          module: log.module,
          action: log.action,
          action_category: isUsageActionInCategory(log.action, "simulation")
            ? "simulation"
            : isUsageActionInCategory(log.action, "review")
              ? "review"
              : "other",
          calls: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cost_idr: 0,
        };
      const m = agg.models[key];
      m.calls += 1;
      m.input_tokens += log.input_tokens || 0;
      m.output_tokens += log.output_tokens || 0;
      m.total_tokens += log.total_tokens || 0;
      m.cost_idr += cost;
    }

    const result = Object.values(userAgg).map((agg: any) => ({
      ...agg,
      user_email: profileMap[agg.user_id]?.email || null,
      user_name: profileMap[agg.user_id]?.full_name || null,
      user_role: profileMap[agg.user_id]?.role || null,
      models: Object.values(agg.models),
    }));

    return c.json({ success: true, data: result });
  },
);

// ── Pricing ───────────────────────────────────────────
const pricingSaveSchema = pricingUpsertSchema.extend({
  /** YYYY-MM-DD: schedule from 00.00 WIB that day instead of saving now. */
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function pricingErrorResponse(c: Context, scope: string, error: unknown) {
  if (error instanceof PricingError) {
    return c.json(
      {
        success: false as const,
        error: { code: error.code, message: error.message },
      },
      error.status,
    );
  }
  return dbErrorResponse(c, scope, error, "Harga belum tersimpan. Coba lagi.");
}

ai.get(
  "/monitoring/pricing",
  requireCapability("monitoring.pricing.read"),
  async (c) => {
    try {
      const data = await listPricing(createAdminClient());
      return c.json({ success: true, data });
    } catch (error) {
      return dbErrorResponse(c, "monitoring/pricing", error);
    }
  },
);

ai.put(
  "/monitoring/pricing",
  requireCapability("monitoring.pricing.write"),
  zValidator("json", pricingSaveSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Harga atau tanggal mulai tidak valid.",
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { effective_from: effectiveFrom, ...body } = c.req.valid("json");
    try {
      await savePricing(createAdminClient(), body, {
        effectiveFrom,
        userId: c.get("user").id,
      });
      return c.json({ success: true, data: null });
    } catch (error) {
      return pricingErrorResponse(c, "monitoring/pricing PUT", error);
    }
  },
);

ai.delete(
  "/monitoring/pricing/schedule/:id",
  requireCapability("monitoring.pricing.write"),
  async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: "ID jadwal tidak valid." },
        },
        400,
      );
    }
    try {
      await cancelPricingSchedule(createAdminClient(), id.data);
      return c.json({ success: true, data: null });
    } catch (error) {
      return pricingErrorResponse(c, "monitoring/pricing/schedule DELETE", error);
    }
  },
);

// ── Billing ───────────────────────────────────────────
ai.get(
  "/monitoring/billing",
  requireCapability("monitoring.billing.read"),
  async (c) => {
    const admin = createAdminClient();
    try {
      const usdToIdrRate = await getBillingRate(admin);
      return c.json({
        success: true,
        data: { usd_to_idr_rate: usdToIdrRate },
      });
    } catch (error) {
      return dbErrorResponse(c, "monitoring/billing", error);
    }
  },
);

const billingUpdateSchema = z.object({
  usd_to_idr_rate: z.number().min(1).max(100000),
});

ai.post(
  "/monitoring/billing",
  requireCapability("monitoring.billing.write"),
  zValidator("json", billingUpdateSchema),
  async (c) => {
    const body = c.req.valid("json");

    const admin = createAdminClient();
    try {
      await upsertBillingRate(admin, body.usd_to_idr_rate);
    } catch (error) {
      return dbErrorResponse(
        c,
        "monitoring/billing POST",
        error,
        "Kurs belum tersimpan. Coba lagi.",
      );
    }
    return c.json({ success: true, data: null });
  },
);

export { ai };
