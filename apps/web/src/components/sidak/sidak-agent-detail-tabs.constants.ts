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
