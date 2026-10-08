import { Hono, type Context } from "hono";
import { z } from "zod";
import type { ApiResponse } from "@trainers/types";
import {
  createTnaNeedSchema,
  createTnaPlanSchema,
  updateTnaDraftPlanSchema,
  tnaPlanTransitionSchema,
  tnaPlansQuerySchema,
  tnaParameterDetailQuerySchema,
  tnaNeedsQuerySchema,
  tnaParametersQuerySchema,
  tnaParametersResponseSchema,
} from "@trainers/types";
import type { AuthVariables } from "../middleware/auth";
import { requireCapability } from "../middleware/role";
import { createUserClient } from "../lib/supabase";
import { listTnaParameters } from "../services/tna/parameters";
import {
  getTnaParameterDetail,
  TnaIndicatorNotFoundError,
} from "../services/tna/detail";
import {
  createTnaNeed,
  createTnaPlan,
  updateTnaDraftPlan,
  activateTnaPlan,
  cancelTnaPlan,
  TnaNoFindingsError,
} from "../services/tna/write-service";
import {
  getTnaNeed,
  getTnaPlanDetail,
  listTnaPlans,
  listTnaNeeds,
  listTnaPrograms,
} from "../services/tna/read-service";
import { TnaServiceError } from "../services/tna/errors";
import { TnaPeriodNotFoundError } from "../services/tna/metrics";

function tnaFailure(c: Context<{ Variables: AuthVariables }>, error: unknown) {
  if (error instanceof TnaServiceError)
    return c.json(
      {
        success: false as const,
        error: { code: error.code, message: error.message },
      },
      error.status,
    );
  if (error instanceof TnaPeriodNotFoundError)
    return c.json(
      {
        success: false as const,
        error: {
          code: "TNA_PERIOD_NOT_FOUND",
          message: "Periode tidak ditemukan.",
        },
      },
      404,
    );
  if (error instanceof TnaIndicatorNotFoundError)
    return c.json(
      {
        success: false as const,
        error: {
          code: "TNA_INDICATOR_NOT_FOUND",
          message: "Parameter tidak ditemukan untuk layanan ini.",
        },
      },
      404,
    );
  if (error instanceof TnaNoFindingsError)
    return c.json(
      {
        success: false as const,
        error: {
          code: "TNA_NO_FINDINGS",
          message:
            "Tidak ada temuan pada parameter dan periode ini untuk divalidasi.",
        },
      },
      422,
    );
  return c.json(
    {
      success: false as const,
      error: {
        code: "TNA_UNAVAILABLE",
        message: "Data TNA belum dapat diproses. Silakan coba lagi.",
      },
    },
    503,
  );
}

const invalidInput = (c: Context<{ Variables: AuthVariables }>) =>
  c.json(
    {
      success: false as const,
      error: {
        code: "VALIDATION_ERROR",
        message: "Input TNA tidak valid. Periksa kembali data yang diisi.",
      },
    },
    400,
  );

const writeContext = (c: Context<{ Variables: AuthVariables }>) => ({
  supabase: createUserClient(c.get("token")),
  actorId: c.get("user").id,
  actorName: c.get("profile").full_name ?? c.get("user").email ?? "",
});
const planInputFailure = (
  c: Context<{ Variables: AuthVariables }>,
  issues: z.ZodIssue[],
) => {
  if (issues.every((issue) => issue.path[0] === "participant_peserta_ids"))
    return c.json(
      {
        success: false as const,
        error: {
          code: "TNA_INVALID_PARTICIPANTS",
          message: "Peserta harus 1–200 orang yang unik dan valid.",
        },
      },
      422,
    );
  return invalidInput(c);
};

