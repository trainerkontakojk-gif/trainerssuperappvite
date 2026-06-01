import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import {
  AI_MODELS,
  getModelsForModule,
  resolveModelProvider,
} from "../lib/ai-models";
import type { AiModelModule } from "@trainers/types";
import { generateGeminiContent } from "../lib/gemini";
import { generateOpenRouterContent } from "../lib/openrouter";
import { requireRole } from "../middleware/role";
import { createAdminClient } from "../lib/supabase";
import { getWibMonthBounds } from "../lib/timezone";
import { getMonitoringHistory } from "../services/monitoring-history-service";

const SIMULATION_ACTIONS = new Set([
  "chat_response",
  "ai_generate",
  "generate_consumer_response",
  "session_timeout",
  "init_email",
  "generate_template",
  "voice_live",
]);

const REVIEW_ACTIONS = new Set([
  "coaching_review",
  "evaluate_response",
  "voice_assessment",
  "coaching_summary",
]);

type Variables = { user: User; profile: any };

const ai = new Hono<{ Variables: Variables }>();

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

type UsageCategory = "simulation" | "review" | "uncategorized";

interface UsageBreakdownItem {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costIdr: number;
  costUsd: number;
}

interface UsageBreakdown {
  simulation: UsageBreakdownItem;
  review: UsageBreakdownItem;
  uncategorized: UsageBreakdownItem;
}

function emptyUsageBreakdownItem(): UsageBreakdownItem {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costIdr: 0,
    costUsd: 0,
  };
}

