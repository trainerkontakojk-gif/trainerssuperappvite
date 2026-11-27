import {
  SIDAK_TIME_SOURCE,
  serviceTypeSchema,
  type SidakHeatmapTimeProfileResponse,
} from "@trainers/types";

export function emptyTimeProfile(
  query: URLSearchParams,
): SidakHeatmapTimeProfileResponse {
  const serviceType =
    serviceTypeSchema.safeParse(query.get("service_type")).data ?? null;
  const source = serviceType ? SIDAK_TIME_SOURCE[serviceType] : null;
  return {
    year: Number(query.get("year")),
    serviceType,
    agentId: query.get("agent_id"),
    countBy: query.get("count_by") === "tiket" ? "tiket" : "parameter",
    hours:
      source?.kind === "jam"
        ? {
            label: source.label,
            cells: [],
            buckets: { pagi: 0, siang: 0, sore: 0, luar: 0 },
            total: 0,
            missingTime: 0,
          }
        : null,
    hoursByService: serviceType ? null : [],
    durations:
      !serviceType || source?.kind === "durasi"
        ? {
            buckets: {
              singkat: 0,
              sedang: 0,
              panjang: 0,
              sangat_panjang: 0,
            },
            total: 0,
            missingDuration: 0,
            reviewBelowOneMinute: 0,
          }
        : null,
    notApplicable: 0,
  };
}
