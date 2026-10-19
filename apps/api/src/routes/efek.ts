import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  efekImportInputSchema,
  efekMatchInputSchema,
  efekProgramCodeSchema,
  efekReportQuerySchema,
  efekSessionInputSchema,
} from "@trainers/types";
import type { AuthVariables } from "../middleware/auth";
import { requireCapability } from "../middleware/role";
import { createUserClient } from "../lib/supabase";
import { TnaServiceError } from "../services/tna/errors";
import {
  createEfekSession,
  deleteEfekSession,
  getEfekSession,
  importEfekSessions,
  listEfekPrograms,
  listEfekSessions,
  matchEfekNames,
  updateEfekSession,
} from "../services/efek/sessions";
import {
  getEfekProgramReport,
  getEfekReport,
} from "../services/efek/report";

type EfekContext = Context<{ Variables: AuthVariables }>;

function efekFailure(c: EfekContext, error: unknown) {
  if (error instanceof TnaServiceError)
    return c.json(
      {
        success: false as const,
        error: { code: error.code, message: error.message },
      },
      error.status,
    );
  return c.json(
    {
      success: false as const,
      error: {
        code: "EFEK_UNAVAILABLE",
        message: "Data EFEK belum dapat diproses. Silakan coba lagi.",
      },
    },
    503,
  );
}

const invalidInput = (c: EfekContext) =>
  c.json(
    {
      success: false as const,
      error: {
        code: "VALIDATION_ERROR",
        message: "Input EFEK tidak valid. Periksa kembali data yang diisi.",
      },
    },
    400,
  );

const writeContext = (c: EfekContext) => ({
  actorId: c.get("user").id,
  actorName: c.get("profile").full_name ?? c.get("user").email ?? "",
});
const readClient = (c: EfekContext) => createUserClient(c.get("token"));
const body = (c: EfekContext) => c.req.json().catch(() => null);

export const efek = new Hono<{ Variables: AuthVariables }>()
  .get("/programs", requireCapability("tna.read"), async (c) => {
    try {
      const data = await listEfekPrograms(readClient(c));
      return c.json({ success: true as const, data });
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .get("/sessions", requireCapability("tna.read"), async (c) => {
    const program = c.req.query("program");
    const parsed = efekProgramCodeSchema
      .optional()
      .safeParse(program || undefined);
    if (!parsed.success) return invalidInput(c);
    try {
      const items = await listEfekSessions(readClient(c), parsed.data);
      return c.json({ success: true as const, data: { items } });
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .get("/sessions/:id", requireCapability("tna.read"), async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return invalidInput(c);
    try {
      const data = await getEfekSession(readClient(c), id.data);
      if (!data)
        return c.json(
          {
            success: false as const,
            error: {
              code: "EFEK_SESSION_NOT_FOUND",
              message: "Sesi pelatihan tidak ditemukan.",
            },
          },
          404,
        );
      return c.json({ success: true as const, data });
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .post("/sessions", requireCapability("tna.write"), async (c) => {
    const parsed = efekSessionInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalidInput(c);
    try {
      const id = await createEfekSession(writeContext(c), parsed.data);
      return c.json({ success: true as const, data: { id } }, 201);
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .put("/sessions/:id", requireCapability("tna.write"), async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    const parsed = efekSessionInputSchema.safeParse(await body(c));
    if (!id.success || !parsed.success) return invalidInput(c);
    try {
      await updateEfekSession(writeContext(c), id.data, parsed.data);
      return c.json({ success: true as const, data: { id: id.data } });
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .delete("/sessions/:id", requireCapability("tna.write"), async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return invalidInput(c);
    try {
      await deleteEfekSession(writeContext(c), id.data);
      return c.json({ success: true as const, data: { id: id.data } });
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .post("/import/match", requireCapability("tna.write"), async (c) => {
    const parsed = efekMatchInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalidInput(c);
    try {
      const items = await matchEfekNames(readClient(c), parsed.data);
      return c.json({ success: true as const, data: { items } });
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .post("/import", requireCapability("tna.write"), async (c) => {
    const parsed = efekImportInputSchema.safeParse(await body(c));
    if (!parsed.success) return invalidInput(c);
    try {
      const data = await importEfekSessions(writeContext(c), parsed.data);
      return c.json({ success: true as const, data }, 201);
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .get("/report", requireCapability("tna.read"), async (c) => {
    const parsed = efekReportQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return invalidInput(c);
    try {
      const data = await getEfekReport(readClient(c), parsed.data);
      return c.json({ success: true as const, data });
    } catch (error) {
      return efekFailure(c, error);
    }
  })
  .get("/report/:program", requireCapability("tna.read"), async (c) => {
    const code = efekProgramCodeSchema.safeParse(c.req.param("program"));
    const parsed = efekReportQuerySchema.safeParse(c.req.query());
    if (!code.success || !parsed.success) return invalidInput(c);
    try {
      const data = await getEfekProgramReport(
        readClient(c),
        code.data,
        parsed.data,
      );
      return c.json({ success: true as const, data });
    } catch (error) {
      return efekFailure(c, error);
    }
  });
