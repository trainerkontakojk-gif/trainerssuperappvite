import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  TRAINER_ACTIVITY_PROGRAMS,
  trainerActivityInputSchema,
  type TrainerActivity,
} from "@trainers/types";
import type { AuthVariables } from "../middleware/auth";
import { getActor, requireCapability } from "../middleware/role";
import { createUserClient } from "../lib/supabase";
import {
  isTrainerActivityImageUrl,
  TrainerActivityMediaValidationError,
  TrainerActivityMediaUploadError,
  uploadTrainerActivityImage,
} from "../lib/trainer-activity-media";

type ActivityContext = Context;

const yearQuerySchema = z.coerce.number().int().min(2020).max(2100);
const activityIdSchema = z.string().uuid();
const programOrder = new Map(
  TRAINER_ACTIVITY_PROGRAMS.map(({ value }, index) => [value, index]),
);

function invalidInput(c: ActivityContext, message?: string) {
  return c.json(
    {
      success: false as const,
      error: {
        code: "VALIDATION_ERROR",
        message:
          message ??
          "Data kegiatan tidak valid. Periksa kembali judul, tahun, program, tanggal, dan gambar.",
      },
    },
    400,
  );
}

function validationMessage(error: Pick<z.ZodError, "issues">) {
  const driveIssue = error.issues.find(
    (issue) => issue.path[0] === "drive_url",
  );
  if (driveIssue) return driveIssue.message;
  const imageIssue = error.issues.find((issue) => issue.path[0] === "image");
  if (imageIssue && /PNG|JPEG|WebP|5 MB/i.test(imageIssue.message))
    return imageIssue.message;
  return undefined;
}

function unavailable(c: ActivityContext, code = "KEGIATAN_UNAVAILABLE") {
  return c.json(
    {
      success: false as const,
      error: {
        code,
        message: "Data kegiatan belum dapat diproses. Silakan coba lagi.",
      },
    },
    503,
  );
}

function sortActivities(items: TrainerActivity[]) {
  items.sort(
    (left, right) =>
      right.year - left.year ||
      (programOrder.get(left.program) ?? Number.MAX_SAFE_INTEGER) -
        (programOrder.get(right.program) ?? Number.MAX_SAFE_INTEGER) ||
      left.sort_order - right.sort_order ||
      left.id.localeCompare(right.id),
  );
  return items;
}

const activityJson = zValidator(
  "json",
  trainerActivityInputSchema,
  (result, c) => {
    if (!result.success)
      return invalidInput(c, validationMessage(result.error));
  },
);

async function resolveActivityImage(
  input: ReturnType<typeof trainerActivityInputSchema.parse>,
) {
  if (input.image) return uploadTrainerActivityImage(input.image);
  if (input.image_url && isTrainerActivityImageUrl(input.image_url))
    return input.image_url;
  throw new TrainerActivityMediaValidationError(
    "Gambar harus berasal dari bucket kegiatan.",
  );
}

export const kegiatan = new Hono<{ Variables: AuthVariables }>()
  .get("/", requireCapability("kegiatan.manage"), async (c) => {
    const rawYear = c.req.query("tahun");
    const parsedYear =
      rawYear === undefined ? undefined : yearQuerySchema.safeParse(rawYear);
    if (parsedYear && !parsedYear.success)
      return invalidInput(c, "Tahun harus berupa angka antara 2020 dan 2100.");

    const client = createUserClient(c.get("token"));
    let query = client.from("trainer_activities").select("*");
    if (parsedYear?.success) query = query.eq("year", parsedYear.data);
    const { data, error } = await query
      .order("year", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error) return unavailable(c);
    return c.json({
      success: true as const,
      data: sortActivities((data ?? []) as unknown as TrainerActivity[]),
    });
  })
  .post("/", requireCapability("kegiatan.manage"), activityJson, async (c) => {
    const input = c.req.valid("json");
    if (!input.image) {
      if (input.image_url && !isTrainerActivityImageUrl(input.image_url))
        return invalidInput(c, "Gambar harus berasal dari bucket kegiatan.");
      return invalidInput(
        c,
        "Gambar baru wajib diunggah saat membuat kegiatan.",
      );
    }

    const actor = getActor(c);
    let imageUrl: string;
    try {
      imageUrl = await resolveActivityImage(input);
    } catch (error) {
      if (error instanceof TrainerActivityMediaValidationError)
        return invalidInput(c, error.message);
      if (error instanceof TrainerActivityMediaUploadError)
        return unavailable(c, "KEGIATAN_IMAGE_UPLOAD_FAILED");
      return unavailable(c);
    }

    const { data, error } = await createUserClient(c.get("token"))
      .from("trainer_activities")
      .insert({
        year: input.year,
        program: input.program,
        kind: input.kind,
        title: input.title,
        event_date: input.event_date,
        image_url: imageUrl,
        drive_url: input.drive_url,
        sort_order: input.sort_order,
        is_published: input.is_published,
        created_by: actor.id,
        updated_by: null,
      })
      .select("*")
      .single();
    if (error) return unavailable(c);
    return c.json({ success: true as const, data }, 201);
  })
  .patch(
    "/:id",
    requireCapability("kegiatan.manage"),
    activityJson,
    async (c) => {
      const id = activityIdSchema.safeParse(c.req.param("id"));
      if (!id.success) return invalidInput(c, "ID kegiatan tidak valid.");
      const input = c.req.valid("json");

      let imageUrl: string;
      try {
        imageUrl = await resolveActivityImage(input);
      } catch (error) {
        if (error instanceof TrainerActivityMediaValidationError)
          return invalidInput(c, error.message);
        if (error instanceof TrainerActivityMediaUploadError)
          return unavailable(c, "KEGIATAN_IMAGE_UPLOAD_FAILED");
        return unavailable(c);
      }

      const actor = getActor(c);
      const { data, error } = await createUserClient(c.get("token"))
        .from("trainer_activities")
        .update({
          year: input.year,
          program: input.program,
          kind: input.kind,
          title: input.title,
          event_date: input.event_date,
          image_url: imageUrl,
          drive_url: input.drive_url,
          sort_order: input.sort_order,
          is_published: input.is_published,
          updated_by: actor.id,
        })
        .eq("id", id.data)
        .select("*")
        .maybeSingle();
      if (error) return unavailable(c);
      if (!data)
        return c.json(
          {
            success: false as const,
            error: {
              code: "KEGIATAN_NOT_FOUND",
              message: "Kegiatan tidak ditemukan.",
            },
          },
          404,
        );
      return c.json({ success: true as const, data });
    },
  )
  .delete("/:id", requireCapability("kegiatan.manage"), async (c) => {
    const id = activityIdSchema.safeParse(c.req.param("id"));
    if (!id.success) return invalidInput(c, "ID kegiatan tidak valid.");

    const { data, error } = await createUserClient(c.get("token"))
      .from("trainer_activities")
      .delete()
      .eq("id", id.data)
      .select("id")
      .maybeSingle();
    if (error) return unavailable(c);
    if (!data)
      return c.json(
        {
          success: false as const,
          error: {
            code: "KEGIATAN_NOT_FOUND",
            message: "Kegiatan tidak ditemukan.",
          },
        },
        404,
      );
    return c.json({ success: true as const, data: { id: data.id } });
  });
