import type { TnaParameterDetail } from "@trainers/types";
import { deriveAgentRootCauses } from "../sidak/agent-root-causes";
import type { ListTnaParametersArgs } from "./parameters";
import { getTnaParameterAnalysis } from "./analysis";
import { listTnaPrograms } from "./read-service";
export { TnaIndicatorNotFoundError } from "./analysis";

export async function getTnaParameterDetail(
  args: Omit<ListTnaParametersArgs, "listingScope"> & { indicatorId: string },
): Promise<TnaParameterDetail> {
  const { metrics, findings, period } = await getTnaParameterAnalysis(args);
  const clusters = deriveAgentRootCauses({
    temuan: findings.map((row) => ({
      ...row,
      service_type: args.serviceType,
      nilai: row.nilai ?? 3,
      is_phantom_padding: row.is_phantom_padding === true,
      tahun: period.year,
    })),
    indicators: [
      {
        id: args.indicatorId,
        service_type: args.serviceType,
        name: metrics.parameterName,
        category: metrics.category,
        bobot: 1,
        has_na: false,
      },
    ],
    periodById: new Map([[period.id, period]]),
    serviceType: args.serviceType,
  });
  const affected = new Map<
    string,
    TnaParameterDetail["affected_agents"][number]
  >();
  for (const row of findings) {
    const agent = affected.get(row.peserta_id);
    if (agent) agent.findings++;
    else
      affected.set(row.peserta_id, {
        peserta_id: row.peserta_id,
        nama: row.profiler_peserta?.nama ?? null,
        tim: row.profiler_peserta?.tim ?? null,
        findings: 1,
      });
  }
  const tickets = new Map<
    string,
    TnaParameterDetail["sample_tickets"][number]
  >();
  for (const row of findings) {
    const ticket = row.no_tiket?.trim();
    if (!ticket || tickets.has(ticket.toUpperCase())) continue;
    tickets.set(ticket.toUpperCase(), {
      id: row.id,
      peserta_id: row.peserta_id,
      no_tiket: ticket,
      ketidaksesuaian: row.ketidaksesuaian,
      sebaiknya: row.sebaiknya,
    });
    if (tickets.size === 10) break;
  }
  const programs = await listTnaPrograms(args.supabase);
  return {
    metrics,
    affected_agents: [...affected.values()].sort(
      (a, b) =>
        b.findings - a.findings || a.peserta_id.localeCompare(b.peserta_id),
    ),
    clusters,
    sample_tickets: [...tickets.values()],
    suggested_programs: programs.filter(
      (program) =>
        (program.service_types.length === 0 ||
          program.service_types.includes(args.serviceType)) &&
        program.trigger_clusters.some((cluster) =>
          clusters.some((result) => result.clusterId === cluster),
        ),
    ),
  };
}
