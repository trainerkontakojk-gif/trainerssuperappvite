import { useCallback, useEffect, useRef, useState } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
import { SERVICE_LABELS } from "../../../lib/scoring";

/** Temuan dan agen diaudit pada satu periode (per layanan dan total). */
export interface TrendServiceStat {
  totalDefects: number;
  auditedAgents: number;
}

export interface TrendPeriodStat {
  id: string;
  label: string;
  totalDefects: number;
  auditedAgents: number;
  serviceStats: Record<string, TrendServiceStat>;
}

export interface TrendData {
  /** Label periode dari API, mis. "Sep 26" (urut lama → baru). */
  labels: string[];
  totalData: number[];
  serviceData: Record<string, number[]>;
  activeServices: string[];
  /** Per layanan, dihitung atas seluruh rentang. */
  serviceSummary: Record<
    string,
    { totalDefects: number; auditedAgents: number }
  >;
  /** Ringkasan atas seluruh rentang. */
  totalSummary: {
    totalDefects: number;
    auditedAgents: number;
    activeServiceCount: number;
  };
  /** Per periode (selaras `labels`): temuan dan agen diaudit. */
  periodStats: TrendPeriodStat[];
}

/** Rentang bulan (1–12) dalam tahun berjalan. */
export interface MonthRange {
  start: number;
  end: number;
}

/** Nama tampilan layanan, mis. `call` → "Call". */
export function serviceLabel(service: string) {
  return SERVICE_LABELS[service as keyof typeof SERVICE_LABELS] ?? service;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; trend: TrendData };

/**
 * Tren temuan untuk Beranda staff: tahun berjalan, default Januari s.d. bulan
 * ini (YTD). Data lama tetap tampil selama rentang baru dimuat; respons yang
 * sudah tidak sesuai rentang terakhir diabaikan.
 */
export function useDashboardTrend() {
  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [range, setRange] = useState<MonthRange>({
    start: 1,
    end: currentMonth,
  });
  const [state, setState] = useState<State>({ status: "loading" });
  const [pending, setPending] = useState(false);
  /** Periode QA terakhir tahun ini; hanya diperbarui oleh rentang s.d. bulan ini. */
  const [latestLabel, setLatestLabel] = useState<string | undefined>();
  const requestId = useRef(0);

  const load = useCallback(
    async (next: MonthRange) => {
      const id = ++requestId.current;
      setPending(true);
      try {
        const trend = (await unwrapResponse(
          await sidakClient.dashboard.trend.$get({
            query: {
              year: String(year),
              startMonth: String(next.start),
              endMonth: String(next.end),
            },
          }),
        )) as TrendData;
        if (next.end === currentMonth) setLatestLabel(trend.labels.at(-1));
        if (id === requestId.current) setState({ status: "ready", trend });
      } catch {
        if (id === requestId.current) setState({ status: "error" });
      } finally {
        if (id === requestId.current) setPending(false);
      }
    },
    [year, currentMonth],
  );

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    void load(range);
  }, [load, range]);

  return {
    ...state,
    year,
    currentMonth,
    range,
    setRange,
    pending,
    latestLabel,
    reload,
  };
}
