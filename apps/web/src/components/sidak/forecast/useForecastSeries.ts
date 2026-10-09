import { useEffect, useMemo, useState } from "react";
import type {
  DashboardData,
  SidakBatchForecastSnapshot,
} from "@trainers/types";
import { MAX_VISIBLE_PARAMETER_SERIES } from "../../../utils/forecastFormat";

type Dataset = DashboardData["paramTrend"]["datasets"][number];

/**
 * State seri grafik Forecast: toggle total, chip parameter (maksimal 2 seri
 * tampil sekaligus), dan tampil/sembunyi prediksi. State direset saat filter
 * dashboard (`resetKey`) berubah atau snapshot forecast baru masuk.
 */
export function useForecastSeries({
  datasets,
  snapshot,
  resetKey,
}: {
  datasets: Dataset[] | undefined;
  snapshot: SidakBatchForecastSnapshot | null;
  resetKey: string;
}) {
  const [showForecastPrediction, setShowForecastPrediction] = useState(true);
  const [hiddenParams, setHiddenParams] = useState<Set<string> | null>(null);
  const [showTotalTrend, setShowTotalTrend] = useState(true);

  const serviceTrendDatasets = useMemo(
    () => (datasets ?? []).filter((dataset) => showTotalTrend || !dataset.isTotal),
    [datasets, showTotalTrend],
  );
  const serviceParameterDatasets = useMemo(
    () => serviceTrendDatasets.filter((dataset) => !dataset.isTotal),
    [serviceTrendDatasets],
  );
  const defaultHiddenParams = useMemo(
    () => new Set(serviceParameterDatasets.map((dataset) => dataset.label)),
    [serviceParameterDatasets],
  );
  const activeHiddenParams = hiddenParams ?? defaultHiddenParams;
  const visibleParameterDatasets = useMemo(
    () =>
      serviceParameterDatasets.filter(
        (dataset) => !activeHiddenParams.has(dataset.label),
      ),
    [activeHiddenParams, serviceParameterDatasets],
  );
  // Maksimal 2 seri tampil sekaligus: total + 1 parameter, atau 2 parameter.
  const visibleSeriesCount =
    visibleParameterDatasets.length + (showTotalTrend ? 1 : 0);
  const limitReached = visibleSeriesCount >= MAX_VISIBLE_PARAMETER_SERIES;
  const canActivateMoreParams = !limitReached;
  const canShowTotalTrend = showTotalTrend || !limitReached;

  const visibleServiceForecastResults = useMemo(() => {
    if (!showForecastPrediction || !snapshot) return [];

    const parameterSeries = visibleParameterDatasets
      .map((dataset) => snapshot.series.parameters[dataset.label] ?? null)
      .filter(
        (series): series is NonNullable<typeof series> => series !== null,
      );

    return showTotalTrend
      ? [snapshot.series.total, ...parameterSeries]
      : parameterSeries;
  }, [snapshot, showForecastPrediction, showTotalTrend, visibleParameterDatasets]);

  useEffect(() => {
    setShowForecastPrediction(true);
  }, [snapshot]);

  useEffect(() => {
    setHiddenParams(null);
    setShowTotalTrend(true);
  }, [resetKey]);

  const toggleTotal = () => {
    if (!canShowTotalTrend) return;
    // Grafik tidak boleh kosong: mematikan total tanpa parameter aktif
    // menyalakan parameter pertama.
    if (
      showTotalTrend &&
      visibleParameterDatasets.length === 0 &&
      serviceParameterDatasets.length > 0
    ) {
      const [firstParameter] = serviceParameterDatasets;
      setHiddenParams((prev) => {
        const next = new Set(prev ?? defaultHiddenParams);
        next.delete(firstParameter.label);
        return next;
      });
    }
    setShowTotalTrend((current) => !current);
  };

  const toggleParameter = (label: string) => {
    if (activeHiddenParams.has(label) && !canActivateMoreParams) return;
    setHiddenParams((prev) => {
      const next = new Set(prev ?? defaultHiddenParams);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return {
    showTotalTrend,
    showForecastPrediction,
    serviceTrendDatasets,
    serviceParameterDatasets,
    activeHiddenParams,
    canActivateMoreParams,
    canShowTotalTrend,
    limitReached,
    visibleServiceForecastResults,
    toggleTotal,
    toggleParameter,
    togglePrediction: () => setShowForecastPrediction((current) => !current),
  };
}
