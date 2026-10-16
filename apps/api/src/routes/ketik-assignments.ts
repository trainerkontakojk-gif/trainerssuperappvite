import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import {
  assignKetikConfigurationSchema,
  KETIK_ERROR_MESSAGES,
} from "@trainers/types";
import { getActor, requireCapability } from "../middleware/role";
import {
  assignKetikConfiguration,
  getKetikAssignment,
  KetikAssignmentError,
} from "../services/ketik/configuration-assignments";

type Variables = { user: User; profile: unknown };
function failure(
  c: Context<{ Variables: Variables }>,
  error: unknown,
  action: "LOAD" | "SAVE",
) {
  if (error instanceof KetikAssignmentError) {
    return c.json(
      { success: false, error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  // No database detail, tokens, or settings payloads in response/log metadata.
  console.error(`[KETIK] Assignment ${action.toLowerCase()} failed`, {
    kind: error instanceof Error ? error.name : "DatabaseError",
  });
  const code =
    action === "LOAD" ? "ASSIGNMENT_LOAD_FAILED" : "ASSIGNMENT_SAVE_FAILED";
  return c.json(
    { success: false, error: { code, message: KETIK_ERROR_MESSAGES[code] } },
    500,
  );
}
const recipientParam = z.object({ recipientId: z.uuid() });

export const ketikAssignments = new Hono<{ Variables: Variables }>()
  .get("/self", requireCapability("ketik.settings.read"), async (c) => {
    try {
      return c.json({
        success: true,
        data: await getKetikAssignment(getActor(c), getActor(c).id),
      });
    } catch (error) {
      return failure(c, error, "LOAD");
    }
  })
  .get(
    "/:recipientId",
    requireCapability("ketik.assignments.write"),
    zValidator("param", recipientParam),
    async (c) => {
      try {
        return c.json({
          success: true,
          data: await getKetikAssignment(
            getActor(c),
            c.req.valid("param").recipientId,
          ),
        });
      } catch (error) {
        return failure(c, error, "LOAD");
      }
    },
  )
  .put(
    "/:recipientId",
    requireCapability("ketik.assignments.write"),
    zValidator("param", recipientParam),
    zValidator("json", assignKetikConfigurationSchema),
    async (c) => {
      try {
        return c.json({
          success: true,
          data: await assignKetikConfiguration(
            getActor(c),
            c.req.valid("param").recipientId,
            c.req.valid("json"),
          ),
        });
      } catch (error) {
        return failure(c, error, "SAVE");
      }
    },
  );
