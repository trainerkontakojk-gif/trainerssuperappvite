import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import * as sidakService from "../../services/sidak-service";
import { serviceTypeSchema } from "@trainers/types";

type Variables = { user: User; profile: any };

const sidakForecast = new Hono<{ Variables: Variables }>();

async function resolveSidakFilterScope(
  c: any,
): Promise<sidakService.SidakFilterScope | null> {
  const user = c.get("user");
  const profile = c.get("profile");
  return sidakService.getAccessibleSidakFilters(user.id, profile?.role ?? "");
}

sidakForecast.post(
  "/forecast/agents",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const user = c.get("user");
    const profile = c.get("profile");
    const body = await c.req.json();

    const parsed = z
      .object({
        year: z.number().int().min(2000).max(2100).optional(),
        serviceType: serviceTypeSchema.optional(),
        folderIds: z.array(z.string().uuid()).optional(),
        startMonth: z.number().int().min(1).max(12).optional(),
        endMonth: z.number().int().min(1).max(12).optional(),
        horizonMonths: z.number().int().min(1).max(6).optional(),
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

    const accessibleIds = await sidakService.getAccessibleAgentIds(
      user.id,
      profile?.role ?? "",
    );

    if (accessibleIds && accessibleIds.length === 0) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Anda belum memiliki scope agent SIDAK.",
          },
        },
        403,
      );
    }

    const filterScope = await resolveSidakFilterScope(c);
    const serviceType = parsed.data.serviceType ?? "call";
    if (
      filterScope?.allowedServices &&
      filterScope.allowedServices.length > 0 &&
      !filterScope.allowedServices.includes(serviceType)
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Layanan SIDAK tidak tersedia untuk scope Anda.",
          },
        },
        403,
      );
    }

    try {
      const result = await sidakService.generateSidakAgentForecast({
        request: {
          ...parsed.data,
          serviceType,
        },
        accessibleAgentIds: accessibleIds ?? undefined,
        allowedServiceTypes: filterScope?.allowedServices ?? undefined,
      });

      return c.json({ success: true, data: result });
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORECAST_ERROR",
            message: e.message || "Gagal memproses forecast agent.",
          },
        },
        400,
      );
    }
  },
);

export { sidakForecast };
