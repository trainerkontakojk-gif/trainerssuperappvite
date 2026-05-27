import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../middleware/role";
import { aiRateLimitMiddleware } from "../middleware/rateLimit";
import * as sidakService from "../services/sidak-service";
import { logActivity } from "../services/activity-log-service";
import { createTemuanBatchSchema } from "@trainers/types";
import { buildAiReportDocx } from "../lib/report-docx-builder";
import { buildHtmlReport } from "../lib/report-html-builder";
import { buildAiReportPdf } from "../lib/report-pdf-builder";

type Variables = { user: User; profile: any };

const sidak = new Hono<{ Variables: Variables }>();

async function resolveSidakFilterScope(c: any): Promise<sidakService.SidakFilterScope | null> {
  const user = c.get("user");
  const profile = c.get("profile");
  return sidakService.getAccessibleSidakFilters(user.id, profile?.role ?? "");
}

// ── Periods ────────────────────────────────────────────
sidak.get("/periods", requireRole("admin", "trainer", "leader"), async (c) => {
  const periods = await sidakService.getPeriods();
  return c.json({ success: true, data: periods });
});

sidak.post("/periods", requireRole("admin", "trainer"), async (c) => {
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

sidak.delete("/periods/:id", requireRole("admin", "trainer"), async (c) => {
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
    return c.json(
      {
        success: false,
        error: { code: "DELETE_ERROR", message: e.message },
      },
      400,
    );
  }
});

// ── Indicators ─────────────────────────────────────────
sidak.get(
  "/indicators",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const serviceType = c.req.query("service_type");
    const indicators = await sidakService.getIndicators(serviceType);
    return c.json({ success: true, data: indicators });
  },
);

