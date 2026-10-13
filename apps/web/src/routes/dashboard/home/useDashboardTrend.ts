import { useCallback, useEffect, useState } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";

export interface TrendData {
  labels: string[];
  totalData: number[];
  serviceData: Record<string, number[]>;
  activeServices: string[];
  serviceSummary: Record<
    string,
    { totalDefects: number; auditedAgents: number }
  >;
  totalSummary: {
    totalDefects: number;
    auditedAgents: number;
    activeServiceCount: number;
  };
  topParameters?: Record<string, { name: string; count: number }>;
}

export type TrendMap = Record<"3m" | "6m" | "all", TrendData>;

/**
 * Data tren temuan untuk Beranda staff. Pengambilan dan pemilihan rentang
 * sama seperti dashboard sebelumnya; yang baru hanya status muat/gagal
 * eksplisit agar section bisa menampilkan state error + coba lagi.
 */
export function useDashboardTrend() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [serviceTrendMap, setServiceTrendMap] = useState<TrendMap | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [trendStartMonth, setTrendStartMonth] = useState<number | null>(null);
  const [trendEndMonth, setTrendEndMonth] = useState<number | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [localTrendData, setLocalTrendData] = useState<TrendData | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const years = await unwrapResponse(
        await sidakClient.dashboard["available-years"].$get(),
      );
      setAvailableYears((years as number[]) || []);
    } catch {
      // Tahun hanya mengisi pemilih; tren tetap bisa tampil tanpanya.
    }
    try {
      const trends = (await unwrapResponse(
        await sidakClient.dashboard.trend.$get(),
      )) as { trendMap: TrendMap };
      setServiceTrendMap(trends.trendMap);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchTrendDataByRange = async (
    year: number,
    start: number | null,
    end: number | null,
  ) => {
    setTrendLoading(true);
    try {
      const data = await unwrapResponse(
        await sidakClient.dashboard.trend.$get({
          query: {
            year: String(year),
            ...(start !== null ? { startMonth: String(start) } : {}),
            ...(end !== null ? { endMonth: String(end) } : {}),
          },
        }),
      );
      setLocalTrendData(data as TrendData);
    } catch (err) {
      console.error("Fetch trend range error:", err);
    } finally {
      setTrendLoading(false);
    }
  };

  const handleYearChange = async (year: number) => {
    setSelectedYear(year);
    setTrendStartMonth(null);
    setTrendEndMonth(null);
    await fetchTrendDataByRange(year, 1, 12);
  };

  const handleRangeChange = async (
    start: number | null,
    end: number | null,
  ) => {
    let targetStart = start;
    let targetEnd = end;

    if (targetStart === null && targetEnd !== null) targetStart = 1;
    else if (targetStart !== null && targetEnd === null)
      targetEnd = new Date().getMonth() + 1;

    setTrendStartMonth(targetStart);
    setTrendEndMonth(targetEnd);

    if (
      targetStart !== null &&
      targetEnd !== null &&
      targetEnd >= targetStart
    ) {
      await fetchTrendDataByRange(selectedYear, targetStart, targetEnd);
    } else if (targetStart === null && targetEnd === null) {
      setLocalTrendData(null);
    }
  };

  return {
    status,
    reload: load,
    serviceTrendMap,
    availableYears,
    selectedYear,
    trendStartMonth,
    trendEndMonth,
    trendLoading,
    localTrendData,
    /** Data yang sedang ditampilkan: rentang pilihan, atau seluruh data. */
    activeTrend: localTrendData ?? serviceTrendMap?.all ?? null,
    handleYearChange,
    handleRangeChange,
  };
}
