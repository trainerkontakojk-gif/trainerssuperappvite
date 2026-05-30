import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import { aiRateLimitMiddleware } from "../../middleware/rateLimit";
import * as sidakService from "../../services/sidak-service";
import { logActivity } from "../../services/activity-log-service";
import { buildAiReportDocx } from "../../lib/report-docx-builder";
import { buildHtmlReport } from "../../lib/report-html-builder";
import { buildAiReportPdf } from "../../lib/report-pdf-builder";

type Variables = { user: User; profile: any };

const sidakReports = new Hono<{ Variables: Variables }>();

// ── Reports ──────────────────────────────────────────────
sidakReports.post(
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

sidakReports.post(
  "/reports/ai/generate",
  requireRole("admin", "trainer", "leader"),
  aiRateLimitMiddleware,
  async (c: any) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const body = await c.req.json();
    const parsed = sidakService.aiReportSchema.safeParse(body);
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
      const result = await sidakService.generateAiReport(
        parsed.data,
        user.id,
        accessibleIds ?? undefined,
      );
      return c.json({ success: true, data: result });
    } catch (e: any) {
      const isNoData = e.message.includes("Tidak ada data");
      const code = isNoData ? "NO_DATA" : "REPORT_ERROR";
      return c.json(
        { success: false, error: { code, message: e.message } },
        isNoData ? 400 : 500,
      );
    }
  },
);

sidakReports.post(
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

sidakReports.post(
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

sidakReports.post(
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
sidakReports.post(
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

sidakReports.get(
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

sidakReports.get(
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

sidakReports.delete(
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

sidakReports.post(
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

export { sidakReports };
