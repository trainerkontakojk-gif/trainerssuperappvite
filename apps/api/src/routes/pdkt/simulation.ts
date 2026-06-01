import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { generateEmailSchema } from "@trainers/types";
import * as pdktService from "../../services/pdkt-service";
import { requireRole } from "../../middleware/role";
import { aiRateLimitMiddleware } from "../../middleware/rateLimit";
import { createMailboxSession } from "../../services/pdkt/mailbox-session";
import {
  Variables,
  getUserClient,
  jsonNotFound,
  jsonAiError,
} from "./route-utils";

const simulation = new Hono<{ Variables: Variables }>();

simulation.get(
  "/scenarios",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  (c) => {
    return c.json({ success: true, data: pdktService.getScenarios() });
  },
);

simulation.get(
  "/consumer-types",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  (c) => {
    return c.json({ success: true, data: pdktService.getConsumerTypes() });
  },
);

simulation.post(
  "/generate-identity",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  (c) => {
    return c.json({
      success: true,
      data: pdktService.generateRandomIdentity(),
    });
  },
);

simulation.post(
  "/generate-template",
  requireRole("admin", "trainer", "leader"),
  aiRateLimitMiddleware,
  zValidator("json", generateEmailSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    let configInfo;
    try {
      configInfo = pdktService.resolvePdktGenerationConfig(body);
    } catch (err: unknown) {
      return jsonNotFound(
        c,
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Scenario atau consumer type tidak ditemukan.",
      );
    }
    const { scenario, config } = configInfo;

    const result = await pdktService.generateScenarioEmailTemplate(
      scenario,
      config,
      { module: "pdkt", action: "generate_email_template" },
      userId,
    );

    if (!result.success) {
      return jsonAiError(c, result.error || "Gagal generate template.");
    }

    return c.json({
      success: true,
      data: { subject: result.subject, body: result.body },
    });
  },
);

simulation.post(
  "/session/init",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  aiRateLimitMiddleware,
  zValidator("json", generateEmailSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    let configInfo;
    try {
      configInfo = pdktService.resolvePdktGenerationConfig(body);
    } catch (err: unknown) {
      return jsonNotFound(
        c,
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Scenario atau consumer type tidak ditemukan.",
      );
    }
    const { config } = configInfo;

    const result = await pdktService.initializeEmailSession(
      config,
      { module: "pdkt", action: "start_session" },
      userId,
    );

    if (!result.success) {
      return jsonAiError(c, result.error || "Gagal inisialisasi sesi email.");
    }

    return c.json({
      success: true,
      data: result.message,
    });
  },
);

simulation.post(
  "/session/create",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  aiRateLimitMiddleware,
  zValidator(
    "json",
    generateEmailSchema.extend({
      client_request_id: z.string().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;
    const userClient = getUserClient(c);

    const result = await createMailboxSession(userClient, body, userId);

    if (!result.success) {
      return jsonAiError(c, result.error || "Gagal membuat sesi mailbox.");
    }

    return c.json({
      success: true,
      data: {
        id: result.data,
        message: result.message,
      },
    });
  },
);

export { simulation };
