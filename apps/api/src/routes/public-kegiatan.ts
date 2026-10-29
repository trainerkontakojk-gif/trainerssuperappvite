import { Hono } from "hono";
import { z } from "zod";
import {
  TRAINER_ACTIVITY_PROGRAMS,
  type PublicKegiatanResponse,
  type PublicTrainerActivity,
} from "@trainers/types";
import { createAnonClient } from "../lib/supabase";

const PAGE_SIZE = 500;
const requestedYearSchema = z.coerce.number().int().min(2020).max(2100);
const programOrder = new Map(
  TRAINER_ACTIVITY_PROGRAMS.map(({ value }, index) => [value, index]),
);

async function listPublishedYears(client: ReturnType<typeof createAnonClient>) {
  const years = new Set<number>();
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("trainer_activities")
      .select("year")
      .eq("is_published", true)
      .order("year", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { years: null, error };
    for (const row of data ?? []) years.add(row.year);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return {
    years: [...years].sort((a, b) => b - a),
    error: null,
  };
}

export const publicKegiatan = new Hono().get("/kegiatan", async (c) => {
  const rawYear = c.req.query("tahun");
  const parsedYear =
    rawYear === undefined ? undefined : requestedYearSchema.safeParse(rawYear);
  if (parsedYear && !parsedYear.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "INVALID_YEAR",
          message: "Tahun harus berupa angka antara 2020 dan 2100.",
        },
      },
      400,
    );
  }

  const client = createAnonClient();
  const yearResult = await listPublishedYears(client);
  if (yearResult.error) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "PUBLIC_KEGIATAN_UNAVAILABLE",
          message:
            "Kegiatan yang diterbitkan belum dapat dimuat. Silakan coba lagi.",
        },
      },
      503,
    );
  }

  const years = yearResult.years ?? [];
  const year = parsedYear?.success ? parsedYear.data : (years[0] ?? null);
  let items: PublicTrainerActivity[] = [];
  if (year !== null) {
    const { data, error } = await client
      .from("trainer_activities")
      .select(
        "id, year, program, kind, title, event_date, image_url, drive_url, sort_order, created_at, updated_at",
      )
      .eq("is_published", true)
      .eq("year", year)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      return c.json(
        {
          success: false as const,
          error: {
            code: "PUBLIC_KEGIATAN_UNAVAILABLE",
            message:
              "Kegiatan yang diterbitkan belum dapat dimuat. Silakan coba lagi.",
          },
        },
        503,
      );
    }
    items = (data ?? []) as unknown as PublicTrainerActivity[];
    items.sort(
      (left, right) =>
        (programOrder.get(left.program) ?? Number.MAX_SAFE_INTEGER) -
          (programOrder.get(right.program) ?? Number.MAX_SAFE_INTEGER) ||
        left.sort_order - right.sort_order ||
        left.id.localeCompare(right.id),
    );
  }

  const response: PublicKegiatanResponse = { years, year, items };
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ success: true as const, data: response });
});
