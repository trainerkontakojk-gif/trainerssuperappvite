import type { AgentDirectoryEntry } from "@trainers/types";
import { SIDAK_QA_TARGET, sidakScoreTone } from "./sidakScoreStatus";

export type AgentSort = "score-asc" | "score-desc" | "name";
export type AgentStatusFilter = "all" | "bad" | "warn" | "ok" | "unaudited";

export const AGENT_SORT_OPTIONS: { value: AgentSort; label: string }[] = [
  { value: "score-asc", label: "Skor terendah" },
  { value: "score-desc", label: "Skor tertinggi" },
  { value: "name", label: "Nama A–Z" },
];

export const AGENT_STATUS_OPTIONS: {
  value: AgentStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "Semua status" },
  { value: "bad", label: "Perlu perhatian" },
  { value: "warn", label: "Mendekati target" },
  { value: "ok", label: "Memenuhi target" },
  { value: "unaudited", label: "Belum diaudit" },
];

/** Status satu agen dengan ambang yang sama seperti skor di kartunya. */
export function agentStatus(agent: AgentDirectoryEntry): AgentStatusFilter {
  return agent.avgScore === null ? "unaudited" : sidakScoreTone(agent.avgScore);
}

export function isBelowTarget(agent: AgentDirectoryEntry): boolean {
  return agent.avgScore !== null && agent.avgScore < SIDAK_QA_TARGET;
}

const byName = (a: AgentDirectoryEntry, b: AgentDirectoryEntry) =>
  a.nama.localeCompare(b.nama, "id", { sensitivity: "base" });

/** Agen tanpa skor selalu di akhir urutan skor; seri diurutkan menurut nama. */
export function sortAgents(
  agents: AgentDirectoryEntry[],
  sort: AgentSort,
): AgentDirectoryEntry[] {
  if (sort === "name") return [...agents].sort(byName);
  const direction = sort === "score-asc" ? 1 : -1;
  return [...agents].sort((a, b) => {
    if (a.avgScore === null || b.avgScore === null) {
      if (a.avgScore === b.avgScore) return byName(a, b);
      return a.avgScore === null ? 1 : -1;
    }
    return (a.avgScore - b.avgScore) * direction || byName(a, b);
  });
}
