import { Hono } from "hono";
import { z } from "zod";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../../middleware/role";
import {
  getSidakAgentSimulationDetail,
  getSidakAgentSimulationHistory,
  SidakSimulationDataError,
  SidakSimulationNotFoundError,
} from "../../services/sidak/agent-simulations";
import {
  canReadSidakSimulationModule,
  resolveSidakSimulationAccess,
  SidakSimulationAccessError,
} from "../../services/sidak/simulation-access";

type Variables = { user: User; profile: any };

const sidakSimulations = new Hono<{ Variables: Variables }>();
const moduleSchema = z.enum(["all", "ketik", "pdkt", "telefun"]);
const simulationModuleSchema = z.enum(["ketik", "pdkt", "telefun"]);
const agentIdSchema = z.string().uuid();
const historyIdSchema = z.string().uuid();

function validationError(message: string) {
  return {
    success: false as const,
    error: { code: "VALIDATION_ERROR", message },
  };
}

function accessError(error: SidakSimulationAccessError) {
  return {
    success: false as const,
    error: { code: error.code, message: error.message },
  };
}

function dataError(error: unknown, fallback: string) {
  if (error instanceof SidakSimulationNotFoundError) {
    return {
      status: 404 as const,
      body: {
        success: false as const,
        error: { code: "NOT_FOUND", message: error.message },
      },
    };
  }
  if (error instanceof SidakSimulationDataError) {
    return {
      status: 503 as const,
      body: {
        success: false as const,
        error: { code: "DATA_UNAVAILABLE", message: error.message },
      },
    };
  }
  return {
    status: 503 as const,
    body: {
      success: false as const,
      error: { code: "DATA_UNAVAILABLE", message: fallback },
    },
  };
}

sidakSimulations.get(
  "/agents/:id/simulations",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const agentId = c.req.param("id");
    const parsedAgentId = agentIdSchema.safeParse(agentId);
    const parsedQuery = moduleSchema.safeParse(c.req.query("module") ?? "all");
    if (!parsedAgentId.success || !parsedQuery.success) {
      return c.json(validationError("Konteks riwayat simulasi tidak valid."), 400);
    }

    const user = c.get("user");
    const profile = c.get("profile");
    let access;
    try {
      access = await resolveSidakSimulationAccess({
        userId: user.id,
        role: profile?.role ?? "",
        agentId: parsedAgentId.data,
      });
    } catch (error) {
      if (error instanceof SidakSimulationAccessError) {
        return c.json(accessError(error), error.status);
      }
      return c.json(
        {
          success: false,
          error: {
            code: "SCOPE_UNAVAILABLE",
            message: "Scope SIDAK tidak dapat diverifikasi.",
          },
        },
        503,
      );
    }

    const requestedModule = parsedQuery.data;
    if (
      requestedModule !== "all" &&
      !canReadSidakSimulationModule(access, requestedModule)
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Modul simulasi ini tidak termasuk scope SIDAK Anda.",
          },
        },
        403,
      );
    }

    try {
      const data = await getSidakAgentSimulationHistory({
        agentId: parsedAgentId.data,
        module: requestedModule,
        cursor: c.req.query("cursor"),
        allowedModules: access.modules,
      });
      return c.json({ success: true, data });
    } catch (error) {
      const response = dataError(error, "Gagal memuat riwayat simulasi.");
      return c.json(response.body, response.status);
    }
  },
);

sidakSimulations.get(
  "/agents/:id/simulations/:module/:historyId",
  requireRole("admin", "trainer", "leader"),
  async (c) => {
    const parsedAgentId = agentIdSchema.safeParse(c.req.param("id"));
    const parsedModule = simulationModuleSchema.safeParse(c.req.param("module"));
    const parsedHistoryId = historyIdSchema.safeParse(c.req.param("historyId"));
    if (
      !parsedAgentId.success ||
      !parsedModule.success ||
      !parsedHistoryId.success
    ) {
      return c.json(validationError("Konteks detail simulasi tidak valid."), 400);
    }

    const user = c.get("user");
    const profile = c.get("profile");
    let access;
    try {
      access = await resolveSidakSimulationAccess({
        userId: user.id,
        role: profile?.role ?? "",
        agentId: parsedAgentId.data,
      });
    } catch (error) {
      if (error instanceof SidakSimulationAccessError) {
        return c.json(accessError(error), error.status);
      }
      return c.json(
        {
          success: false,
          error: {
            code: "SCOPE_UNAVAILABLE",
            message: "Scope SIDAK tidak dapat diverifikasi.",
          },
        },
        503,
      );
    }

    if (!canReadSidakSimulationModule(access, parsedModule.data)) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Modul simulasi ini tidak termasuk scope SIDAK Anda.",
          },
        },
        403,
      );
    }

    try {
      const data = await getSidakAgentSimulationDetail({
        agentId: parsedAgentId.data,
        module: parsedModule.data,
        historyId: parsedHistoryId.data,
        canPlayTelefunRecording: access.canPlayTelefunRecording,
      });
      return c.json({ success: true, data });
    } catch (error) {
      const response = dataError(error, "Gagal memuat detail simulasi.");
      return c.json(response.body, response.status);
    }
  },
);

export { sidakSimulations };
