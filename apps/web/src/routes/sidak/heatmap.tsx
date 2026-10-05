import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../../lib/api";
import { SERVICE_LABELS } from "../../lib/scoring";
import { fetchSidakHeatmap } from "../../lib/sidak-heatmap-client";
import SidakHeatmapCalendar, {
  type HeatmapDay,
} from "../../components/sidak/SidakHeatmapCalendar";
import SidakHeatmapInsights from "../../components/sidak/SidakHeatmapInsights";
import {
  VALID_SERVICE_TYPES,
  type SidakHeatmapCountBy,
  type SidakHeatmapMode,
  type SidakHeatmapResponse,
  type ServiceType,
} from "@trainers/types";

const YEARS = [2024, 2025, 2026];

function formatTanggalPanjang(iso: string) {
  const [y, m, d] = iso.split("-");
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ][Number(m) - 1];
  return `${Number(d)} ${bulan} ${y}`;
}

export default function SidakHeatmap() {
  const [mode, setMode] = useState<SidakHeatmapMode>("agent");
  const [countBy, setCountBy] = useState<SidakHeatmapCountBy>("parameter");
  const [year, setYear] = useState<number>(2026);
  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [selected, setSelected] = useState<HeatmapDay | null>(null);

  const [heatmap, setHeatmap] = useState<SidakHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Generation guard: respons request LAMA tidak boleh mengganti filter yang
   * sedang aktif (mode/tahun/layanan). Setiap `load` baru menaikkan generasi,
   * dan cleanup membatalkan yang tertinggal.
   */
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    try {
      // `fetchSidakHeatmap` membuka envelope `{ success, data }` dan melempar
      // `ApiError` untuk `{ success: false }`, jadi halaman tidak pernah
      // menampilkan heatmap kosong saat query gagal.
      const data = await fetchSidakHeatmap({
        mode,
        year,
        countBy,
        serviceType: serviceType || undefined,
      });
      if (generation === generationRef.current) setHeatmap(data);
    } catch (e) {
      if (generation === generationRef.current) {
        setError(getErrorMessage(e, "Gagal memuat heatmap."));
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [mode, year, serviceType, countBy]);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  /**
   * Guard tambahan memastikan state "hari terpilih" juga dibuang saat filter
   * berubah — kalau tidak, ringkasan bisa menampilkan tanggal dari tahun yang
   * sudah tidak aktif.
   */
  useEffect(() => {
    setSelected(null);
  }, [mode, year, serviceType, countBy]);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  const copyBasis =
    mode === "agent"
      ? "tanggal layanan (kapan interaksi bermasalah terjadi)"
      : "tanggal sampel (kapan QA memeriksa sampel)";

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Heatmap Ketidaksesuaian
        </h1>
        <p className="max-w-[75ch] text-sm text-muted-foreground">
          Jumlah temuan ketidaksesuaian per hari, dihitung dari{" "}
          <span className="text-foreground">{copyBasis}</span>. Ini adalah volume
          temuan, bukan tingkat kesalahan dan bukan produktivitas QA — tidak
          ada angka pembanding jumlah layanan atau audit.
        </p>
      </header>

      <section
        className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-4"
        aria-label="Filter heatmap"
      >
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Dasar tanggal
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["agent", "Agent — Tanggal layanan"],
                ["qa", "QA — Tanggal sampel"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${
                  mode === value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Satuan
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="heatmap-year"
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Tahun
            </label>
            <select
              id="heatmap-year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="heatmap-service"
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Layanan
            </label>
            <select
              id="heatmap-service"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType | "")}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
            >
              <option value="">Semua layanan</option>
              {VALID_SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4"
        >
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            Gagal memuat heatmap
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            Coba lagi
          </button>
        </div>
      )}

      {loading && (
        <div
          className="mt-6 space-y-2"
          aria-busy="true"
          aria-live="polite"
          data-testid="heatmap-loading"
        >
          <p className="text-sm text-muted-foreground">Memuat heatmap…</p>
          <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
        </div>
      )}

      {!loading && !error && heatmap && (
        <section className="mt-6 space-y-4" aria-label="Ringkasan heatmap">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted-foreground">
                Total temuan {heatmap.year}
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-foreground">
                {heatmap.totalFindings}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Temuan tanpa tanggal</p>
              <p className="text-2xl font-extrabold tabular-nums text-foreground">
                {heatmap.missingDateFindingsAllPeriods}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dari semua tahun,{" "}
                {heatmap.serviceType
                  ? `layanan ${SERVICE_LABELS[heatmap.serviceType as ServiceType] ?? heatmap.serviceType}`
                  : "semua layanan"}
                ; tidak tampil di kalender karena tanggalnya kosong.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Tanggal dipilih</p>
              {selected ? (
                <p
                  className="text-sm font-semibold text-foreground"
                  data-testid="heatmap-selected-day"
                >
                  {formatTanggalPanjang(selected.date)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pilih tanggal di kalender untuk melihat jumlah temuannya.
                </p>
              )}
              {selected && (
                <p className="mt-1 text-sm tabular-nums text-foreground">
                  {selected.count} temuan
                </p>
              )}
            </div>
          </div>

          <SidakHeatmapInsights days={heatmap.days} />

          <SidakHeatmapCalendar
            year={heatmap.year}
            days={heatmap.days}
            selectedDate={selected?.date ?? null}
            onSelectDay={setSelected}
          />
        </section>
      )}
    </main>
  );
}