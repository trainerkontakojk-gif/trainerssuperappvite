import {
  validateSidakScopeSearch,
  type SidakScopeSearch,
} from "../../hooks/useSidakScope";

export type SidakAgentDetailTab =
  | "summary"
  | "trend"
  | "temuan"
  | "heatmap"
  | "simulations";

export const SIDAK_AGENT_DETAIL_TABS: ReadonlyArray<{
  id: SidakAgentDetailTab;
  label: string;
}> = [
  { id: "summary", label: "Ringkasan" },
  { id: "trend", label: "Tren" },
  { id: "temuan", label: "Temuan" },
  { id: "heatmap", label: "Heatmap" },
  { id: "simulations", label: "Simulasi" },
];

/**
 * Query detail agen: cakupan bersama SIDAK (layanan, tahun, bulan) ditambah
 * `?tab=`. Ringkasan (bawaan) tidak ditulis ke alamat.
 */
export function validateAgentDetailSearch(
  search: Record<string, unknown>,
): SidakScopeSearch & { tab?: Exclude<SidakAgentDetailTab, "summary"> } {
  const scope = validateSidakScopeSearch(search);
  const tab = SIDAK_AGENT_DETAIL_TABS.find(
    (item) => item.id === search.tab && item.id !== "summary",
  );
  return tab
    ? { ...scope, tab: tab.id as Exclude<SidakAgentDetailTab, "summary"> }
    : scope;
}
