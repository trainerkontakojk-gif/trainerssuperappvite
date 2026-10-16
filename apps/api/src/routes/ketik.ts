import { getActor } from "../middleware/role";
import { resolveAccountScope } from "../services/access/scope";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import {
  KETIK_ERROR_MESSAGES,
  KETIK_SESSION_ERRORS,
  ketikQuickTemplateSchema,
  ketikAppSettingsSchema,
} from "@trainers/types";
import * as ketikService from "../services/ketik-service";
import { requireCapability } from "../middleware/role";
import { isSettingsConflictError } from "../lib/guarded-user-settings";
import { z } from "zod";
import { ketikAssignments } from "./ketik-assignments";
import { ketikSessions } from "./ketik-sessions";
import { ketikHistory } from "./ketik-history";
import { ketikReviews } from "./ketik-reviews";

type Variables = { user: User; profile: any };

const ketik = new Hono<{ Variables: Variables }>()
  .route("/assignments", ketikAssignments)
  .route("/sessions", ketikSessions)
  .route("/history", ketikHistory)
  .route("/review", ketikReviews);

function publicError(code: keyof typeof KETIK_ERROR_MESSAGES) {
  return { code, message: KETIK_ERROR_MESSAGES[code] };
}

ketik.get("/scenarios", requireCapability("ketik.use"), (c) => {
  return c.json({ success: true, data: ketikService.getScenarios() });
});

ketik.get("/consumer-types", requireCapability("ketik.use"), (c) => {
  return c.json({ success: true, data: ketikService.getConsumerTypes() });
});

ketik.post("/generate", requireCapability("ketik.use"), (c) =>
  c.json(
    {
      success: false,
      error: {
        code: "LEGACY_SESSION_WRITE_DISABLED",
        message: KETIK_SESSION_ERRORS.LEGACY_SESSION_WRITE_DISABLED,
      },
    },
    410,
  ),
);

ketik.get("/settings", requireCapability("ketik.settings.read"), async (c) => {
  try {
    const snapshot = await ketikService.getSettingsSnapshot(
      resolveAccountScope(getActor(c)).userId,
    );
    c.header("x-settings-version", snapshot.version);
    c.header("x-ketik-templates-version", snapshot.globalTemplatesVersion);
    return c.json({ success: true, data: snapshot.settings });
  } catch (err: unknown) {
    console.error("[KETIK] Settings load failed", err);
    return c.json(
      {
        success: false,
        error: publicError("SETTINGS_LOAD_FAILED"),
      },
      500,
    );
  }
});

ketik.put(
  "/templates",
  requireCapability("ketik.templates.shared.write"),
  zValidator(
    "json",
    z.object({ templates: z.array(ketikQuickTemplateSchema) }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const version = c.req.header("x-ketik-templates-version");
      const newVersion = await ketikService.saveGlobalKetikQuickTemplates(
        body.templates,
        version,
      );
      c.header("x-ketik-templates-version", newVersion);
      return c.json({
        success: true,
        message: "Template standar berhasil disimpan.",
      });
    } catch (err: unknown) {
      if (isSettingsConflictError(err)) {
        return c.json(
          {
            success: false,
            error: { code: "SETTINGS_CONFLICT", message: err.message },
          },
          409,
        );
      }
      console.error("[KETIK] Templates save failed", err);
      return c.json(
        {
          success: false,
          error: publicError("TEMPLATES_SAVE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.put(
  "/settings",
  requireCapability("ketik.settings.write"),
  zValidator("json", ketikAppSettingsSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const version = c.req.header("x-settings-version");
      const newVersion = await ketikService.saveSettings(
        resolveAccountScope(getActor(c)).userId,
        body,
        version,
      );
      c.header("x-settings-version", newVersion);
      return c.json({
        success: true,
        message: "Pengaturan berhasil disimpan.",
      });
    } catch (err: unknown) {
      if (isSettingsConflictError(err)) {
        return c.json(
          {
            success: false,
            error: { code: "SETTINGS_CONFLICT", message: err.message },
          },
          409,
        );
      }
      console.error("[KETIK] Settings save failed", err);
      return c.json(
        {
          success: false,
          error: publicError("SETTINGS_SAVE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.post("/history", requireCapability("ketik.history.write"), (c) =>
  c.json(
    {
      success: false,
      error: {
        code: "LEGACY_SESSION_WRITE_DISABLED",
        message: KETIK_SESSION_ERRORS.LEGACY_SESSION_WRITE_DISABLED,
      },
    },
    410,
  ),
);

ketik.delete(
  "/history",
  requireCapability("ketik.history.delete"),
  async (c) => {
    try {
      await ketikService.clearHistory(resolveAccountScope(getActor(c)).userId);
      return c.json({ success: true, message: "Riwayat berhasil dihapus." });
    } catch (err: unknown) {
      console.error("[KETIK] History delete failed", err);
      return c.json(
        {
          success: false,
          error: publicError("HISTORY_DELETE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.delete(
  "/history/:id",
  requireCapability("ketik.history.delete"),
  async (c) => {
    const sessionId = c.req.param("id");
    try {
      await ketikService.deleteSession(
        sessionId,
        resolveAccountScope(getActor(c)).userId,
      );
      return c.json({ success: true, message: "Sesi berhasil dihapus." });
    } catch (err: unknown) {
      console.error("[KETIK] Session delete failed", err);
      return c.json(
        {
          success: false,
          error: publicError("HISTORY_DELETE_FAILED"),
        },
        500,
      );
    }
  },
);

ketik.get("/worker", requireCapability("ketik.worker.process"), (c) =>
  c.json(
    {
      success: false,
      error: {
        code: "WORKER_ENDPOINT_RETIRED",
        message: "Telaah diproses oleh worker backend.",
      },
    },
    410,
  ),
);

export { ketik };