const tna = new Hono<{ Variables: AuthVariables }>()
  .get("/programs", requireCapability("tna.read"), async (c) => {
    try {
      const data = await listTnaPrograms(createUserClient(c.get("token")));
      return c.json({ success: true as const, data });
    } catch {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: "TNA_PROGRAMS_UNAVAILABLE",
            message: "Katalog program belum dapat dimuat. Silakan coba lagi.",
          },
        },
        503,
      );
    }
  })
  .get("/parameters", requireCapability("tna.read"), async (c) => {
    const parsed = tnaParametersQuerySchema.safeParse({
      service_type: c.req.query("service_type"),
      period_id: c.req.query("period_id"),
      compare_count: c.req.query("compare_count") ?? undefined,
      scope: c.req.query("scope") ?? undefined,
    });
    if (!parsed.success) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Parameter daftar parameter tidak valid",
          },
        },
        400,
      );
    }

    const { service_type, period_id, compare_count, scope } = parsed.data;
    try {
      // Pembacaan memakai JWT pengguna supaya RLS berlaku. D8: Fase 1 hanya
      // memanggil mesin metrik dengan scope penuh.
      const data = await listTnaParameters({
        supabase: createUserClient(c.get("token")),
        serviceType: service_type,
        periodId: period_id,
        compareCount: compare_count,
        dataScope: { kind: "all" },
        listingScope: scope,
      });
      const validated = tnaParametersResponseSchema.safeParse(data);
      if (!validated.success) {
        return c.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: "TNA_PARAMETERS_INVALID",
              message:
                "Data parameter tidak dapat diproses. Silakan coba lagi.",
            },
          },
          503,
        );
      }
      return c.json({ success: true as const, data: validated.data });
    } catch (error) {
      if (error instanceof TnaPeriodNotFoundError) {
        return c.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: "TNA_PERIOD_NOT_FOUND",
              message: "Periode tidak ditemukan.",
            },
          },
          404,
        );
      }
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: "TNA_PARAMETERS_UNAVAILABLE",
            message: "Gagal memuat daftar parameter. Silakan coba lagi.",
          },
        },
        503,
      );
    }
  })
  .get("/parameters/detail", requireCapability("tna.read"), async (c) => {
    const parsed = tnaParameterDetailQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return invalidInput(c);
    const input = parsed.data;
    try {
      const data = await getTnaParameterDetail({
        supabase: createUserClient(c.get("token")),
        serviceType: input.service_type,
        periodId: input.period_id,
        indicatorId: input.indicator_id,
        compareCount: input.compare_count,
        dataScope: { kind: "all" },
      });
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .post("/needs", requireCapability("tna.write"), async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = createTnaNeedSchema.safeParse(body);
    if (!parsed.success) return invalidInput(c);
    try {
      const data = await createTnaNeed({
        supabase: createUserClient(c.get("token")),
        actorId: c.get("user").id,
        actorName: c.get("profile").full_name ?? c.get("user").email ?? "",
        input: parsed.data,
      });
      return c.json({ success: true as const, data }, 201);
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .get("/needs", requireCapability("tna.read"), async (c) => {
    const parsed = tnaNeedsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return invalidInput(c);
    try {
      const data = await listTnaNeeds(
        createUserClient(c.get("token")),
        parsed.data,
      );
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .get("/needs/:id", requireCapability("tna.read"), async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return invalidInput(c);
    try {
      const data = await getTnaNeed(createUserClient(c.get("token")), id.data);
      if (!data)
        return c.json(
          {
            success: false as const,
            error: {
              code: "TNA_NEED_NOT_FOUND",
              message: "Kebutuhan tidak ditemukan.",
            },
          },
          404,
        );
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .post("/plans", requireCapability("tna.write"), async (c) => {
    const parsed = createTnaPlanSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return planInputFailure(c, parsed.error.issues);
    try {
      const data = await createTnaPlan({
        ...writeContext(c),
        input: parsed.data,
      });
      return c.json({ success: true as const, data }, 201);
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .get("/plans", requireCapability("tna.read"), async (c) => {
    const parsed = tnaPlansQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return invalidInput(c);
    try {
      const data = await listTnaPlans(
        createUserClient(c.get("token")),
        parsed.data.status,
      );
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .get("/plans/:id", requireCapability("tna.read"), async (c) => {
    const parsed = z.string().uuid().safeParse(c.req.param("id"));
    if (!parsed.success) return invalidInput(c);
    try {
      const data = await getTnaPlanDetail(
        createUserClient(c.get("token")),
        parsed.data,
      );
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .patch("/plans/:id", requireCapability("tna.write"), async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return invalidInput(c);
    const parsed = updateTnaDraftPlanSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return planInputFailure(c, parsed.error.issues);
    try {
      const data = await updateTnaDraftPlan({
        ...writeContext(c),
        planId: id.data,
        input: parsed.data,
      });
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .post("/plans/:id/activate", requireCapability("tna.write"), async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    const parsed = tnaPlanTransitionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!id.success || !parsed.success) return invalidInput(c);
    try {
      const data = await activateTnaPlan({
        ...writeContext(c),
        planId: id.data,
        expectedUpdatedAt: parsed.data.expected_updated_at,
      });
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  })
  .post("/plans/:id/cancel", requireCapability("tna.write"), async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    const parsed = tnaPlanTransitionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!id.success || !parsed.success) return invalidInput(c);
    try {
      const data = await cancelTnaPlan({
        ...writeContext(c),
        planId: id.data,
        expectedUpdatedAt: parsed.data.expected_updated_at,
      });
      return c.json({ success: true as const, data });
    } catch (error) {
      return tnaFailure(c, error);
    }
  });

export { tna };
