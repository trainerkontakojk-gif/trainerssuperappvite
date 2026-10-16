import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "../../lib/api";
import { fetchSidakHeatmap } from "../../lib/sidak-heatmap-client";
import SidakHeatmapCalendar, {
  type HeatmapDay,
} from "./SidakHeatmapCalendar";
import SidakHeatmapInsights from "./SidakHeatmapInsights";
import { SidakWeekdayPattern } from "./SidakWeekdayBars";
import {
  buildHeatmapInsights,
  formatInsightDateShort,
  formatInsightDateWithWeekday,
} from "./heatmap-insights";
import {
  VALID_SERVICE_TYPES,
  type SidakHeatmapCountBy,
  type SidakHeatmapResponse,
  type SidakHeatmapTicketRef,
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
  onOpenTicket,
}: {
  agentId: string;
  year: number;
  /** Nilai kontrol konteks: `""` (default), `"all"`, atau ServiceType. */
  serviceType: string;
  /** Buka tiket tanggal terpilih di tab Temuan. */
  onOpenTicket?: (ticket: SidakHeatmapTicketRef) => void;
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
        setError(getErrorMessage(e, "Heatmap belum dapat dimuat. Coba lagi beberapa saat."));
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

  const selectedTickets = useMemo(
    () =>
      (selected &&
        data?.days.find((day) => day.date === selected.date)?.tickets) ||
      [],
    [data, selected],
  );
  const insights = useMemo(
    () => buildHeatmapInsights(data?.days ?? []),
    [data?.days],
  );

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
            Jumlah temuan agen ini per tanggal layanan, untuk tahun dan
            layanan yang dipilih. Angka menunjukkan banyaknya temuan, bukan
            tingkat kesalahan.
          </p>
        </div>
        <fieldset className="shrink-0">
          <legend className="text-xs font-medium text-muted-foreground">
            Hitung per
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
          className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4"
        >
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
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
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,1fr)] lg:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <div data-testid="agent-heatmap-calendar" className="min-w-0">
                <SidakHeatmapCalendar
                  year={data.year}
                  days={data.days}
                  selectedDate={selected?.date ?? null}
                  onSelectDay={setSelected}
                />
              </div>
              <SidakWeekdayPattern days={data.days} year={data.year} />
            </div>

            <aside
              aria-label="Ringkasan heatmap agen"
              className="flex min-w-0 flex-col gap-3"
            >
              <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted-foreground">Tanggal dipilih</p>
                {selected ? (
                  <>
                    <p
                      className="font-display text-base font-bold text-foreground"
                      data-testid="agent-heatmap-selected-day"
                    >
                      {formatInsightDateWithWeekday(selected.date)}
                    </p>
                    <p className="text-sm tabular-nums text-fg2">
                      {selected.count} temuan
                      {selectedTickets.length > 0 ? (
                        <>
                          {" · tiket "}
                          <span className="font-mono">
                            {selectedTickets.map((t) => t.noTiket).join(", ")}
                          </span>
                        </>
                      ) : null}
                    </p>
                    {onOpenTicket
                      ? selectedTickets.map((ticket) => (
                          <button
                            key={`${ticket.noTiket}-${ticket.year}-${ticket.month}`}
                            type="button"
                            onClick={() => onOpenTicket(ticket)}
                            className="inline-flex min-h-[44px] items-center self-start text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            Buka {ticket.noTiket} di tab Temuan
                          </button>
                        ))
                      : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pilih tanggal di kalender untuk melihat jumlah temuannya.
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-border [&>div]:bg-surface gap-px">
                <div className="flex flex-col gap-0.5 p-3">
                  <dt className="text-xs text-muted-foreground">
                    Total temuan {data.year}
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums text-foreground">
                    {data.totalFindings}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 p-3">
                  <dt className="text-xs text-muted-foreground">
                    Hari dengan temuan
                  </dt>
                  <dd
                    data-testid="agent-heatmap-fact-days"
                    className="font-mono text-lg font-bold tabular-nums text-foreground"
                  >
                    {insights.activeDays}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 p-3">
                  <dt className="text-xs text-muted-foreground">
                    Tanggal terbanyak
                  </dt>
                  <dd
                    data-testid="agent-heatmap-fact-peak"
                    className="font-mono text-lg font-bold tabular-nums text-foreground"
                  >
                    {insights.busiestDay
                      ? formatInsightDateShort(insights.busiestDay.date)
                      : "—"}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 p-3">
                  <dt className="text-xs text-muted-foreground">
                    Temuan tanpa tanggal
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums text-foreground">
                    {data.missingDateFindingsAllPeriods}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Temuan tanpa tanggal dihitung dari semua tahun dan tidak tampil
                di kalender.
              </p>
            </aside>
          </div>

          <SidakHeatmapInsights days={data.days} />
        </div>
      )}
    </div>
  );
}
