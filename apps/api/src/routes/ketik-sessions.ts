import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  KETIK_SESSION_ERRORS,
  startKetikSessionSchema,
  ketikSessionTurnSchema,
  finishKetikSessionSchema,
} from "@trainers/types";
import { getActor, requireCapability } from "../middleware/role";
import { aiRateLimitMiddleware } from "../middleware/rateLimit";
import {
  getUserClient,
  resolveRequestSimulationSubject,
  type Variables,
} from "./pdkt/route-utils";
import { SimulationSubjectError } from "../services/simulation-subject-service";
import {
  startServerKetikSession,
  getServerKetikSession,
  sendServerKetikTurn,
  finishServerKetikSession,
  KetikSessionError,
} from "../services/ketik/server-sessions";

function failure(c: Context<{ Variables: Variables }>, error: unknown) {
  if (error instanceof KetikSessionError)
    return c.json(
      { success: false, error: { code: error.code, message: error.message } },
      error.status,
    );
  if (
    error instanceof SimulationSubjectError &&
    (error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 500)
  )
    return c.json(
      { success: false, error: { code: error.code, message: error.message } },
      error.status,
    );
  console.error("[KETIK] Session operation failed", {
    kind: error instanceof Error ? error.name : "DatabaseError",
  });
  return c.json(
    {
      success: false,
      error: {
        code: "SESSION_FAILED",
        message: KETIK_SESSION_ERRORS.SESSION_FAILED,
      },
    },
    500,
  );
}
const idSchema = z.object({ id: z.uuid() });
export const ketikSessions = new Hono<{ Variables: Variables }>()
  .post(
    "/",
    requireCapability("ketik.use"),
    zValidator("json", startKetikSessionSchema),
    async (c) => {
      try {
        const body = c.req.valid("json");
        const subject = await resolveRequestSimulationSubject(
          c,
          body.simulationSubject,
        );
        return c.json({
          success: true,
          data: await startServerKetikSession(
            getActor(c),
            body.requestId,
            subject,
          ),
        });
      } catch (error) {
        return failure(c, error);
      }
    },
  )
  .get(
    "/:id",
    requireCapability("ketik.use"),
    zValidator("param", idSchema),
    async (c) => {
      try {
        return c.json({
          success: true,
          data: await getServerKetikSession(
            getActor(c).id,
            c.req.valid("param").id,
            getUserClient(c),
          ),
        });
      } catch (error) {
        return failure(c, error);
      }
    },
  )
  .post(
    "/:id/turns",
    requireCapability("ketik.use"),
    aiRateLimitMiddleware,
    zValidator("param", idSchema),
    zValidator("json", ketikSessionTurnSchema),
    async (c) => {
      try {
        return c.json({
          success: true,
          data: await sendServerKetikTurn(
            getActor(c).id,
            c.req.valid("param").id,
            c.req.valid("json"),
          ),
        });
      } catch (error) {
        return failure(c, error);
      }
    },
  )
  .post(
    "/:id/finish",
    requireCapability("ketik.use"),
    zValidator("param", idSchema),
    zValidator("json", finishKetikSessionSchema),
    async (c) => {
      try {
        return c.json({
          success: true,
          data: await finishServerKetikSession(
            getActor(c).id,
            c.req.valid("param").id,
          ),
        });
      } catch (error) {
        return failure(c, error);
      }
    },
  );