function resolveUsageCategory(action: string): UsageCategory {
  if (SIMULATION_ACTIONS.has(action)) return "simulation";
  if (REVIEW_ACTIONS.has(action)) return "review";
  return "uncategorized";
}

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
        "action, input_tokens, output_tokens, total_tokens, estimated_cost_usd, estimated_cost_idr",
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
    const startMonth = months[month - 1];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const periodLabel = `1 ${startMonth} ${year} - ${lastDay} ${startMonth} ${year} WIB`;

    let totalCalls = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let totalCostIdr = 0;
    let simulationCostIdr = 0;
    let reviewCostIdr = 0;

    const breakdown: UsageBreakdown = {
      simulation: emptyUsageBreakdownItem(),
      review: emptyUsageBreakdownItem(),
      uncategorized: emptyUsageBreakdownItem(),
    };

    if (logs) {
      totalCalls = logs.length;
      for (const log of logs) {
        totalInputTokens += log.input_tokens || 0;
        totalOutputTokens += log.output_tokens || 0;
        totalTokens += log.total_tokens || 0;
        totalCostUsd += Number(log.estimated_cost_usd || 0);
        totalCostIdr += Number(log.estimated_cost_idr || 0);

        const category = resolveUsageCategory(log.action);
        const bucket = breakdown[category];
        bucket.calls += 1;
        bucket.inputTokens += log.input_tokens || 0;
        bucket.outputTokens += log.output_tokens || 0;
        bucket.totalTokens += log.total_tokens || 0;
        bucket.costUsd += Number(log.estimated_cost_usd || 0);
        bucket.costIdr += Number(log.estimated_cost_idr || 0);

        const cost = Number(log.estimated_cost_idr || 0);
        if (SIMULATION_ACTIONS.has(log.action)) {
          simulationCostIdr += cost;
        } else if (REVIEW_ACTIONS.has(log.action)) {
          reviewCostIdr += cost;
        }
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
        simulationCostIdr,
        reviewCostIdr,
        breakdown,
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

// ── Monitoring Review Detail (admin-only, cross-user) ──
ai.get(
  "/monitoring/history/:module/:id/review",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const { module, id } = c.req.param();
    const admin = createAdminClient();

    try {
      if (module === "ketik") {
        const { data: history, error: historyError } = await admin
          .from("ketik_history")
          .select(
            "review_status, final_score, empathy_score, probing_score, typo_score, compliance_score",
          )
          .eq("id", id)
          .single();

        if (historyError || !history) {
          return c.json(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Sesi KETIK tidak ditemukan.",
              },
            },
            404,
          );
        }

        if (history.review_status !== "completed") {
          return c.json({
            success: true,
            data: {
              module: "ketik",
              review_status: history.review_status || "not_started",
              scores: {
                final: history.final_score,
                empathy: history.empathy_score,
                probing: history.probing_score,
                typo: history.typo_score,
                compliance: history.compliance_score,
              },
            },
          });
        }

        const [{ data: reviewData }, { data: typosData }] = await Promise.all([
          admin
            .from("ketik_session_reviews")
            .select("*")
            .eq("session_id", id)
            .maybeSingle(),
          admin
            .from("ketik_typo_findings")
            .select("*")
            .eq("session_id", id),
        ]);

        return c.json({
          success: true,
          data: {
            module: "ketik",
            review_status: "completed",
            scores: {
              final: history.final_score,
              empathy: history.empathy_score,
              probing: history.probing_score,
              typo: history.typo_score,
              compliance: history.compliance_score,
            },
            review: reviewData
              ? {
                  id: reviewData.id,
                  sessionId: reviewData.session_id,
                  aiSummary: reviewData.ai_summary,
                  strengths: reviewData.strengths,
                  weaknesses: reviewData.weaknesses,
                  coachingFocus: reviewData.coaching_focus,
                  createdAt: reviewData.created_at,
                }
              : null,
            typos: (typosData || []).map((t: any) => ({
              id: t.id,
              sessionId: t.session_id,
              messageId: t.message_id,
              originalWord: t.original_word,
              correctedWord: t.corrected_word,
              severity: t.severity,
            })),
          },
        });
      }

      if (module === "pdkt") {
        const { data: history, error: historyError } = await admin
          .from("pdkt_history")
          .select(
            "evaluation, evaluation_status, evaluation_error, time_taken, emails, config",
          )
          .eq("id", id)
          .single();

        if (historyError || !history) {
          return c.json(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Sesi PDKT tidak ditemukan.",
              },
            },
            404,
          );
        }

        return c.json({
          success: true,
          data: {
            module: "pdkt",
            review_status: history.evaluation_status || "not_started",
            evaluation: history.evaluation || null,
            evaluation_error: history.evaluation_error || null,
            time_taken: history.time_taken || null,
            emails: Array.isArray(history.emails) ? history.emails : [],
          },
        });
      }

      if (module === "telefun") {
        const { data: history, error: historyError } = await admin
          .from("telefun_history")
          .select("score, recording_path, scenario_title, duration_seconds, voice_assessment, ai_summary, strengths, weaknesses, coaching_focus")
          .eq("id", id)
          .single();

        if (historyError || !history) {
          return c.json(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "Sesi Telefun tidak ditemukan.",
              },
            },
            404,
          );
        }

        const voiceAssessment = history.voice_assessment;
        const normalizedScore =
          voiceAssessment && typeof voiceAssessment === "object" && typeof voiceAssessment.overallScore === "number"
            ? voiceAssessment.overallScore
            : history.score;

        return c.json({
          success: true,
          data: {
            module: "telefun",
            review_status:
              typeof normalizedScore === "number" ? "completed" : "not_started",
            score: normalizedScore,
            recording_path: history.recording_path,
            scenario_title: history.scenario_title,
            duration_seconds: history.duration_seconds,
            voice_assessment: voiceAssessment || null,
            ai_summary: history.ai_summary || null,
            strengths: history.strengths || null,
            weaknesses: history.weaknesses || null,
            coaching_focus: history.coaching_focus || null,
          },
        });
      }

      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: `Modul tidak dikenal: ${module}`,
          },
        },
        400,
      );
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DB_ERROR",
            message:
              error?.message || "Gagal memuat detail review monitoring.",
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
    const admin = createAdminClient();

    try {
      if (module === "ketik") {
        await admin.from("ketik_session_reviews").delete().eq("session_id", id);
        await admin.from("ketik_typo_findings").delete().eq("session_id", id);
        const { error } = await admin.from("ketik_history").delete().eq("id", id);
        if (error) throw error;
      } else if (module === "pdkt") {
        const { error } = await admin.from("pdkt_history").delete().eq("id", id);
        if (error) throw error;
      } else if (module === "telefun") {
        await admin.from("telefun_coaching_summaries").delete().eq("session_id", id);
        await admin.from("telefun_replay_annotations").delete().eq("session_id", id);
        await admin.from("telefun_history").delete().eq("id", id);
        await admin.from("results").delete().eq("id", id);
      } else {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: `Modul tidak dikenal: ${module}`,
            },
          },
          400,
        );
      }

      return c.json({ success: true, data: null });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DB_ERROR",
            message: error?.message || "Gagal menghapus riwayat.",
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
        "user_id, model_id, module, action, input_tokens, output_tokens, total_tokens, estimated_cost_idr",
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
      logs = logs.filter((l) => SIMULATION_ACTIONS.has(l.action));
    } else if (actionCategory === "review") {
      logs = logs.filter((l) => REVIEW_ACTIONS.has(l.action));
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
      const cost = log.estimated_cost_idr || 0;
      agg.total_calls += 1;
      agg.total_input_tokens += log.input_tokens || 0;
      agg.total_output_tokens += log.output_tokens || 0;
      agg.total_tokens += log.total_tokens || 0;
      agg.total_cost_idr += cost;

      if (SIMULATION_ACTIONS.has(log.action)) {
        agg.simulation_cost_idr += cost;
      } else if (REVIEW_ACTIONS.has(log.action)) {
        agg.review_cost_idr += cost;
      }

      const key = `${log.model_id}|${log.module}|${log.action}`;
      if (!agg.models[key])
        agg.models[key] = {
          model_id: log.model_id,
          module: log.module,
          action: log.action,
          action_category: SIMULATION_ACTIONS.has(log.action)
            ? "simulation"
            : REVIEW_ACTIONS.has(log.action)
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
