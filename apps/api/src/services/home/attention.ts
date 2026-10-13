import {
  can,
  type HomeAttentionItem,
  type HomeAttentionKind,
  type HomeAttentionResponse,
} from "@trainers/types";
import type { Actor } from "../../middleware/role";
import { getCurrentWibMonth } from "../../lib/timezone";
import { getPendingLeaderRequests } from "../admin-service";
import * as sidakService from "../sidak-service";

type Source = {
  kind: HomeAttentionKind;
  load: () => Promise<HomeAttentionItem | null>;
};

/**
 * Item "Perlu tindakan" di Beranda. Setiap sumber memakai ulang fungsi dan
 * scope yang sama dengan halaman asalnya, hanya dijalankan bila capability
 * peran mengizinkan, dan tidak saling menggagalkan.
 */
export async function getHomeAttention(
  actor: Actor,
): Promise<HomeAttentionResponse> {
  const current = getCurrentWibMonth();
  const sources: Source[] = [];

  if (can(actor.role, "admin.leaderAccess")) {
    sources.push({
      kind: "leader_access_pending",
      // Sumber yang sama dengan `GET /admin/leader-requests/pending`.
      load: async () => {
        const count = (await getPendingLeaderRequests()).length;
        return { kind: "leader_access_pending", count, scope: "all" };
      },
    });
  }

  if (can(actor.role, "sidak.read")) {
    sources.push({
      kind: "agents_below_target",
      // Definisi dan scope yang sama dengan `GET /sidak/agents`.
      load: async () => {
        const [accessibleIds, filterScope] = await Promise.all([
          sidakService.getAccessibleAgentIds(actor.id, actor.role),
          sidakService.getAccessibleSidakFilters(actor.id, actor.role),
        ]);
        const { agents } = await sidakService.getAgentDirectorySummary(
          current.year,
          accessibleIds ?? undefined,
          false,
          filterScope?.allowedServices ?? undefined,
        );
        return {
          kind: "agents_below_target",
          count: agents.filter((agent) => agent.atRisk).length,
          scope: accessibleIds === null ? "all" : "team",
        };
      },
    });
  }

  if (can(actor.role, "sidak.config.manage")) {
    sources.push({
      kind: "qa_period_missing",
      load: async () => {
        const periods = await sidakService.getPeriods();
        const exists = periods.some(
          (period) =>
            period.year === current.year && period.month === current.month,
        );
        return {
          kind: "qa_period_missing",
          count: exists ? 0 : 1,
          scope: "all",
          period: current,
        };
      },
    });
  }

  const results = await Promise.allSettled(sources.map((s) => s.load()));
  const items: HomeAttentionItem[] = [];
  let partial = false;
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      partial = true;
      console.error(
        `[home/attention] sumber ${sources[index]!.kind} gagal dimuat`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
      return;
    }
    if (result.value && result.value.count > 0) items.push(result.value);
  });

  return { items, partial };
}
