import { useCallback, useEffect, useState } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
import { SERVICE_LABELS } from "../../../lib/scoring";

export interface TrendData {
  /** Label periode dari API, mis. "Sep 26" (urut lama → baru). */
  labels: string[];
  totalData: number[];
  serviceData: Record<string, number[]>;
  activeServices: string[];
  serviceSummary: Record<
    string,
    { totalDefects: number; auditedAgents: number }
  >;
  /** Ringkasan periode terakhir dalam rentang. */
  totalSummary: {
    totalDefects: number;
    auditedAgents: number;
    activeServiceCount: number;
  };
}

/** Rentang yang disediakan `GET /sidak/dashboard/trend`; `all` = 12 periode. */
export type TrendRange = "3m" | "6m" | "all";
export type TrendMap = Record<TrendRange, TrendData>;

/** Nama tampilan layanan, mis. `call` → "Call". */
export function serviceLabel(service: string) {
  return SERVICE_LABELS[service as keyof typeof SERVICE_LABELS] ?? service;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; trendMap: TrendMap };

/** Tren temuan untuk Beranda staff, dengan status muat/gagal eksplisit. */
export function useDashboardTrend() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = (await unwrapResponse(
        await sidakClient.dashboard.trend.$get(),
      )) as { trendMap: TrendMap };
      setState({ status: "ready", trendMap: data.trendMap });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
