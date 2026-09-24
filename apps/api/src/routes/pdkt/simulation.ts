import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  generateEmailPromptSchema,
  pdktSessionGenerationSchema,
  simulationSubjectSelectionSchema,
  type PdktMailboxBatch,
  type SimulationSubjectSnapshot,
  type EmailMessage,
} from "@trainers/types";
import * as pdktService from "../../services/pdkt-service";
import { requireRole } from "../../middleware/role";
import { SimulationSubjectError } from "../../services/simulation-subject-service";
import { aiRateLimitMiddleware } from "../../middleware/rateLimit";
import { createMailboxSession } from "../../services/pdkt/mailbox-session";
import {
  Variables,
  getUserClient,
  jsonNotFound,
  jsonAiError,
  pdktErrorMessage,
  pdktErrorStatus,
  resolveRequestSimulationSubject,
} from "./route-utils";
import { createPdktMailboxRetryDraft } from "../../services/pdkt/mailbox-retry";
import {
  toPdktSimulationConfig,
  toPdktSimulationScenario,
} from "../../services/pdkt/scenario-projections";

const simulation = new Hono<{ Variables: Variables }>();

simulation.get(
  "/scenarios",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  (c) => {
    const scenarios = pdktService.getScenarios().map(toPdktSimulationScenario);
    return c.json({ success: true, data: scenarios });
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
  zValidator("json", generateEmailPromptSchema),
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
  zValidator(
    "json",
    pdktSessionGenerationSchema.extend({
      client_request_id: z.string().max(200).optional(),
      simulationSubject: simulationSubjectSelectionSchema.optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;

    let simulationSubject: SimulationSubjectSnapshot;
    try {
      simulationSubject = await resolveRequestSimulationSubject(
        c,
        body.simulationSubject,
      );
    } catch (error: unknown) {
      if (error instanceof SimulationSubjectError) {
        return c.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          error.status as 400,
        );
      }
      throw error;
    }

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

    const result = await pdktService.initializeEmailSession(
      config,
      { module: "pdkt", action: "start_session" },
      userId,
    );

    if (!result.success) {
      return jsonAiError(c, result.error || "Gagal inisialisasi sesi email.");
    }

    if (!result.message) {
      return jsonAiError(c, "Gagal inisialisasi sesi email.");
    }
    const initMessage: EmailMessage = result.message;
    const retryBatch: PdktMailboxBatch = {
      client_request_id: body.client_request_id || `pdkt-${randomUUID()}`,
      sender_name: config.identity.name,
      sender_email: config.identity.email,
      subject: initMessage.subject,
      snippet: initMessage.body.substring(0, 100),
      scenario_snapshot: scenario,
      config_snapshot: config,
      inbound_email: initMessage,
      simulationSubject: body.simulationSubject ?? { type: "self" as const },
    };
    const retryDraft = createPdktMailboxRetryDraft({
      actorId: userId,
      batch: retryBatch,
      simulationSubjectSnapshot: simulationSubject,
    });

    return c.json({
      success: true,
      data: {
        // Keep the original flat EmailMessage fields for existing callers;
        // additive metadata and the explicit message alias support retry-aware
        // clients without changing the legacy response shape.
        ...initMessage,
        message: initMessage,
        simulationSubject,
        mailboxDraftToken: retryDraft.token,
      },
    });
  },
);

simulation.post(
  "/session/create",
  requireRole("admin", "trainer", "leader", "tl", "spv", "om", "agent"),
  aiRateLimitMiddleware,
  zValidator(
    "json",
    pdktSessionGenerationSchema.extend({
      client_request_id: z.string().max(200).optional(),
      simulationSubject: simulationSubjectSelectionSchema.optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const userId = user?.id;
    const userClient = getUserClient(c);
    let simulationSubject: SimulationSubjectSnapshot;
    try {
      simulationSubject = await resolveRequestSimulationSubject(
        c,
        body.simulationSubject,
      );
    } catch (error: unknown) {
      if (error instanceof SimulationSubjectError) {
        return c.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          error.status as 400,
        );
      }
      throw error;
    }

    const result = await createMailboxSession(
      userClient,
      {
        ...body,
        simulationSubjectSnapshot: simulationSubject,
      },
      userId,
    );

    if (!result.success) {
      if (result.code === "AI_ERROR") {
        return jsonAiError(c, result.error || "Gagal membuat sesi mailbox.");
      }
      const status = pdktErrorStatus(result, 503);
      const retryBatch = result.retryDraft?.batch;
      const details = result.retryDraft && retryBatch
        ? {
            retryable: true,
            retryDraft: {
              token: result.retryDraft.token,
              batch: {
                ...retryBatch,
                scenario_snapshot: toPdktSimulationScenario(
                  retryBatch.scenario_snapshot,
                ),
                config_snapshot: toPdktSimulationConfig(
                  retryBatch.config_snapshot,
                ),
              },
              inbound_email: retryBatch.inbound_email,
              simulationSubject: result.retryDraft.simulationSubjectSnapshot,
            },
          }
        : undefined;
      return c.json(
        {
          success: false,
          error: {
            code:
              result.code || (status === 409 ? "CONFLICT" : "DATABASE_ERROR"),
            message: pdktErrorMessage(result.error),
            ...(details ? { details } : {}),
          },
        },
        status as any,
      );
    }

    return c.json({
      success: true,
      data: {
        id: result.data,
        message: result.message,
        simulationSubject,
      },
    });
  },
);

export { simulation };
