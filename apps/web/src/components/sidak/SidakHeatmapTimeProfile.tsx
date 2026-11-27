import { useEffect, useReducer, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  SIDAK_DURASI_BUCKETS,
  SIDAK_DURASI_REVIEW_BELOW_SECONDS,
  SIDAK_JAM_BUCKETS,
  SIDAK_TIME_SOURCE,
  type SidakHeatmapTimeProfileResponse,
} from "@trainers/types";
import {
  fetchSidakHeatmapTimeProfile,
  type HeatmapFilters,
} from "../../lib/sidak-heatmap-client";
import { SERVICE_LABELS } from "../../lib/scoring";
import {
  buildIntensityBuckets,
  heatmapIntensityClasses,
} from "./SidakHeatmapCalendar";
import { WEEKDAY_FULL } from "./heatmap-insights";

const jamKeys = ["pagi", "siang", "sore", "luar"] as const;
const durationKeys = [
  "singkat",
  "sedang",
  "panjang",
  "sangat_panjang",
] as const;
const hours = [
  "<07",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "≥17",
] as const;
const number = new Intl.NumberFormat("id-ID");
const percent = new Intl.NumberFormat("id-ID", {
  style: "percent",
  maximumFractionDigits: 1,
});
const volumeNote =
  "Angka menunjukkan kapan temuan menumpuk, bukan tingkat kesalahan per jam. Tidak ada data jumlah layanan per jam sebagai pembanding.";

type Profile = SidakHeatmapTimeProfileResponse;
type State =
  | { status: "loading" }
  | { status: "ready"; data: Profile }
  | { status: "failed" };
type Action =
  { type: "retry" } | { type: "loaded"; data: Profile } | { type: "failed" };
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "retry":
      return state.status === "failed" ? { status: "loading" } : state;
    case "loaded":
      return { status: "ready", data: action.data };
    case "failed":
      return { status: "failed" };
  }
}

// A context change starts a fresh request; a response for earlier filters can
// never render as the new service (including a rapidly changed count unit).
export function SidakHeatmapTimeProfile(filters: HeatmapFilters) {
  const key = JSON.stringify([
    filters.year,
    filters.countBy,
    filters.serviceType,
    filters.agentId,
    filters.folderIds,
    filters.startMonth,
    filters.endMonth,
  ]);
  return <TimeProfileRequest key={key} {...filters} />;
}

function TimeProfileRequest({
  year,
  countBy,
  serviceType,
  agentId,
  folderIds,
  startMonth,
  endMonth,
}: HeatmapFilters) {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const folderKeys = folderIds?.join(",");
  useEffect(() => {
    if (state.status !== "loading") return;
    const controller = new AbortController();
    fetchSidakHeatmapTimeProfile({
      year,
      countBy,
      serviceType,
      agentId,
      startMonth,
      endMonth,
      folderIds: folderKeys?.split(","),
      signal: controller.signal,
    }).then(
      (data) => {
        if (!controller.signal.aborted) dispatch({ type: "loaded", data });
      },
      () => {
        if (!controller.signal.aborted) dispatch({ type: "failed" });
      },
    );
    return () => controller.abort();
  }, [
    year,
    countBy,
    serviceType,
    agentId,
    folderKeys,
    startMonth,
    endMonth,
    state.status,
  ]);

  return (
    <section
      aria-label="Profil waktu temuan"
      className="min-w-0 space-y-6 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      {state.status === "loading" && (
        <p role="status" className="text-sm text-muted-foreground">
          Memuat profil waktu temuan…
        </p>
      )}
      {state.status === "failed" && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-foreground">
            Gagal memuat jam dan durasi temuan.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => dispatch({ type: "retry" })}
          >
            Coba lagi
          </Button>
        </div>
      )}
      {state.status === "ready" && <TimeProfileContent data={state.data} />}
    </section>
  );
}

