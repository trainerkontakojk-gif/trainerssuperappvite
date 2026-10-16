import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../../lib/api";
import { SERVICE_LABELS } from "../../lib/scoring";
import { fetchSidakHeatmap } from "../../lib/sidak-heatmap-client";
import SidakHeatmapCalendar, {
  type HeatmapDay,
} from "../../components/sidak/SidakHeatmapCalendar";
import SidakHeatmapInsights from "../../components/sidak/SidakHeatmapInsights";
import QaStatePanel from "../../components/sidak/QaStatePanel";
import { FilterSelect } from "../../components/sidak/FilterSelect";
import {
  SidakPageHeader,
  SidakScopeLine,
} from "../../components/sidak/SidakPageHeader";
import { useSidakScope } from "../../hooks/useSidakScope";
import { Button } from "@/components/ui/button";
import {
  VALID_SERVICE_TYPES,
  type SidakHeatmapCountBy,
  type SidakHeatmapMode,
  type SidakHeatmapResponse,
  type ServiceType,
} from "@trainers/types";

/** Tahun pilihan: tiga tahun terakhir sampai tahun berjalan. */
function yearItems(selected: number) {
  const current = new Date().getFullYear();
  const years = new Set([current - 2, current - 1, current, selected]);
  return [...years]
    .sort((a, b) => a - b)
    .map((y) => ({ value: String(y), label: String(y) }));
}

/** Base UI Select memegang nilai string; "" (semua layanan) dipetakan ke sentinel. */
const ALL_SERVICES = "__all__";
const SERVICE_ITEMS = [
  { value: ALL_SERVICES, label: "Semua layanan" },
  ...VALID_SERVICE_TYPES.map((s) => ({
    value: s,
    label: SERVICE_LABELS[s] ?? s,
  })),
];

function formatTanggalPanjang(iso: string) {
  const [y, m, d] = iso.split("-");
  const bulan = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ][Number(m) - 1];
  return `${Number(d)} ${bulan} ${y}`;
}

export default function SidakHeatmap() {
  const [mode, setMode] = useState<SidakHeatmapMode>("agent");
  const [countBy, setCountBy] = useState<SidakHeatmapCountBy>("parameter");
  // Tahun dan layanan mengikuti cakupan bersama SIDAK. Layanan hanya diambil
  // bila cakupan memilihnya; tanpa itu Heatmap tetap "Semua layanan".
  const { scope, explicit, setScope } = useSidakScope();
  const year = scope.tahun;
  const [serviceType, setServiceTypeState] = useState<ServiceType | "">(
    explicit.layanan ?? "",
  );
  useEffect(() => {
    if (explicit.layanan) setServiceTypeState(explicit.layanan);
  }, [explicit.layanan]);
  const setYear = (next: number) => setScope({ tahun: next });
  const setServiceType = (next: ServiceType | "") => {
    setServiceTypeState(next);
    if (next) setScope({ layanan: next });
  };
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
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6">
      <SidakPageHeader
        title="Heatmap"
        description={
          <>
            Jumlah temuan ketidaksesuaian per hari, dihitung dari{" "}
            <span className="text-foreground">{copyBasis}</span>. Ini adalah
            volume temuan, bukan tingkat kesalahan dan bukan produktivitas QA —
            tidak ada angka pembanding jumlah layanan atau audit.
          </>
        }
        scope={
          <SidakScopeLine
            layanan={serviceType || null}
            tahun={year}
            note="Heatmap memakai tahun dan layanan saja; rentang bulan dan tim tidak dipakai."
          />
        }
      />

      <section
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        aria-label="Filter heatmap"
      >
        <SegmentField
          legend="Tanggal yang dibaca"
          value={mode}
          onChange={setMode}
          options={[
            ["agent", "Agent — Tanggal layanan"],
            ["qa", "QA — Tanggal sampel"],
          ]}
        />
        <FilterSelect
          id="heatmap-service"
          label="Layanan"
          className="flex min-w-0 flex-col gap-1.5 sm:w-40"
          value={serviceType === "" ? ALL_SERVICES : serviceType}
          onValueChange={(v) =>
            setServiceType(v === ALL_SERVICES ? "" : (v as ServiceType))
          }
          items={SERVICE_ITEMS}
        />
        <FilterSelect
          id="heatmap-year"
          label="Tahun"
          className="flex min-w-0 flex-col gap-1.5 sm:w-28"
          value={String(year)}
          onValueChange={(y) => setYear(Number(y))}
          items={yearItems(year)}
        />
        <SegmentField
          legend="Hitung per"
          value={countBy}
          onChange={setCountBy}
          options={[
            ["parameter", "Parameter"],
            ["tiket", "Tiket"],
          ]}
        />
      </section>

      {error && (
        <QaStatePanel
          type="error"
          title="Gagal memuat heatmap"
          description={error}
          className="mt-6"
          action={
            <Button
              type="button"
              variant="outline"
              onClick={retry}
              className="h-[44px] px-4"
            >
              Coba lagi
            </Button>
          }
        />
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
          <SidakHeatmapCalendar
            year={heatmap.year}
            days={heatmap.days}
            selectedDate={selected?.date ?? null}
            onSelectDay={setSelected}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[12px] text-muted-foreground">
                Total temuan {heatmap.year}
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
                {heatmap.totalFindings}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[12px] text-muted-foreground">
                Temuan tanpa tanggal
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
                {heatmap.missingDateFindingsAllPeriods}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Dari semua tahun,{" "}
                {heatmap.serviceType
                  ? `layanan ${SERVICE_LABELS[heatmap.serviceType as ServiceType] ?? heatmap.serviceType}`
                  : "semua layanan"}
                ; tidak tampil di kalender karena tanggalnya kosong.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[12px] text-muted-foreground">
                Tanggal dipilih
              </p>
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
        </section>
      )}
    </div>
  );
}
/** Kontrol segmen berlabel (tombol `aria-pressed`) setinggi select 44px. */
function SegmentField<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[12px] font-medium text-fg2">
        {legend}
      </legend>
      <div className="inline-flex self-start rounded-lg border border-border p-0.5">
        {options.map(([option, label]) => (
          <Button
            key={option}
            type="button"
            variant={value === option ? "default" : "ghost"}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "h-[44px] px-3 whitespace-nowrap",
              value !== option && "text-fg2",
            )}
          >
            {label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
