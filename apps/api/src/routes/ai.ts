import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  TELEFUN_LIVE_MODELS,
  getHistoricalTelefunRealtimeModel,
  getModelsForModule,
  resolveModelProvider,
} from "../lib/ai-models";
import type { AiModelModule } from "@trainers/types";
import { generateGeminiContent } from "../lib/gemini";
import { generateOpenAIContent } from "../lib/openai";
import { requireRole } from "../middleware/role";
import { createAdminClient } from "../lib/supabase";
import { getWibMonthBounds } from "../lib/timezone";
import {
  getMonitoringHistory,
} from "../services/monitoring-history-service";
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
import {
  buildPricingUpsertPayload,
  isMissingRealtimePricingColumn,
  pricingUpsertSchema,
  REALTIME_PRICING_COLUMNS,
} from "../lib/pricing-contract";

type Variables = { user: User; profile: any };

const ai = new Hono<{ Variables: Variables }>();
const monitoringHistoryModuleSchema = z.enum(["ketik", "pdkt", "telefun"]);
const monitoringHistoryIdSchema = z.string().uuid();

function canSignCrossUserRecording(profile: any): boolean {
  return ["admin", "trainer"].includes(profile?.role);
}

ai.get("/models", (c) => {
  const module = c.req.query("module") as AiModelModule | undefined;
  const models = module ? getModelsForModule(module) : AI_MODELS;
  return c.json({ success: true, data: models });
});

const generateSchema = z.object({
  model: z.string().optional(),
  systemInstruction: z.string().optional(),
  prompt: z.string(),
  temperature: z.number().optional(),
  responseMimeType: z.string().optional(),
});

ai.post(
  "/generate",
  requireRole("admin", "trainer", "qa"),
  zValidator("json", generateSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    const { modelId, provider } = resolveModelProvider(
      body.model || DEFAULT_AI_MODEL_ID,
    );

    const callPayload = {
      model: modelId,
      systemInstruction: body.systemInstruction,
      contents: [{ role: "user" as const, parts: [{ text: body.prompt }] }],
      temperature: body.temperature ?? 0.7,
      responseMimeType: body.responseMimeType,
      usageContext: { module: "ketik" as const, action: "ai_generate" },
      userId,
    };

    const response =
      provider === "openai"
        ? await generateOpenAIContent(callPayload)
        : await generateGeminiContent(callPayload);

    if (!response.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "AI_ERROR",
            message: response.error || "AI tidak tersedia.",
          },
        },
        502,
      );
    }

    return c.json({ success: true, data: { text: response.text } });
  },
);

// ── My Usage (own logs) ─────────────────────────────────
ai.get("/usage", async (c) => {
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
  if (error)
    return c.json(
      { success: false, error: { code: "DB_ERROR", message: error.message } },
      500,
    );
  return c.json({ success: true, data });
});

ai.get("/usage/summary", async (c) => {
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
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: error?.message || "Database error.",
        },
      },
      500,
    );
  }
});

// ── Monitoring History ──────────────────────────────
ai.get(
  "/monitoring/history",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    try {
      const data = await getMonitoringHistory();
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DB_ERROR",
            message: error?.message || "Gagal memuat riwayat monitoring.",
          },
        },
        500,
      );
    }
  },
);