function TimeProfileContent({ data }: { data: Profile }) {
  const service = data.serviceType;
  const source = service ? SIDAK_TIME_SOURCE[service] : null;
  if (source?.kind === "none") {
    return (
      <div className="space-y-1">
        <h3 className="font-display text-lg font-bold">
          Analisa jam tidak dipakai untuk layanan ini
        </h3>
        <p className="text-sm text-muted-foreground">{source.reason}.</p>
      </div>
    );
  }
  const call = SIDAK_TIME_SOURCE.call;
  const durations = data.durations;
  const hours = data.hours;
  return (
    <>
      {hours && source?.kind === "jam" && (
        <div className="min-w-0 space-y-4">
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold">{hours.label}</h3>
            <p className="text-sm text-muted-foreground">
              Jam WIB {source.meaning}.
              {service === "pencatatan" &&
                " Jam tiket dibuat mendekati waktu pencatatan, bukan saat layanan diterima."}
            </p>
            <p className="max-w-prose text-sm text-muted-foreground">
              {volumeNote}
            </p>
          </div>
          <HourMatrix cells={hours.cells} />
          <BucketSummary
            entries={jamKeys.map((key) => ({
              ...SIDAK_JAM_BUCKETS[key],
              count: hours.buckets[key],
            }))}
            total={hours.total}
          />
          <p className="text-sm text-muted-foreground">
            {hours.total === 0 &&
              "Belum ada temuan dengan jam pada pilihan ini. "}
            Belum diisi:{" "}
            <strong className="text-foreground">
              {number.format(hours.missingTime)}
            </strong>
          </p>
        </div>
      )}
      {data.hoursByService && (
        <div className="min-w-0 space-y-3">
          <h3 className="font-display text-lg font-bold">
            Jam temuan per layanan
          </h3>
          <p className="text-sm text-muted-foreground">
            Pilih satu layanan untuk melihat pola per hari dan jam
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">
            {volumeNote} Arti jam berbeda antar layanan, sehingga hitungannya
            tidak digabung.
          </p>
          <ScrollableTable label="Kategori jam per layanan">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">
                  Layanan
                </th>
                {jamKeys.map((key) => (
                  <th key={key} scope="col" className="px-3 py-2 text-right">
                    {SIDAK_JAM_BUCKETS[key].label}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right">
                  Belum diisi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.hoursByService.map((row) => (
                <tr key={row.serviceType}>
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {SERVICE_LABELS[row.serviceType]}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {row.label}
                    </span>
                  </th>
                  {jamKeys.map((key) => (
                    <td className="px-3 py-2 text-right tabular-nums" key={key}>
                      {number.format(row.buckets[key])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {number.format(row.missingTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollableTable>
          <p className="text-sm text-muted-foreground">
            Email, CSO, dan BKO tidak memakai analisa jam.
          </p>
        </div>
      )}
      {durations && call.kind === "durasi" && (
        <div
          className={`space-y-3 ${data.hoursByService ? "border-t border-border pt-4" : ""}`}
        >
          <h3 className="font-display text-lg font-bold">{call.label}</h3>
          <p className="text-sm text-muted-foreground">
            Distribusi ini hanya mencakup panggilan yang punya temuan, bukan
            seluruh panggilan.
          </p>
          <BucketSummary
            entries={durationKeys.map((key) => ({
              ...SIDAK_DURASI_BUCKETS[key],
              count: durations.buckets[key],
            }))}
            total={durations.total}
          />
          <p className="text-sm text-muted-foreground">
            &lt; {SIDAK_DURASI_REVIEW_BELOW_SECONDS / 60} menit perlu dicek:{" "}
            <strong className="text-foreground">
              {number.format(durations.reviewBelowOneMinute)}
            </strong>{" "}
            (termasuk Singkat).
          </p>
          <p className="text-sm text-muted-foreground">
            {durations.total === 0 &&
              "Belum ada temuan dengan durasi pada pilihan ini. "}
            Belum diisi:{" "}
            <strong className="text-foreground">
              {number.format(durations.missingDuration)}
            </strong>
          </p>
        </div>
      )}
    </>
  );
}

function BucketSummary({
  entries,
  total,
}: {
  entries: { label: string; range: string; count: number }[];
  total: number;
}) {
  return (
    <dl
      className={`grid grid-cols-2 gap-4 border-y border-border py-3 ${entries.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}
    >
      {entries.map(({ label, range, count }) => (
        <div key={label}>
          <dt className="text-sm font-semibold">{label}</dt>
          <dd className="mt-1 text-base font-bold tabular-nums">
            {number.format(count)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({percent.format(total ? count / total : 0)})
            </span>
          </dd>
          <dd className="text-xs text-muted-foreground">{range}</dd>
        </div>
      ))}
    </dl>
  );
}

function ScrollableTable({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <p className="mb-1 text-xs text-muted-foreground sm:hidden">
        Geser tabel untuk melihat kolom lainnya.
      </p>
      <div
        role="region"
        aria-label={`Area gulir: ${label}`}
        tabIndex={0}
        className="max-w-full overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table aria-label={label} className="w-full min-w-max text-sm">
          {children}
        </table>
      </div>
    </>
  );
}

function HourMatrix({
  cells,
}: {
  cells: NonNullable<Profile["hours"]>["cells"];
}) {
  const matrix = WEEKDAY_FULL.map(() => hours.map(() => 0));
  for (const { weekday, hour, count } of cells) {
    const column = hour < 7 ? 0 : hour >= 17 ? 11 : hour - 6;
    matrix[weekday - 1]![column]! += count;
  }
  const intensity = buildIntensityBuckets(matrix.flat());
  return (
    <ScrollableTable label="Temuan per hari dan jam">
      <thead className="text-muted-foreground">
        <tr>
          <th
            scope="col"
            className="sticky left-0 bg-surface px-2 py-2 text-left"
          >
            Hari / WIB
          </th>
          {hours.map((hour) => (
            <th
              key={hour}
              scope="col"
              className="min-w-9 px-1 py-2 text-center font-medium tabular-nums"
            >
              {hour}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {WEEKDAY_FULL.map((day, index) => (
          <tr key={day}>
            <th
              scope="row"
              className="sticky left-0 bg-surface px-2 py-1 text-left font-medium"
            >
              {day}
            </th>
            {matrix[index]!.map((count, column) => (
              <td key={hours[column]} className="px-0.5 py-0.5 text-center">
                <span
                  className={`block rounded px-1 py-1 font-medium tabular-nums ${heatmapIntensityClasses(count, intensity)}`}
                >
                  {number.format(count)}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </ScrollableTable>
  );
}