sidak.post("/indicators", requireRole("admin", "trainer"), async (c) => {
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
      category: z.enum(["critical", "non_critical", "none"]),
      bobot: z.number().positive(),
      has_na: z.boolean().optional().default(false),
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

// ── Temuan (Findings) ──────────────────────────────────
sidak.get("/temuan", requireRole("admin", "trainer", "leader"), async (c) => {
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

sidak.post("/temuan/batch", requireRole("admin", "trainer"), async (c) => {
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

sidak.post(
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

sidak.put("/temuan/:id", requireRole("admin", "trainer"), async (c) => {
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

sidak.delete("/temuan/:id", requireRole("admin", "trainer"), async (c) => {
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

sidak.post("/temuan/perfect-session", requireRole("admin", "trainer"), async (c) => {
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

// ── Agents ─────────────────────────────────────────────
sidak.get("/agents", requireRole("admin", "trainer", "leader"), async (c) => {
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

sidak.get(
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
sidak.get(
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

    const data = await sidakService.getDashboardData({
      period_ids,
      service_type,
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

sidak.post(
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

// ── Service Weights ────────────────────────────────────
sidak.get(
  "/service-weights",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const weights = await sidakService.getServiceWeights();
    return c.json({ success: true, data: weights });
  },
);

sidak.put(
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

// ── Folders ────────────────────────────────────────────
sidak.get("/folders", requireRole("admin", "trainer", "leader"), async (c) => {
  const filterScope = await resolveSidakFilterScope(c);
  if (filterScope) {
    return c.json({ success: true, data: filterScope.allowedFolders });
  }
  const { data } = await (await import("../lib/supabase")).supabaseAdmin
    .from("profiler_folders")
    .select("id, name")
    .order("name");
  return c.json({ success: true, data: data ?? [] });
});

// ── Agents by Folder ────────────────────────────────────
sidak.get(
  "/folders/:folder/agents",
  requireRole("admin", "trainer", "leader"),
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

    const { data } = await (await import("../lib/supabase")).supabaseAdmin
      .from("profiler_peserta")
      .select("id, nama")
      .eq("batch_name", folder)
      .order("nama");
    const result = data ?? [];
    if (filterScope && filterScope.agentIds.length > 0) {
      const idSet = new Set(filterScope.agentIds);
      return c.json({
        success: true,
        data: result.filter((a: any) => idSet.has(a.id)),
      });
    }
    return c.json({ success: true, data: result });
  },
);

// ── Ranking ──────────────────────────────────────────────
sidak.get(
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
      const { supabaseAdmin } = await import("../lib/supabase");

      const [dashboardData, periods, folders, availableYears] =
        await Promise.all([
          sidakService.getDashboardData({
            service_type,
            folder_ids: folder !== "ALL" ? [folder] : undefined,
            year,
            agent_ids: accessibleIds ?? undefined,
            allowedServiceTypes: filterScope?.allowedServices ?? undefined,
          }),
          sidakService.getPeriods(),
          supabaseAdmin.from("profiler_folders").select("id, name").order("name"),
          sidakService.getAvailableYears(accessibleIds ?? undefined),
        ]);

      const scopedFolders = filterScope
        ? filterScope.allowedFolders
        : (folders?.data ?? []).map((f: any) => ({ id: f.id, name: f.name }));

      const availableServices = filterScope && filterScope.serviceTypeLocked
        ? filterScope.allowedServices.filter((svc) =>
            dashboardData.availableServices.includes(svc),
          )
        : dashboardData.availableServices;

      return c.json({
        success: true,
        data: {
          rankings: dashboardData.topAgents,
          periods,
          folders: scopedFolders,
          availableYears,
          availableServices,
        },
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

// ── Reports ──────────────────────────────────────────────
sidak.post(
  "/reports/data",
  requireRole("admin", "trainer", "leader"),
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
      return c.json(
        { success: false, error: { code: "REPORT_ERROR", message: e.message } },
        400,
      );
    }
  },
);

sidak.post(
  "/reports/ai/generate",
  requireRole("admin", "trainer", "leader"),
  aiRateLimitMiddleware,
  async (c: any) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const body = await c.req.json();
    const parsed = z
      .object({
        modelId: z.string().optional(),
        serviceType: z.string().optional(),
        year: z.number().int().optional(),
        startMonth: z.number().int().min(1).max(12).optional(),
        endMonth: z.number().int().min(1).max(12).optional(),
        pesertaId: z.string().optional(),
        mode: z.enum(["layanan", "individu"]).default("layanan"),
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
      const accessibleIds = await sidakService.getAccessibleAgentIds(
        user.id,
        profile?.role ?? "",
      );
      const rows = await sidakService.getDataReportRows({
        serviceType: parsed.data.serviceType,
        year: parsed.data.year,
        startMonth: parsed.data.startMonth,
        endMonth: parsed.data.endMonth,
        pesertaId:
          parsed.data.mode === "individu" ? parsed.data.pesertaId : undefined,
        agent_ids: accessibleIds ?? undefined,
      });

      if (rows.length === 0) {
        return c.json(
          {
            success: false,
            error: {
              code: "NO_DATA",
              message: "Tidak ada data temuan untuk filter yang dipilih.",
            },
          },
          400,
        );
      }

      const totalFindings = rows.filter(
        (r) => (r.nilai ?? 3) < 3 || r.ketidaksesuaian,
      ).length;
      const agentName = rows[0]?.profiler_peserta?.nama ?? "Unknown";
      const serviceTypes = [...new Set(rows.map((r) => r.service_type))].join(
        ", ",
      );

      const { generateGeminiContent } = await import("../lib/gemini");
      const { generateOpenRouterContent } = await import("../lib/openrouter");
      const { resolveModelProvider } = await import("../lib/ai-models");

      const modelInfo = resolveModelProvider(parsed.data.modelId);
      const findingsSample = rows.slice(0, 20).map((r) => ({
        agent: r.profiler_peserta?.nama,
        service: r.service_type,
        parameter: r.qa_indicators?.name,
        nilai: r.nilai,
        ketidaksesuaian: r.ketidaksesuaian,
        sebaiknya: r.sebaiknya,
      }));

      const prompt = `Buat laporan analisis kualitas QA dalam Bahasa Indonesia berdasarkan data berikut.

PENTING: Gunakan HANYA data yang disediakan di bawah ini. Jangan pernah mengarang, menebak, atau menambahkan angka atau temuan yang tidak ada di data. Jika data tidak mencukupi, nyatakan dengan jujur bahwa data terbatas.

Periode: ${parsed.data.startMonth ? `${parsed.data.startMonth}-${parsed.data.endMonth ?? "?"}/${parsed.data.year}` : `${parsed.data.year || "Semua"}`}
Mode: ${parsed.data.mode}
${parsed.data.mode === "individu" ? `Nama Agen: ${agentName}` : `Tipe Layanan: ${serviceTypes}`}
Total Temuan: ${totalFindings}
Total Baris Data: ${rows.length}

Sample Data (20 baris pertama):
${JSON.stringify(findingsSample, null, 2)}

Buat laporan dengan format JSON:
{
  "executiveSummary": "Ringkasan eksekutif 2-3 paragraf",
  "keyFindings": ["Temuan penting 1", "Temuan penting 2", "Temuan penting 3"],
  "scoreAnalysis": "Analisis skor dan tren",
  "recommendations": ["Rekomendasi 1", "Rekomendasi 2", "Rekomendasi 3"],
  "priorityAreas": ["Area prioritas perbaikan 1", "Area prioritas perbaikan 2"]
}`;

      const contents = [{ role: "user", parts: [{ text: prompt }] }] as any;
      const genOptions = {
        model: modelInfo.modelId,
        contents,
        temperature: 0.5,
        usageContext: {
          module: "qa-analyzer" as const,
          action: "report_generation",
        },
        userId: user?.id,
      };

      const result =
        modelInfo.provider === "openrouter"
          ? await generateOpenRouterContent(genOptions)
          : await generateGeminiContent(genOptions);

      if (!result.success) {
        return c.json(
          {
            success: false,
            error: {
              code: "AI_ERROR",
              message: result.error || "Gagal generate laporan",
            },
          },
          500,
        );
      }

      let parsedReport;
      try {
        const cleaned = (result.text || "")
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, "");
        parsedReport = JSON.parse(cleaned);
      } catch {
        parsedReport = { executiveSummary: result.text };
      }

      return c.json({
        success: true,
        data: {
          report: parsedReport,
          metadata: {
            totalRows: rows.length,
            totalFindings,
            agentName: parsed.data.mode === "individu" ? agentName : undefined,
            serviceTypes,
          },
        },
      });
    } catch (e: any) {
      return c.json(
        { success: false, error: { code: "REPORT_ERROR", message: e.message } },
        500,
      );
    }
  },
);

sidak.get(
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

sidak.get(
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

// ── QA Rule Versions ────────────────────────────────────
sidak.get(
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

sidak.get(
  "/rule-versions/meta",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const serviceType = c.req.query("service_type");
    if (!serviceType || !["call", "chat", "email", "cso", "pencatatan", "bko", "slik"].includes(serviceType)) {
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Service type tidak valid" },
        },
        400,
      );
    }
    const meta = await sidakService.getRuleVersionMeta(serviceType);
    return c.json({ success: true, data: meta });
  },
);

sidak.post("/rule-versions", requireRole("admin", "trainer"), async (c) => {
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
      scoring_mode: z
        .enum(["weighted", "flat", "no_category"])
        .optional(),
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
    const version = await sidakService.createRuleVersion(parsed.data, user.id);
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
});

sidak.put("/rule-versions/:id", requireRole("admin", "trainer"), async (c) => {
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
});

sidak.post(
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

sidak.post(
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

sidak.get(
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

sidak.post(
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

sidak.delete(
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

sidak.put(
  "/rule-versions/:versionId/indicators/:indicatorId",
  requireRole("admin", "trainer"),
  async (c) => {
    const indicatorId = c.req.param("indicatorId");
    const body = await c.req.json();
    const parsed = z
      .object({
        name: z.string().min(1).optional(),
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

sidak.post(
  "/reports/ai/export-docx",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const body = await c.req.json();
    const parsed = z
      .object({
        title: z.string().default("Laporan Analisis QA"),
        periodLabel: z.string().default(""),
        serviceLabel: z.string().default(""),
        mode: z.enum(["layanan", "individu"]).default("layanan"),
        agentName: z.string().optional(),
        totalFindings: z.number().default(0),
        totalRows: z.number().default(0),
        executiveSummary: z.string().default(""),
        keyFindings: z.array(z.string()).default([]),
        scoreAnalysis: z.string().default(""),
        recommendations: z.array(z.string()).default([]),
        priorityAreas: z.array(z.string()).default([]),
        chartImages: z
          .object({
            pareto: z.string().nullable().optional(),
            donut: z.string().nullable().optional(),
            trend: z.string().nullable().optional(),
          })
          .optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data laporan tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const buf = await buildAiReportDocx(parsed.data);
      return c.newResponse(new Uint8Array(buf), 200, {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="laporan-ai-${Date.now()}.docx"`,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "EXPORT_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidak.post(
  "/reports/ai/export-html",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const body = await c.req.json();
    const parsed = z
      .object({
        title: z.string().default("Laporan Analisis QA"),
        periodLabel: z.string().default(""),
        serviceLabel: z.string().default(""),
        mode: z.enum(["layanan", "individu"]).default("layanan"),
        agentName: z.string().optional(),
        totalFindings: z.number().default(0),
        totalRows: z.number().default(0),
        executiveSummary: z.string().default(""),
        keyFindings: z.array(z.string()).default([]),
        scoreAnalysis: z.string().default(""),
        recommendations: z.array(z.string()).default([]),
        priorityAreas: z.array(z.string()).default([]),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data laporan tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const html = buildHtmlReport(parsed.data);
      return c.newResponse(html, 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="laporan-ai-${Date.now()}.html"`,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "EXPORT_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

sidak.post(
  "/reports/ai/chart-data",
  requireRole("admin", "trainer", "leader"),
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
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Filter tidak valid" },
        },
        400,
      );
    }
    const accessibleIds = await sidakService.getAccessibleAgentIds(
      user.id,
      profile?.role ?? "",
    );
    try {
      const chartData = await sidakService.getReportChartData({
        ...parsed.data,
        agent_ids: accessibleIds ?? undefined,
      });
      return c.json({ success: true, data: chartData });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "REPORT_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

// ── Report Archives ─────────────────────────────────
sidak.post(
  "/reports/ai/save",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = z
      .object({
        title: z.string().min(1),
        reportType: z.enum(["data", "ai"]).default("ai"),
        filterParams: z.record(z.unknown()).default({}),
        reportData: z.record(z.unknown()),
        reportHtml: z.string().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data report tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    const result = await sidakService.saveReportArchive({
      userId: user.id,
      title: parsed.data.title,
      reportType: parsed.data.reportType,
      filterParams: parsed.data.filterParams,
      reportData: parsed.data.reportData,
      reportHtml: parsed.data.reportHtml,
    });
    await logActivity({
      user_id: user.id,
      user_name: user.email ?? "",
      action: `Menyimpan Report SIDAK: ${parsed.data.title}`,
      module: "SIDAK",
      type: "add",
    });
    return c.json({ success: true, data: result }, 201);
  },
);

sidak.get(
  "/reports/archives",
  requireRole("admin", "trainer", "leader", "agent"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const data = await sidakService.getReportArchives(
      user.id,
      profile?.role ?? "",
    );
    return c.json({ success: true, data });
  },
);

sidak.get(
  "/reports/archives/:id",
  requireRole("admin", "trainer", "leader", "agent"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const id = c.req.param("id");
    const result = await sidakService.getReportArchiveById(
      id,
      user.id,
      profile?.role ?? "",
    );
    if (!result) {
      return c.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Report tidak ditemukan atau tidak memiliki akses",
          },
        },
        404,
      );
    }
    return c.json({ success: true, data: result });
  },
);

sidak.delete(
  "/reports/archives/:id",
  requireRole("admin", "trainer", "leader", "agent"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const id = c.req.param("id");
    await sidakService.deleteReportArchive(id, user.id, profile?.role ?? "");
    await logActivity({
      user_id: user.id,
      user_name: user.email ?? "",
      action: `Menghapus Report SIDAK ID: ${id}`,
      module: "SIDAK",
      type: "delete",
    });
    return c.json({ success: true, data: null });
  },
);

sidak.post(
  "/reports/ai/export-pdf",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const body = await c.req.json();
    const parsed = z
      .object({
        title: z.string().default("Laporan Analisis QA"),
        periodLabel: z.string().default(""),
        serviceLabel: z.string().default(""),
        mode: z.enum(["layanan", "individu"]).default("layanan"),
        agentName: z.string().optional(),
        totalFindings: z.number().default(0),
        totalRows: z.number().default(0),
        executiveSummary: z.string().default(""),
        keyFindings: z.array(z.string()).default([]),
        scoreAnalysis: z.string().default(""),
        recommendations: z.array(z.string()).default([]),
        priorityAreas: z.array(z.string()).default([]),
        chartData: z
          .object({
            donutData: z
              .object({
                critical: z.number(),
                nonCritical: z.number(),
                total: z.number(),
              })
              .optional(),
            paretoData: z
              .array(
                z.object({
                  name: z.string(),
                  count: z.number(),
                  cumulative: z.number(),
                }),
              )
              .optional(),
            trendData: z
              .array(z.object({ month: z.string(), total: z.number() }))
              .optional(),
          })
          .optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data laporan tidak valid",
            details: parsed.error,
          },
        },
        400,
      );
    }
    try {
      const pdfBytes = await buildAiReportPdf(parsed.data);
      return c.newResponse(new Uint8Array(pdfBytes), 200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="laporan-ai-${Date.now()}.pdf"`,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: { code: "EXPORT_ERROR", message: error.message },
        },
        500,
      );
    }
  },
);

export { sidak };
