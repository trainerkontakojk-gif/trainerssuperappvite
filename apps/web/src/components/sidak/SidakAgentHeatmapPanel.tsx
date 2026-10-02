import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../../lib/api";
import { fetchSidakHeatmap } from "../../lib/sidak-heatmap-client";
import SidakHeatmapCalendar, {
  type HeatmapDay,
} from "./SidakHeatmapCalendar";
import SidakHeatmapInsights from "./SidakHeatmapInsights";
import {
  VALID_SERVICE_TYPES,
  type SidakHeatmapCountBy,
  type SidakHeatmapResponse,
  type ServiceType,
} from "@trainers/types";

/**
 * Tab Heatmap di detail agent.
 *
 * Memakai endpoint heatmap yang SAMA dengan halaman utama, hanya dengan
 * `agent_id` diisi, sehingga definisi hitungan (countable, non-phantom, satuan
 * parameter/tiket) tidak bercabang. Tahun dan layanan mengikuti kontrol konteks
 * halaman detail agent.
 */
export default function SidakAgentHeatmapPanel({
  agentId,
  year,
  serviceType,
}: {
  agentId: string;
  year: number;
  /** Nilai kontrol konteks: `""` (default), `"all"`, atau ServiceType. */
  serviceType: string;
}) {
  const [countBy, setCountBy] = useState<SidakHeatmapCountBy>("parameter");
  const [data, setData] = useState<SidakHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HeatmapDay | null>(null);
  const generationRef = useRef(0);

  const resolvedService: ServiceType | undefined = VALID_SERVICE_TYPES.includes(
    serviceType as ServiceType,
  )
    ? (serviceType as ServiceType)
    : undefined;

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSidakHeatmap({
        mode: "agent",
        year,
        countBy,
        serviceType: resolvedService,
        agentId,
      });
      if (generation === generationRef.current) setData(res);
    } catch (e) {
      if (generation === generationRef.current) {
        setError(getErrorMessage(e, "Gagal memuat heatmap agent."));
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [agentId, year, countBy, resolvedService]);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    setSelected(null);
  }, [agentId, year, countBy, resolvedService]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-outfit text-xl font-bold tracking-tight text-foreground">
            Heatmap temuan
          </h2>
          <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">
            Sebaran volume temuan agent ini per tanggal layanan pada tahun dan
            layanan yang dipilih. Volume temuan, bukan tingkat kesalahan.
          </p>
        </div>
        <fieldset className="shrink-0">
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Satuan
          </legend>
          <div className="mt-1.5 flex gap-2">
            {(
              [
                ["parameter", "Parameter"],
                ["tiket", "Tiket"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={countBy === value}
                onClick={() => setCountBy(value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${
                  countBy === value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/5 p-4"
        >
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            Gagal memuat heatmap
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            Coba lagi
          </button>
        </div>
      )}

      {loading && !data && (
        <div aria-busy="true" aria-live="polite" data-testid="agent-heatmap-loading">
          <p className="text-sm text-muted-foreground">Memuat heatmap…</p>
          <div className="mt-2 h-40 animate-pulse rounded-xl bg-muted/40" />
        </div>
      )}

      {!error && data && (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted-foreground">
                Total temuan ({data.year})
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-foreground">
                {data.totalFindings}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Tanggal belum diisi</p>
              <p className="text-2xl font-extrabold tabular-nums text-foreground">
                {data.missingDateFindingsAllPeriods}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Seluruh periode, tidak bisa diatribusikan ke tahun tertentu.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Tanggal dipilih</p>
              {selected ? (
                <>
                  <p
                    className="text-sm font-semibold text-foreground"
                    data-testid="agent-heatmap-selected-day"
                  >
                    {selected.date}
                  </p>
                  <p className="mt-1 text-sm tabular-nums text-foreground">
                    {selected.count} temuan
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pilih salah satu tanggal di kalender
                </p>
              )}
            </div>
          </div>

          <SidakHeatmapInsights days={data.days} />

          <SidakHeatmapCalendar
            year={data.year}
            days={data.days}
            selectedDate={selected?.date ?? null}
            onSelectDay={setSelected}
          />
        </div>
      )}
    </div>
  );
}
