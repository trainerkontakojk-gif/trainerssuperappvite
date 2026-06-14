import { createHash } from "node:crypto";
import type {
  DashboardData,
  ServiceType,
  SidakBatchForecastSnapshot,
  SidakForecastHistoricalPoint,
  SidakForecastSeries,
  SidakForecastLookupResult,
} from "@trainers/types";
import { generateGeminiContent } from "../../lib/gemini";
import { roundTo } from "../../lib/math-utils";
import { getDashboardData } from "./dashboard-data";
import {
  findForecastSnapshot,
  saveForecastSnapshot,
  hasForecastSnapshotForFilter,
} from "./dashboard-forecast-store";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export interface SidakTrendForecastRequest {
  filters: {
    year?: number;
    periodIds?: string[];
    serviceType?: string;
    folderIds?: string[];
    batchNames?: string[];
    startMonth?: number;
    endMonth?: number;
    agentIds?: string[];
    allowedServiceTypes?: ServiceType[];
  };
  horizonMonths?: number;
  forceRefresh?: boolean;
  cacheOnly?: boolean;
  userId: string;
}

export async function generateSidakTrendForecast(
  req: SidakTrendForecastRequest,
): Promise<SidakForecastLookupResult> {
  const horizonMonths = req.horizonMonths ?? 3;
  const dashboardData = await getDashboardData({
    period_ids: req.filters.periodIds,
    service_type: req.filters.serviceType,
    folder_ids: req.filters.folderIds,
    year: req.filters.year,
    startMonth: req.filters.startMonth,
    endMonth: req.filters.endMonth,
    agent_ids: req.filters.agentIds,
    allowedServiceTypes: req.filters.allowedServiceTypes,
  });

  const totalHistorical = extractTotalHistorical(dashboardData);
  if (totalHistorical.length < 2) {
    throw new Error(
      "Data historis tidak cukup untuk melakukan prediksi (minimal 2 titik).",
    );
  }

  const parameterHistorical = extractParameterHistorical(dashboardData);
  const filterKey = hashValue(canonicalizeFilters(req.filters));
  const dataFingerprint = hashValue({
    total: totalHistorical,
    parameters: parameterHistorical,
  });

  if (!req.forceRefresh) {
    const cached = await findForecastSnapshot({
      filterKey,
      dataFingerprint,
      horizonMonths,
    });
    if (cached) {
      return {
        status: "fresh",
        snapshot: {
          ...cached,
          cache: { ...cached.cache, status: "hit" },
        },
      };
    }
    if (req.cacheOnly) {
      const hasPriorSnapshot = await hasForecastSnapshotForFilter({
        filterKey,
        horizonMonths,
      });
      return {
        status: hasPriorSnapshot ? "stale" : "missing",
        snapshot: null,
      };
    }
  }

  const total = buildForecastSeries(
    { type: "total", label: "Total Temuan" },
    totalHistorical,
    horizonMonths,
  );
  const parameters = Object.fromEntries(
    Object.entries(parameterHistorical).map(([label, historical]) => [
      label,
      buildForecastSeries(
        { type: "parameter", parameterId: label, label },
        historical,
        horizonMonths,
      ),
    ]),
  );

  const insight = await generateBatchInsight(
    total,
    parameters,
    req.userId,
  );
  const generatedAt = new Date().toISOString();
  const payload: SidakBatchForecastSnapshot = {
    series: { total, parameters },
    insight,
    cache: {
      status: req.forceRefresh ? "refreshed" : "generated",
      filterKey,
      dataFingerprint,
    },
    generatedAt,
  };

  await saveForecastSnapshot({
    filterKey,
    dataFingerprint,
    horizonMonths,
    generatedBy: req.userId,
    payload,
  });

  return {
    status: "fresh",
    snapshot: payload,
  };
}

function extractTotalHistorical(
  data: DashboardData,
): SidakForecastHistoricalPoint[] {
  return data.periodMetrics.map((metric) => {
    const period = data.periods.find((item) => item.id === metric.periodId);
    return {
      periodId: metric.periodId,
      label: metric.label,
      date: period?.created_at ?? "",
      value: metric.total,
    };
  });
}

function extractParameterHistorical(
  data: DashboardData,
): Record<string, SidakForecastHistoricalPoint[]> {
  const periodsByLabel = new Map(
    data.periods.map((period) => [
      `${MONTHS_SHORT[period.month - 1]} ${String(period.year).slice(-2)}`,
      period,
    ]),
  );

  return Object.fromEntries(
    data.paramTrend.datasets
      .filter((dataset) => !dataset.isTotal)
      .map((dataset) => [
        dataset.label,
        data.paramTrend.labels.map((label, index) => {
          const period = periodsByLabel.get(label);
          return {
            periodId: period?.id ?? `label:${label}`,
            label,
            date: period?.created_at ?? "",
            value: dataset.data[index] ?? 0,
          };
        }),
      ]),
  );
}

