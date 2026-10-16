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

/** `?tab=` di detail agen; Ringkasan (bawaan) tidak ditulis ke alamat. */
export function validateAgentDetailSearch(search: Record<string, unknown>): {
  tab?: Exclude<SidakAgentDetailTab, "summary">;
} {
  const tab = SIDAK_AGENT_DETAIL_TABS.find(
    (item) => item.id === search.tab && item.id !== "summary",
  );
  return tab ? { tab: tab.id as Exclude<SidakAgentDetailTab, "summary"> } : {};
}
