import type { TopAgentData } from "@trainers/types";
import { writeFlatExcel } from "../lib/excel-utils";

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
  fileName: string;
}): Promise<void> {
  const rows = options.agents.map((agent) => ({
    Peringkat: agent.rank ?? null,
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
