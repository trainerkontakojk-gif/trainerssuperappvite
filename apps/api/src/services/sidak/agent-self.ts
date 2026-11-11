import type { AgentSidakSelf } from "@trainers/types";
import type { Actor } from "../../middleware/role";
import { buildAgentSelfQa } from "../home/agent-summary";
import { getSidakAgentQuickview } from "./agent-quickview";

/**
 * SIDAK saya: the agent's own QA aggregate plus their standing in the latest
 * audited year. The participant ID is always the server-resolved self scope.
 * Ranks are computed against the whole team (`accessibleAgentIds: null`), but
 * only rank/total/team label leave the server; EFEK training is never added.
 */
export async function getAgentSidakSelf(actor: Actor): Promise<AgentSidakSelf> {
  const { summary, latest } = await buildAgentSelfQa(actor);
  if (!latest)
    return { linked: summary.linked, qa: summary.qa, standing: null };
  const quickview = await getSidakAgentQuickview({
    agentId: latest.pesertaId,
    year: latest.year,
    requestedServiceType: latest.serviceType,
    accessibleAgentIds: null,
    filterScope: null,
  });
  return {
    linked: true,
    qa: summary.qa,
    standing: {
      year: quickview.context.year,
      serviceType: quickview.context.serviceType,
      combinedTeam: quickview.combinedTeam,
      leaderTeam: quickview.leaderTeam,
      forecast: quickview.forecast,
    },
  };
}
