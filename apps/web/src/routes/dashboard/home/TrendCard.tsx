import type { SidakForecastLookupResult } from "@trainers/types";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
import { TrendChart, type ChartPoint } from "./TrendChart";
import {
  serviceLabel,
  type TrendMap,
  type TrendRange,
} from "./useDashboardTrend";

const RANGES: { value: TrendRange; label: string }[] = [
  { value: "3m", label: "3 bln" },
  { value: "6m", label: "6 bln" },
  { value: "all", label: "12 bln" },
];
const NUMBER = new Intl.NumberFormat("id-ID");

/**
 * Proyeksi bulan berikutnya dari prediksi yang sudah tersimpan. Beranda hanya
 * membaca cache (`cacheOnly`); membuat/memperbarui prediksi ada di
 * `/sidak/forecast`. Filter sama dengan default halaman SIDAK supaya cache-nya
 * terpakai bersama.
 */
function useCachedProjection(service: string, enabled: boolean) {
  const [result, setResult] = useState<{
    key: string;
    point: ChartPoint | null;
  } | null>(null);
  const key = `${service}:${enabled}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = (await unwrapResponse(
          await sidakClient.dashboard.forecast.$post({
            json: {
              filters: {
                year: new Date().getFullYear(),
                serviceType: service === "all" ? undefined : service,
              },
              horizonMonths: 3,
              forceRefresh: false,
              cacheOnly: true,
            },
          }),
        )) as SidakForecastLookupResult;
        const next = data.snapshot?.series.total.forecast[0];
        if (!cancelled)
          setResult({
            key,
            point: next
              ? { label: next.label, value: Math.round(next.value) }
              : null,
          });
      } catch {
        // Proyeksi hanya pelengkap; grafik aktual tetap tampil tanpanya.
        if (!cancelled) setResult({ key, point: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, service, enabled]);

  return enabled && result?.key === key ? result.point : null;
}

function Delta({ last, prev }: { last: number; prev: number }) {
  const pct = Math.round(((last - prev) / prev) * 100);
  if (pct === 0) return <>Tetap</>;
  // Temuan turun = membaik.
  return (
    <span className={pct < 0 ? "home-good" : "home-bad"}>
      {pct > 0 ? "+" : "−"}
      {Math.abs(pct)}% {pct < 0 ? "turun" : "naik"}
    </span>
  );
}

/** Kartu "Tren temuan QA": rentang, filter layanan, ringkasan, dan grafik. */
export function TrendCard({ trendMap }: { trendMap: TrendMap }) {
  const [range, setRange] = useState<TrendRange>("6m");
  const [service, setService] = useState("all");
  const trend = trendMap[range];
  const services = trendMap.all.activeServices;

  const values =
    service === "all"
      ? trend.totalData
      : (trend.serviceData[service] ?? trend.labels.map(() => 0));
  const points = trend.labels.map((label, i) => ({
    label,
    value: values[i] ?? 0,
  }));
  const projection = useCachedProjection(
    service,
    trendMap.all.labels.length >= 2,
  );
  const total = values.reduce((sum, v) => sum + v, 0);
  const last = points.at(-1);
  const prev = points.at(-2);
  const summary =
    service === "all"
      ? trend.totalSummary.auditedAgents
      : trend.serviceSummary[service]?.auditedAgents;

  return (
    <section
      aria-labelledby="home-trend-title"
      className="home-panel home-trend"
    >
      <div className="home-trend-head">
        <div>
          <h2 id="home-trend-title" className="home-section-title">
            Tren temuan QA
          </h2>
          <p className="home-section-sub">
            Jumlah temuan per bulan
            {projection ? " · garis putus-putus = proyeksi" : ""}
          </p>
        </div>
        <div className="home-trend-controls">
          <div className="home-seg" role="group" aria-label="Rentang">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="home-trend-service">
            Layanan
          </label>
          <span className="home-select">
            <select
              id="home-trend-service"
              value={service}
              onChange={(event) => setService(event.target.value)}
            >
              <option value="all">Semua layanan</option>
              {services.map((key) => (
                <option key={key} value={key}>
                  Layanan {serviceLabel(key)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </span>
        </div>
      </div>

      <dl className="home-stats">
        <div>
          <dt>Temuan {points.length} bulan</dt>
          <dd>{NUMBER.format(total)}</dd>
        </div>
        {last && prev && prev.value > 0 && (
          <div>
            <dt>
              {last.label} vs {prev.label}
            </dt>
            <dd>
              <Delta last={last.value} prev={prev.value} />
            </dd>
          </div>
        )}
        <div>
          <dt>Agen diaudit</dt>
          <dd>{typeof summary === "number" ? NUMBER.format(summary) : "—"}</dd>
        </div>
        <div>
          <dt>Layanan aktif</dt>
          <dd>{NUMBER.format(trend.totalSummary.activeServiceCount)}</dd>
        </div>
      </dl>

      {points.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-fg2">
          Belum ada periode QA dengan temuan.
        </p>
      ) : (
        <>
          <TrendChart points={points} projection={projection} />
          <div className="home-legend" aria-hidden="true">
            <span>
              <i />
              Aktual
            </span>
            {projection && (
              <span>
                <i className="dash" />
                Proyeksi
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
