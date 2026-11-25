import { ScopeUnavailableError } from "../../services/access/scope";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { normalizeRole, sidakManagementReportRequestSchema } from "@trainers/types";
import { requireCapability } from "../../middleware/role";
import * as sidakService from "../../services/sidak-service";

type Variables = { user: User; profile: any };

const managementReportRoute = new Hono<{ Variables: Variables }>().post(
  "/reports/management",
  requireCapability("sidak.reports.generate"),
  zValidator("json", sidakManagementReportRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Filter periode laporan tidak valid." } },
        400,
      );
    }
  }),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const input = c.req.valid("json");
    try {
      const filterScope = await sidakService.getAccessibleSidakFilters(user.id, profile?.role ?? "");
      const agentIds = filterScope?.agentIds ?? null;
      const allowedServices = filterScope?.allowedServices;
      if (normalizeRole(profile?.role) === "leader" && agentIds?.length === 0) {
        return c.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Anda belum memiliki akses SIDAK yang disetujui.",
            },
          },
          403,
        );
      }
      if (input.pesertaId && agentIds !== null && !agentIds.includes(input.pesertaId)) {
        return c.json(
          { success: false, error: { code: "FORBIDDEN", message: "Agen tersebut tidak termasuk dalam akses Anda." } },
          403,
        );
      }
      if (
        input.serviceType &&
        allowedServices?.length &&
        !allowedServices.includes(input.serviceType)
      ) {
        return c.json(
          { success: false, error: { code: "FORBIDDEN", message: "Layanan ini tidak termasuk dalam akses Anda." } },
          403,
        );
      }
      const data = await sidakService.getSidakManagementReport(input, {
        agentIds,
        allowedServiceTypes: allowedServices,
      });
      return c.json({ success: true, data });
    } catch (error) {
      if (error instanceof ScopeUnavailableError) throw error;
      return c.json(
        { success: false, error: { code: "REPORT_ERROR", message: "Laporan manajemen belum bisa dibuat. Coba lagi." } },
        500,
      );
    }
  },
);

const dataReportRoute = new Hono<{ Variables: Variables }>().post(
  "/reports/data",
  requireCapability("sidak.reports.generate"),
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
    try {
      const filterScope = await sidakService.getAccessibleSidakFilters(
        user.id,
        profile?.role ?? "",
      );
      const agentIds = filterScope?.agentIds ?? null;
      const allowedServices = filterScope?.allowedServices;
      if (normalizeRole(profile?.role) === "leader" && agentIds?.length === 0) {
        return c.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Anda belum memiliki akses SIDAK yang disetujui.",
            },
          },
          403,
        );
      }
      if (
        parsed.data.pesertaId &&
        agentIds !== null &&
        !agentIds.includes(parsed.data.pesertaId)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Agen tersebut tidak termasuk dalam akses Anda.",
            },
          },
          403,
        );
      }
      if (
        parsed.data.serviceType &&
        allowedServices?.length &&
        !allowedServices.some((service) => service === parsed.data.serviceType)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Layanan ini tidak termasuk dalam akses Anda.",
            },
          },
          403,
        );
      }
      const rows = await sidakService.getDataReportRows({
        ...parsed.data,
        agent_ids: agentIds ?? undefined,
        allowedServiceTypes: allowedServices,
      });
      return c.json({ success: true, data: rows });
    } catch (error) {
      if (error instanceof ScopeUnavailableError) throw error;
      return c.json(
        {
          success: false,
          error: {
            code: "REPORT_ERROR",
            message: "Data laporan belum bisa diambil. Coba lagi.",
          },
        },
        500,
      );
    }
  },
);

const sidakReports = new Hono<{ Variables: Variables }>()
  .route("/", managementReportRoute)
  .route("/", dataReportRoute);

export type SidakManagementReportRoute = typeof managementReportRoute;
export { sidakReports };
