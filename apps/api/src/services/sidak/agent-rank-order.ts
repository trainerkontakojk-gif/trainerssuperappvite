import type { TopAgentData } from "@trainers/types";

const collator = new Intl.Collator("id", {
  sensitivity: "base",
  numeric: true,
});

type AgentComparator = (left: TopAgentData, right: TopAgentData) => number;

// Nama bukan ukuran kinerja; ID menjadi penjamin terakhir untuk nama identik.
const compareIdentity: AgentComparator = (left, right) =>
  collator.compare(left.nama, right.nama) ||
  (left.agentId < right.agentId ? -1 : left.agentId > right.agentId ? 1 : 0);

/** Prioritas coaching: yang paling perlu perhatian berada di atas. */
export const comparePriority: AgentComparator = (left, right) =>
  right.defects - left.defects ||
  (right.criticalFindings ?? 0) - (left.criticalFindings ?? 0) ||
  left.score - right.score ||
  compareIdentity(left, right);

/** Quickview: kinerja terbaik berada di atas; identitas tetap A–Z. */
export const compareLeastFindings: AgentComparator = (left, right) =>
  left.defects - right.defects ||
  (left.criticalFindings ?? 0) - (right.criticalFindings ?? 0) ||
  right.score - left.score ||
  compareIdentity(left, right);

/** Nomor unik berurutan, tanpa memutasi urutan sumber. */
export function assignRanks(
  agents: TopAgentData[],
  compare: AgentComparator,
): Map<string, number> {
  return new Map(
    [...agents].sort(compare).map((agent, index) => [agent.agentId, index + 1]),
  );
}
