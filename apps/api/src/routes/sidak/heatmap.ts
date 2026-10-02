import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import { createUserClient } from "../../lib/supabase";
import { getSidakHeatmap } from "../../services/sidak/heatmap-service";
import { sidakHeatmapQuerySchema } from "@trainers/types";

type Variables = { user: User; profile: any; token: string };

const sidakHeatmap = new Hono<{ Variables: Variables }>();

/**
 * Heatmap ketidaksesuaian.
 *
 * Hanya admin dan trainer. Nama mode `qa` di sini TIDAK berarti role `qa`
 * punya akses — itu hanya menandai kolom tanggal (tanggal sampel).
 *
 * Query berjalan dengan JWT user (RLS aktif). Tidak ada fallback ke
 * service-role: kalau RLS menolak, itu harus terlihat sebagai kesalahan.
 */
sidakHeatmap.get("/heatmap", requireRole("admin", "trainer"), async (c) => {
  const parsed = sidakHeatmapQuerySchema.safeParse({
    mode: c.req.query("mode"),
    year: c.req.query("year"),
    service_type: c.req.query("service_type") ?? undefined,
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

  const { mode, year, service_type } = parsed.data;
  const token = c.get("token");
  if (!token) {
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
    const data = await getSidakHeatmap({
      supabase: createUserClient(token),
      mode,
      year,
      serviceType: service_type,
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
});

export { sidakHeatmap };