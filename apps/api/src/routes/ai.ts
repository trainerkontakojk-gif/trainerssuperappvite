import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import {
  AI_MODELS,
  getModelsForModule,
  resolveModelProvider,
} from "../lib/ai-models";
import { generateGeminiContent } from "../lib/gemini";
import { generateOpenRouterContent } from "../lib/openrouter";
import { requireRole } from "../middleware/role";
import { createAdminClient } from "../lib/supabase";
import { getWibMonthBounds } from "../lib/timezone";
import { getMonitoringHistory } from "../services/monitoring-history-service";

type Variables = { user: User; profile: any };

const ai = new Hono<{ Variables: Variables }>();

ai.get("/models", (c) => {
  const module = c.req.query("module") as "ketik" | "pdkt" | undefined;
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
      body.model || "gemini-3.1-flash-lite",
    );
    const isOpenRouter = provider === "openrouter";

    const callPayload = {
      model: modelId,
      systemInstruction: body.systemInstruction,
      contents: [{ role: "user" as const, parts: [{ text: body.prompt }] }],
      temperature: body.temperature ?? 0.7,
      responseMimeType: body.responseMimeType,
      usageContext: { module: "ketik" as const, action: "ai_generate" },
      userId,
    };

    const response = isOpenRouter
      ? await generateOpenRouterContent(callPayload)
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
    const { data: logs, error } = await admin
      .from("ai_usage_logs")
      .select(
        "input_tokens, output_tokens, total_tokens, estimated_cost_usd, estimated_cost_idr",
      )
      .eq("user_id", userId)
      .eq("module", moduleParam)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    if (error) throw error;

    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ];
    const startDay = start.getUTCDate();
    const endDay = end.getUTCDate();
    const startMonth = months[month - 1];
    const periodLabel = `${startDay} ${startMonth} ${year} - ${endDay} ${startMonth} ${year} WIB`;

    let totalCalls = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let totalCostIdr = 0;

    if (logs) {
      totalCalls = logs.length;
      for (const log of logs) {
        totalInputTokens += log.input_tokens || 0;
        totalOutputTokens += log.output_tokens || 0;
        totalTokens += log.total_tokens || 0;
        totalCostUsd += Number(log.estimated_cost_usd || 0);
        totalCostIdr += Number(log.estimated_cost_idr || 0);
      }
    }

    return c.json({
      success: true,
      data: {
        module: moduleParam,
        year,
        month,
        periodLabel,
        totalCalls,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        totalCostUsd,
        totalCostIdr,
      },
    });
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

    const { start: monthStart, end: monthEnd } = getWibMonthBounds(year, month);

    let query = admin
      .from("ai_usage_logs")
      .select(
        "user_id, model_id, module, input_tokens, output_tokens, total_tokens, estimated_cost_idr",
      )
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd);

    if (module) query = query.eq("module", module);

    const { data: logs, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error)
      return c.json(
        { success: false, error: { code: "DB_ERROR", message: error.message } },
        500,
      );

    if (!logs || logs.length === 0) return c.json({ success: true, data: [] });

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
          models: {},
        };
      }
      const agg = userAgg[log.user_id];
      agg.total_calls += 1;
      agg.total_input_tokens += log.input_tokens || 0;
      agg.total_output_tokens += log.output_tokens || 0;
      agg.total_tokens += log.total_tokens || 0;
      agg.total_cost_idr += log.estimated_cost_idr || 0;

      const key = `${log.model_id}|${log.module}`;
      if (!agg.models[key])
        agg.models[key] = {
          model_id: log.model_id,
          module: log.module,
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
      m.cost_idr += log.estimated_cost_idr || 0;
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
ai.get(
  "/monitoring/pricing",
  requireRole("admin", "trainer"),
  async (c) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_pricing_settings")
      .select(
        "model_id, input_price_usd_per_million, output_price_usd_per_million",
      )
      .order("model_id", { ascending: true });

    if (error)
      return c.json(
        { success: false, error: { code: "DB_ERROR", message: error.message } },
        500,
      );

    const dbPricing = (data || []).map((r) => ({
      model_id: r.model_id,
      input_price_usd_per_million: r.input_price_usd_per_million ?? 0,
      output_price_usd_per_million: r.output_price_usd_per_million ?? 0,
    }));

    const pricingMap = new Map(dbPricing.map((p) => [p.model_id, p]));
    const result = AI_MODELS.map((m) => ({
      model_id: m.id,
      model_name: m.name,
      provider: m.provider,
      input_price_usd_per_million:
        pricingMap.get(m.id)?.input_price_usd_per_million ?? 0,
      output_price_usd_per_million:
        pricingMap.get(m.id)?.output_price_usd_per_million ?? 0,
    }));

    for (const p of dbPricing) {
      if (!result.some((r) => r.model_id === p.model_id)) {
        result.push({
          model_id: p.model_id,
          model_name: p.model_id,
          provider: "gemini" as const,
          input_price_usd_per_million: p.input_price_usd_per_million,
          output_price_usd_per_million: p.output_price_usd_per_million,
        });
      }
    }

    return c.json({ success: true, data: result });
  },
);

const pricingUpsertSchema = z.object({
  model_id: z.string(),
  input_price_usd_per_million: z.number().min(0),
  output_price_usd_per_million: z.number().min(0),
});

ai.put(
  "/monitoring/pricing",
  requireRole("admin", "trainer"),
  zValidator("json", pricingUpsertSchema),
  async (c) => {
    const body = c.req.valid("json");

    const admin = createAdminClient();
    const { error } = await admin.from("ai_pricing_settings").upsert(
      {
        model_id: body.model_id,
        input_price_usd_per_million: body.input_price_usd_per_million,
        output_price_usd_per_million: body.output_price_usd_per_million,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "model_id" },
    );

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
  const { data, error } = await admin
    .from("ai_billing_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error)
    return c.json(
      { success: false, error: { code: "DB_ERROR", message: error.message } },
      500,
    );
  return c.json({
    success: true,
    data: { usd_to_idr_rate: data?.usd_to_idr_rate ?? 15000 },
  });
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
    const { error } = await admin
      .from("ai_billing_settings")
      .insert({ usd_to_idr_rate: body.usd_to_idr_rate });
    if (error)
      return c.json(
        { success: false, error: { code: "DB_ERROR", message: error.message } },
        500,
      );
    return c.json({ success: true, data: null });
  },
);

export { ai };
