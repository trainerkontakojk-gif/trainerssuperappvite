import { Hono } from "hono";
import { readPdktSettings, writePdktSettings } from "../../lib/pdkt-settings";
import { requireRole } from "../../middleware/role";
import {
  guardedUserSettingsWrite,
  isSettingsConflictError,
} from "../../lib/guarded-user-settings";
import { Variables, getUserClient, jsonServerError } from "./route-utils";

const settings = new Hono<{ Variables: Variables }>();

settings.get(
  "/",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const userClient = getUserClient(c);

    try {
      const { data, error } = await userClient
        .from("user_settings")
        .select("settings, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      c.header(
        "x-settings-version",
        typeof data?.updated_at === "string" ? data.updated_at : "absent",
      );
      return c.json({
        success: true,
        data: readPdktSettings(data?.settings),
      });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

settings.post(
  "/",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  async (c) => {
    const user = c.get("user");
    const userClient = getUserClient(c);
    const body = await c.req.json();

    try {
      const data = await guardedUserSettingsWrite(
        userClient,
        user.id,
        (existingSettings) =>
          writePdktSettings(existingSettings, body.settings),
        c.req.header("x-settings-version"),
      );

      c.header("x-settings-version", data.updated_at);
      return c.json({ success: true, data });
    } catch (error: unknown) {
      if (isSettingsConflictError(error)) {
        return c.json(
          {
            success: false,
            error: { code: "SETTINGS_CONFLICT", message: error.message },
          },
          409,
        );
      }
      return jsonServerError(c, error);
    }
  },
);

export { settings };