// ── Monitoring Review Detail (admin-only, cross-user) ──
ai.get(
  "/monitoring/history/:module/:id/review",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const parsedModule = monitoringHistoryModuleSchema.safeParse(c.req.param("module"));
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
  requireRole("admin", "trainer"),
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
ai.get(
  "/monitoring/aggregation",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const admin = createAdminClient();
    const year = parseInt(
      c.req.query("year") || String(new Date().getFullYear()),
      10,
    );
    const month = parseInt(
      c.req.query("month") || String(new Date().getMonth() + 1),
      10,
    );
    const module = c.req.query("module");
    const actionCategory = c.req.query("action_category") as
      | "simulation"
      | "review"
      | undefined;

    const { start: monthStart, end: monthEnd } = getWibMonthBounds(year, month);

    let query = admin
      .from("ai_usage_logs")
      .select(
        "user_id, model_id, module, action, input_tokens, output_tokens, total_tokens, estimated_cost_idr, final_cost_idr",
      )
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd);

    if (module) query = query.eq("module", module);

    const { data: allLogs, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error)
      return c.json(
        { success: false, error: { code: "DB_ERROR", message: error.message } },
        500,
      );

    let logs = allLogs || [];

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

// ── Pricing CRUD ──────────────────────────────────────
const LEGACY_PRICING_SELECT =
  "model_id, input_price_usd_per_million, output_price_usd_per_million";
const EXPANDED_PRICING_SELECT = `${LEGACY_PRICING_SELECT}, ${REALTIME_PRICING_COLUMNS.join(", ")}`;
type PricingDatabaseRow = {
  model_id: string;
  input_price_usd_per_million: number | null;
  output_price_usd_per_million: number | null;
} & Partial<Record<(typeof REALTIME_PRICING_COLUMNS)[number], number | null>>;

ai.get("/monitoring/pricing", requireRole("admin", "trainer"), async (c) => {
  const admin = createAdminClient();
  let pricingResult = (await admin
    .from("ai_pricing_settings")
    .select(EXPANDED_PRICING_SELECT)
    .order("model_id", { ascending: true })) as unknown as {
    data: PricingDatabaseRow[] | null;
    error: { code?: string; message?: string } | null;
  };

  if (
    pricingResult.error &&
    isMissingRealtimePricingColumn(pricingResult.error)
  ) {
    pricingResult = (await admin
      .from("ai_pricing_settings")
      .select(LEGACY_PRICING_SELECT)
      .order("model_id", {
        ascending: true,
      })) as unknown as typeof pricingResult;
  }

  const { data, error } = pricingResult;

  if (error)
    return c.json(
      { success: false, error: { code: "DB_ERROR", message: error.message } },
      500,
    );

  const dbPricing: Array<
    PricingDatabaseRow & {
      input_price_usd_per_million: number;
      output_price_usd_per_million: number;
    }
  > = (data || []).map(
    (r) =>
      ({
        model_id: r.model_id,
        input_price_usd_per_million: r.input_price_usd_per_million ?? 0,
        output_price_usd_per_million: r.output_price_usd_per_million ?? 0,
        ...Object.fromEntries(
          REALTIME_PRICING_COLUMNS.map((column) => [column, r[column] ?? null]),
        ),
      }) as PricingDatabaseRow & {
        input_price_usd_per_million: number;
        output_price_usd_per_million: number;
      },
  );

  const pricingMap = new Map(dbPricing.map((p) => [p.model_id, p]));
  const pricingModels = [...AI_MODELS, ...TELEFUN_LIVE_MODELS].filter(
    (model, index, models) =>
      models.findIndex((candidate) => candidate.id === model.id) === index,
  );
  const result: Array<{
    model_id: string;
    model_name: string;
    provider: string;
    pricing_mode: "simple" | "realtime";
    input_price_usd_per_million: number;
    output_price_usd_per_million: number;
    [key: string]: unknown;
  }> = pricingModels.map((m) => ({
    model_id: m.id,
    model_name: m.name,
    provider: m.provider,
    pricing_mode: m.realtime ? ("realtime" as const) : ("simple" as const),
    input_price_usd_per_million:
      pricingMap.get(m.id)?.input_price_usd_per_million ?? 0,
    output_price_usd_per_million:
      pricingMap.get(m.id)?.output_price_usd_per_million ?? 0,
    ...Object.fromEntries(
      REALTIME_PRICING_COLUMNS.map((column) => [
        column,
        pricingMap.get(m.id)?.[column] ?? null,
      ]),
    ),
  }));

  for (const p of dbPricing) {
    if (result.some((r) => r.model_id === p.model_id)) continue;

    const historicalModel = getHistoricalTelefunRealtimeModel(p.model_id);
    if (historicalModel) {
      result.push({
        model_id: historicalModel.id,
        model_name: historicalModel.name,
        provider: historicalModel.provider,
        pricing_mode: "realtime" as const,
        historical: true,
        editable: false,
        input_price_usd_per_million: p.input_price_usd_per_million,
        output_price_usd_per_million: p.output_price_usd_per_million,
        ...Object.fromEntries(
          REALTIME_PRICING_COLUMNS.map((column) => [column, p[column] ?? null]),
        ),
      });
      continue;
    }

    result.push({
      model_id: p.model_id,
      model_name: p.model_id,
      provider: "unknown" as const,
      pricing_mode: "simple" as const,
      input_price_usd_per_million: p.input_price_usd_per_million,
      output_price_usd_per_million: p.output_price_usd_per_million,
      ...Object.fromEntries(
        REALTIME_PRICING_COLUMNS.map((column) => [column, p[column] ?? null]),
      ),
    });
  }

  return c.json({ success: true, data: result });
});

ai.put(
  "/monitoring/pricing",
  requireRole("admin", "trainer"),
  zValidator("json", pricingUpsertSchema),
  async (c) => {
    const body = c.req.valid("json");
    if (getHistoricalTelefunRealtimeModel(body.model_id)) {
      return c.json(
        {
          success: false,
          error: {
            code: "TELEFUN_REALTIME_MODEL_RETIRED",
            message:
              "Harga model realtime OpenAI Telefun hanya tersedia untuk riwayat.",
          },
        },
        410,
      );
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("ai_pricing_settings")
      .upsert(buildPricingUpsertPayload(body, new Date().toISOString()), {
        onConflict: "model_id",
      });

    if (error)
      return c.json(
        { success: false, error: { code: "DB_ERROR", message: error.message } },
        500,
      );
    return c.json({ success: true, data: null });
  },
);

// ── Billing ───────────────────────────────────────────
ai.get("/monitoring/billing", requireRole("admin", "trainer"), async (c) => {
  const admin = createAdminClient();
  try {
    const usdToIdrRate = await getBillingRate(admin);
    return c.json({
      success: true,
      data: { usd_to_idr_rate: usdToIdrRate },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: { code: "DB_ERROR", message: error?.message || "DB error." },
      },
      500,
    );
  }
});

const billingUpdateSchema = z.object({
  usd_to_idr_rate: z.number().min(1).max(100000),
});

ai.post(
  "/monitoring/billing",
  requireRole("admin", "trainer"),
  zValidator("json", billingUpdateSchema),
  async (c) => {
    const body = c.req.valid("json");

    const admin = createAdminClient();
    try {
      await upsertBillingRate(admin, body.usd_to_idr_rate);
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "DB_ERROR", message: error?.message || "DB error." },
        },
        500,
      );
    }
    return c.json({ success: true, data: null });
  },
);

export { ai };