function buildForecastSeries(
  scope: SidakForecastSeries["scope"],
  historical: SidakForecastHistoricalPoint[],
  horizonMonths: number,
): SidakForecastSeries {
  const { forecast, summary } = calculateLinearForecast(
    historical,
    horizonMonths,
  );
  return {
    scope,
    historical,
    forecast,
    summary,
    status: "ready",
  };
}

function calculateLinearForecast(
  historical: Array<{ value: number; label: string }>,
  horizon: number,
) {
  const n = historical.length;
  const x = Array.from({ length: n }, (_, index) => index);
  const y = historical.map((point) => point.value);
  const sumX = x.reduce((sum, value) => sum + value, 0);
  const sumY = y.reduce((sum, value) => sum + value, 0);
  const sumXY = x.reduce(
    (sum, value, index) => sum + value * y[index],
    0,
  );
  const sumXX = x.reduce((sum, value) => sum + value * value, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope =
    denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const lastLabel = historical[n - 1].label;
  const [lastMonthLabel, lastYearLabel] = lastLabel.split(" ");
  let month = MONTHS_SHORT.indexOf(lastMonthLabel) + 1;
  let year = 2000 + Number.parseInt(lastYearLabel, 10);
  const forecast = [];

  for (let step = 1; step <= horizon; step++) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    forecast.push({
      label: `${MONTHS_SHORT[month - 1]} ${String(year).slice(-2)}`,
      date: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
      value: roundTo(Math.max(0, slope * (n + step - 1) + intercept), 1),
    });
  }

  const projectedChange =
    forecast[horizon - 1].value - historical[n - 1].value;
  const projectedChangePercent =
    historical[n - 1].value === 0
      ? null
      : roundTo((projectedChange / historical[n - 1].value) * 100, 1);
  const errors = y.map((value, index) =>
    Math.abs(value - (slope * index + intercept)),
  );
  const averageError =
    errors.reduce((sum, value) => sum + value, 0) / n;
  const averageValue = sumY / n;
  let confidence: "low" | "medium" | "high" =
    n < 4 ? "low" : n >= 8 ? "high" : "medium";
  if (averageValue > 0 && averageError / averageValue > 0.4) {
    confidence = confidence === "high" ? "medium" : "low";
  }

  return {
    forecast,
    summary: {
      direction:
        Math.abs(projectedChange) < 0.1
          ? ("stable" as const)
          : projectedChange > 0
            ? ("up" as const)
            : ("down" as const),
      projectedChange: roundTo(projectedChange, 1),
      projectedChangePercent,
      confidence,
      method: "linear-regression" as const,
      sourcePointCount: n,
    },
  };
}

function canonicalizeFilters(
  filters: SidakTrendForecastRequest["filters"],
) {
  return {
    year: filters.year ?? null,
    periodIds: [...(filters.periodIds ?? [])].sort(),
    serviceType: filters.serviceType ?? null,
    folderIds: [...(filters.folderIds ?? [])].sort(),
    batchNames: [...(filters.batchNames ?? [])].sort(),
    startMonth: filters.startMonth ?? null,
    endMonth: filters.endMonth ?? null,
    agentIds: [...(filters.agentIds ?? [])].sort(),
    allowedServiceTypes: [...(filters.allowedServiceTypes ?? [])].sort(),
  };
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function generateBatchInsight(
  total: SidakForecastSeries,
  parameters: Record<string, SidakForecastSeries>,
  userId: string,
): Promise<SidakBatchForecastSnapshot["insight"]> {
  const parameterSummary = Object.values(parameters)
    .map(
      (series) =>
        `- ${series.scope.label}: ${series.summary.direction}, perubahan ${series.summary.projectedChange}`,
    )
    .join("\n");
  const response = await generateGeminiContent({
    model: "gemini-3.1-flash-lite",
    userId,
    usageContext: {
      module: "qa-analyzer",
      action: "generate-trend-forecast",
    },
    systemInstruction: `Anda adalah analis Quality Assurance. Jelaskan snapshot forecast SIDAK secara ringkas dalam Bahasa Indonesia.
Angka sudah dihitung secara statistik dan tidak boleh diubah. Soroti tren total, parameter paling berisiko, tindakan yang dapat dilakukan, dan disclaimer estimasi. Jangan mengarang penyebab yang tidak ada pada data.`,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Total Temuan: arah ${total.summary.direction}, perubahan ${total.summary.projectedChange} (${total.summary.projectedChangePercent ?? "N/A"}%).
Parameter:
${parameterSummary || "- Tidak ada parameter."}`,
          },
        ],
      },
    ],
    temperature: 0.3,
  });

  return response.success && response.text
    ? { text: response.text, status: "generated" }
    : { text: null, status: "unavailable" };
}
