import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import { createUserClient, supabaseAdmin } from "../../lib/supabase";
import { getAccessibleSidakFilters } from "../../services/sidak/access-scope";
import { getSidakHeatmap } from "../../services/sidak/heatmap-service";
import { sidakHeatmapQuerySchema } from "@trainers/types";

type Variables = { user: User; profile: any; token: string };

const sidakHeatmap = new Hono<{ Variables: Variables }>();

/**
 * Heatmap ketidaksesuaian.
 *
 * Akses: admin, trainer, dan leader. Nama mode `qa` di sini TIDAK berarti role
 * `qa` punya akses — itu hanya menandai kolom tanggal (tanggal sampel).
 *
 * Scoping per role:
 *   - admin/trainer: seluruh data, query memakai user JWT sehingga RLS berlaku.
 *   - leader: HANYA agent dalam scope-nya (`getAccessibleSidakFilters`), dengan
 *     service_type dibatasi `allowedServices`. RLS `read_admin_trainer` memang
 *     menolak leader, jadi jalur leader memakai service-role PLUS filter scope
 *     app-side. Jangan pernah bergantung pada RLS untuk leader.
 *
 * Kegagalan query selalu menjadi error, bukan heatmap kosong.
 */
sidakHeatmap.get(
  "/heatmap",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const parsed = sidakHeatmapQuerySchema.safeParse({
      mode: c.req.query("mode"),
      year: c.req.query("year"),
      service_type: c.req.query("service_type") ?? undefined,
      count_by: c.req.query("count_by") ?? undefined,
      agent_id: c.req.query("agent_id") ?? undefined,
    });

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Parameter heatmap tidak valid",
            details: parsed.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        },
        400,
      );
    }

    const { mode, year, service_type, count_by, agent_id } = parsed.data;
    const token = c.get("token");
    const user = c.get("user");
    const profile = c.get("profile");
    if (!token || !user) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Sesi tidak valid. Silakan masuk kembali.",
          },
        },
        401,
      );
    }

    try {
      // `null` untuk admin/trainer (tanpa batas), objek scope untuk leader.
      const filterScope = await getAccessibleSidakFilters(
        user.id,
        profile?.role ?? "",
      );

      // Leader tidak boleh meminta agent di luar scope-nya.
      if (
        agent_id &&
        filterScope &&
        !filterScope.agentIds.includes(agent_id)
      ) {
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

      // Leader yang terkunci ke layanan tertentu tidak boleh meminta layanan lain.
      if (
        filterScope?.serviceTypeLocked &&
        service_type &&
        !filterScope.allowedServices.includes(service_type)
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Anda tidak memiliki akses ke layanan ini.",
            },
          },
          403,
        );
      }

      const scope = filterScope
        ? {
            agentIds: filterScope.agentIds,
            serviceTypes:
              filterScope.allowedServices.length > 0
                ? filterScope.allowedServices
                : null,
          }
        : undefined;

      // Admin/trainer lewat JWT (RLS). Leader lewat service-role + scope app-side.
      const supabase = filterScope ? supabaseAdmin : createUserClient(token);

      const data = await getSidakHeatmap({
        supabase,
        mode,
        year,
        serviceType: service_type,
        countBy: count_by,
        agentId: agent_id,
        scope,
      });
      return c.json({ success: true, data });
    } catch {
      // Kegagalan query TIDAK boleh berubah jadi heatmap kosong yang terlihat
      // seperti "tidak ada temuan".
      return c.json(
        {
          success: false,
          error: {
            code: "HEATMAP_ERROR",
            message: "Gagal memuat data heatmap. Coba lagi sebentar.",
          },
        },
        500,
      );
    }
  },
);

export { sidakHeatmap };
