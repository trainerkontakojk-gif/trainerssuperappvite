import type { DashboardAgentGroup, DashboardTemuanRow } from "./dashboard-types";

export function groupTemuanByAgent(rows: DashboardTemuanRow[]): DashboardAgentGroup[] {
  const agentMap = new Map<string, DashboardAgentGroup>();

  for (const row of rows) {
    const pid = row.peserta_id;
    if (!agentMap.has(pid)) {
      const p = row.profiler_peserta;
      agentMap.set(pid, {
        id: pid,
        nama: p?.nama ?? "Unknown",
        batch_name: p?.batch_name ?? "",
        tim: p?.tim ?? "",
        jabatan: p?.jabatan ?? "",
        rows: [],
      });
    }
    agentMap.get(pid)!.rows.push(row);
  }

  return Array.from(agentMap.values());
}

export function getScoreRows(rows: DashboardTemuanRow[]): DashboardTemuanRow[] {
  const realRows = rows.filter((row) => row.is_phantom_padding !== true);
  return realRows.length > 0 ? realRows : rows;
}
