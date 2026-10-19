import type { AgentDirectoryEntry } from "@trainers/types";
import {
  validateSidakScopeSearch,
  type SidakScopeSearch,
} from "../hooks/useSidakScope";
import { SIDAK_QA_TARGET, sidakScoreTone } from "./sidakScoreStatus";

export type AgentSort = "score-asc" | "score-desc" | "name";
/** `below` = skor di bawah target 95, gabungan tone `bad` + `warn`. */
export type AgentStatusFilter =
  "all" | "bad" | "warn" | "ok" | "below" | "unaudited";

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
  { value: "below", label: "Di bawah target 95" },
  { value: "unaudited", label: "Belum diaudit" },
];

/** Status satu agen dengan ambang yang sama seperti skor di kartunya. */
export function agentStatus(
  agent: AgentDirectoryEntry,
): Exclude<AgentStatusFilter, "below"> {
  return agent.avgScore === null ? "unaudited" : sidakScoreTone(agent.avgScore);
}

export function isBelowTarget(agent: AgentDirectoryEntry): boolean {
  return agent.avgScore !== null && agent.avgScore < SIDAK_QA_TARGET;
}

/** Apakah agen lolos filter status; `below` memakai target, bukan tone. */
export function matchesStatusFilter(
  agent: AgentDirectoryEntry,
  filter: AgentStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "below") return isBelowTarget(agent);
  return agentStatus(agent) === filter;
}

/** Query `/sidak/agents`: cakupan bersama SIDAK + filter status awal. */
export type SidakAgentsSearch = SidakScopeSearch & {
  status?: AgentStatusFilter;
};

/**
 * Validasi query daftar agen. Nilai `status` yang tidak dikenal (atau `all`)
 * diabaikan, bukan error, supaya URL yang diedit tangan tetap membuka daftar.
 */
export function validateSidakAgentsSearch(
  search: Record<string, unknown>,
): SidakAgentsSearch {
  const scope = validateSidakScopeSearch(search);
  const status =
    typeof search.status === "string"
      ? AGENT_STATUS_OPTIONS.find((option) => option.value === search.status)
      : undefined;
  // TanStack merges validated search with the original keys. Explicitly clear
  // an invalid status; omission alone can leave the raw query in useSearch().
  return {
    ...scope,
    status: status?.value === "all" ? undefined : status?.value,
  };
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
