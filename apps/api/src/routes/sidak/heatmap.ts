import { ScopeUnavailableError } from "../../services/access/scope";
import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { requireCapability } from "../../middleware/role";
import { createUserClient, supabaseAdmin } from "../../lib/supabase";
import {
  getAccessibleSidakFilters,
  resolveFolderFiltersByIds,
} from "../../services/sidak/access-scope";
import { fetchAllPages } from "../../lib/supabase-pagination";
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
sidakHeatmap.get("/heatmap", requireCapability("sidak.read"), async (c) => {
  const parsed = sidakHeatmapQuerySchema.safeParse({
    mode: c.req.query("mode"),
    year: c.req.query("year"),
    service_type: c.req.query("service_type") ?? undefined,
    count_by: c.req.query("count_by") ?? undefined,
    agent_id: c.req.query("agent_id") ?? undefined,
    folder_ids: c.req.query("folder_ids") ?? undefined,
    start_month: c.req.query("start_month") ?? undefined,
    end_month: c.req.query("end_month") ?? undefined,
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

  const {
    mode,
    year,
    service_type,
    count_by,
    agent_id,
    folder_ids,
    start_month,
    end_month,
  } = parsed.data;
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
    if (agent_id && filterScope && !filterScope.agentIds.includes(agent_id)) {
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

    let scope = filterScope
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

    if (folder_ids) {
      const { filterNames } = await resolveFolderFiltersByIds(folder_ids);
      const participants =
        filterNames.length === 0
          ? []
          : await fetchAllPages<{ id: string }>({
              build: ({ from, to }) =>
                supabase
                  .from("profiler_peserta")
                  .select("id")
                  .in("batch_name", filterNames)
                  .order("id", { ascending: true })
                  .range(from, to),
            });
      const allowedIds = filterScope ? new Set(filterScope.agentIds) : null;
      scope = {
        agentIds: participants
          .map((row) => row.id)
          .filter((id) => !allowedIds || allowedIds.has(id)),
        serviceTypes: scope?.serviceTypes ?? null,
      };
    }

    const data = await getSidakHeatmap({
      supabase,
      mode,
      year,
      startMonth: start_month,
      endMonth: end_month,
      serviceType: service_type,
      countBy: count_by,
      agentId: agent_id,
      scope,
    });
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof ScopeUnavailableError) throw error;
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
});

export { sidakHeatmap };
