import type { TopAgentData } from "@trainers/types";
import { writeFlatExcel } from "../lib/excel-utils";

const collator = new Intl.Collator("id", {
  sensitivity: "base",
  numeric: true,
});

/**
 * Peringkat bisnis: temuan terbanyak = 1, jumlah temuan sama berbagi
 * peringkat. Urutan tampilan tabel tidak mengubah peringkat ini.
 */
export function computeRanks(agents: TopAgentData[]): Map<string, number> {
  const ordered = [...agents].sort(
    (a, b) => b.defects - a.defects || collator.compare(a.nama, b.nama),
  );
  const ranks = new Map<string, number>();
  let previousDefects: number | undefined;
  let previousRank = 0;
  ordered.forEach((agent, index) => {
    const rank =
      index > 0 && agent.defects === previousDefects ? previousRank : index + 1;
    ranks.set(agent.agentId, rank);
    previousDefects = agent.defects;
    previousRank = rank;
  });
  return ranks;
}

/** Nama agen lain yang berbagi jumlah temuan (= peringkat) per agen. */
export function tiedNames(agents: TopAgentData[]): Map<string, string[]> {
  const byDefects = new Map<number, string[]>();
  for (const agent of agents) {
    byDefects.set(agent.defects, [
      ...(byDefects.get(agent.defects) ?? []),
      agent.nama,
    ]);
  }
  const result = new Map<string, string[]>();
  for (const agent of agents) {
    const peers = (byDefects.get(agent.defects) ?? [])
      .filter((name) => name !== agent.nama)
      .sort((a, b) => collator.compare(a, b));
    if (peers.length > 0) result.set(agent.agentId, peers);
  }
  return result;
}

export const NO_TEAM_LABEL = "Tanpa tim";

/** Teks bila ranking tidak punya periode pembanding (tidak pernah kosong). */
export const NO_COMPARISON_LABEL = "Tanpa pembanding";

/** Label perubahan posisi; tanpa periode pembanding ditulis apa adanya. */
export function rankChangeLabel(
  rankChange: number | null | undefined,
): string {
  if (rankChange === undefined) return NO_COMPARISON_LABEL;
  if (rankChange === null) return "Baru";
  if (rankChange > 0) return `Prioritas naik +${rankChange}`;
  if (rankChange < 0) return `Prioritas turun ${Math.abs(rankChange)}`;
  return "Tetap";
}

/** Unduh baris ranking yang tampil sebagai .xlsx, angka tetap angka. */
export async function downloadRankingXlsx(options: {
  agents: TopAgentData[];
  ranks: Map<string, number>;
  fileName: string;
}): Promise<void> {
  const rows = options.agents.map((agent) => ({
    Peringkat: options.ranks.get(agent.agentId) ?? null,
    Agen: agent.nama,
    Tim: agent.tim?.trim() || NO_TEAM_LABEL,
    Batch: agent.batch ?? "",
    Temuan: agent.defects,
    "Skor QA": Math.round(agent.score * 10) / 10,
    Kritikal: agent.criticalFindings ?? 0,
    "Perubahan posisi": rankChangeLabel(agent.rankChange),
  }));
  await writeFlatExcel("Ranking", rows, options.fileName);
}
