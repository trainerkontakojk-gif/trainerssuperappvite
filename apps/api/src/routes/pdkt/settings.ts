import { Hono } from "hono";
import { readPdktSettings, writePdktSettings } from "../../lib/pdkt-settings";
import { requireRole } from "../../middleware/role";
import {
  Variables,
  getUserClient,
  jsonServerError,
} from "./route-utils";

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
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

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
      const { data: existing, error: existingError } = await userClient
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      const updatedSettings = writePdktSettings(
        existing?.settings,
        body.settings,
      );

      const { data, error } = await userClient
        .from("user_settings")
        .upsert(
          {
            user_id: user.id,
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .select()
        .single();

      if (error) throw error;

      return c.json({ success: true, data });
    } catch (error: unknown) {
      return jsonServerError(c, error);
    }
  },
);

export { settings };
