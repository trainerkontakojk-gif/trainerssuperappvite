import { useNavigate } from "@tanstack/react-router";
import type {
  EfekChartPoint,
  EfekParticipantStatus,
  EfekProgramSummary,
} from "@trainers/types";
import type { EfekReportSearch } from "../../router";
import { Field } from "./shared";
import { selectClass } from "./utils";
import {
  chartGeometry,
  deltaClass,
  fmt,
  fmtDelta,
  offsetText,
} from "./efek-report-format";

/** Shared EFEK report pieces for `/tna/efek` and `/tna/efek/program/$code`. */

const STATUS_CLASS: Record<EfekParticipantStatus, string> = {
  naik: "bg-success/10 text-success",
  stabil: "bg-muted text-muted-foreground",
  turun: "bg-destructive/10 text-destructive",
  menunggu: "bg-muted text-muted-foreground",
  tanpa_data: "bg-muted text-muted-foreground",
};
export function Chip({
  status,
  children,
}: {
  status?: EfekParticipantStatus;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${status ? STATUS_CLASS[status] : "bg-warning/10 text-warning"}`}
    >
      {children}
    </span>
  );
}

/** Window, year, and team filters; they live in the URL so links keep them. */
export function ReportFilters({
  to,
  params,
  search,
  years,
  teams,
  children,
}: {
  to: "/tna/efek" | "/tna/efek/program/$code";
  params?: { code: string };
  search: EfekReportSearch;
  years: number[];
  teams: string[];
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const set = (patch: Partial<EfekReportSearch>) =>
    navigate({
      to,
      params,
      search: { ...search, ...patch },
      replace: true,
    } as never);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-4">
        <Field label="Jendela banding">
          <select
            className={selectClass}
            value={search.window ?? 3}
            onChange={(e) =>
              set({
                window:
                  Number(e.target.value) === 3
                    ? undefined
                    : Number(e.target.value),
              })
            }
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} bulan
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tahun sesi">
          <select
            className={selectClass}
            value={search.year ?? ""}
            onChange={(e) =>
              set({ year: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">Semua tahun</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tim">
          <select
            className={selectClass}
            value={search.tim ?? ""}
            onChange={(e) => set({ tim: e.target.value || undefined })}
          >
            <option value="">Semua tim</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        {children}
        <label className="flex min-h-[44px] min-w-0 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground max-sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-module-tna focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            checked={search.proper_input === "include"}
            onChange={(e) =>
              set({
                proper_input: e.currentTarget.checked ? "include" : undefined,
              })
            }
          />
          <span>Hitung proper input (APPK)</span>
        </label>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {search.proper_input === "include"
          ? "Skor SIDAK resmi, termasuk proper input (APPK)."
          : "Proper input (APPK) dianggap sesuai, jadi skor fokus pada interaksi dengan konsumen. Nyalakan untuk melihat skor SIDAK resmi."}
      </p>
    </div>
  );
}

/** Naik / stabil / turun counts, evaluated share, comparison, findings. */
export function ProgramStats({ program: p }: { program: EfekProgramSummary }) {
  return (
    <div className="space-y-3">
      {p.evaluated > 0 ? (
        <div>
          <p
            className={`font-heading text-3xl font-bold tabular-nums ${deltaClass(p.median_relative_delta)}`}
          >
            {fmtDelta(p.median_relative_delta)}
          </p>
          <p className="text-sm font-medium text-foreground">
            Dibanding rata-rata layanan
          </p>
          <p className="text-xs text-muted-foreground">Median Δ</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.evaluated} dari {p.participants} dievaluasi
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Belum ada peserta yang bisa dievaluasi.
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums sm:grid-cols-[1fr_auto]">
        <dt className="pt-2 sm:pt-0">Temuan per sesi</dt>
        <dd className="-mt-1 text-left font-semibold text-foreground sm:mt-0 sm:text-right">
          {fmt(p.findings_per_session_before)} →{" "}
          {fmt(p.findings_per_session_after)}
        </dd>
        <dt className="pt-2 sm:pt-0">Naik / stabil / turun</dt>
        <dd className="-mt-1 text-left font-semibold text-foreground sm:mt-0 sm:text-right">
          {p.naik} / {p.stabil} / {p.turun}
        </dd>
        <dt className="pt-2 sm:pt-0">Rata-rata Δ skor</dt>
        <dd
          className={`-mt-1 text-left font-semibold sm:mt-0 sm:text-right ${deltaClass(p.avg_delta)}`}
        >
          {fmtDelta(p.avg_delta)}
        </dd>
      </dl>
    </div>
  );
}

/**
 * Two series by month relative to training: participants (solid) against
 * service average including participants (dashed). Plain SVG keeps the
 * route light and prints the same way in the phase 3 export; the values are
 * also listed in a table for screen readers.
 */
export function RelativeChart({
  title,
  points,
  pick,
  scale,
  participantsLabel,
  comparisonLabel,
}: {
  title: string;
  points: EfekChartPoint[];
  pick: (p: EfekChartPoint) => [number | null, number | null];
  scale: "score" | "findings";
  participantsLabel: string;
  comparisonLabel: string;
}) {
  const g = chartGeometry(points, pick, scale);
  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-4 border-t-2 border-module-tna" />
          {participantsLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-4 border-t-2 border-dashed border-muted-foreground" />
          {comparisonLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-3 bg-module-tna/15" />
          Bulan pelatihan
        </span>
      </div>
      <svg
        viewBox={`0 0 ${g.width} ${g.height}`}
        className="h-auto w-full"
        aria-hidden="true"
      >
        {g.band && <rect {...g.band} className="fill-module-tna/10" />}
        {g.grid.map((line) => (
          <g key={line.label}>
            <line
              x1={line.x1}
              x2={line.x2}
              y1={line.y}
              y2={line.y}
              className="stroke-border"
            />
            <text
              x={line.labelX}
              y={line.y + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {line.label}
            </text>
          </g>
        ))}
        {g.ticks.map((t) => (
          <text
            key={t.key}
            x={t.x}
            y={t.y}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {t.label}
          </text>
        ))}
        <path
          d={g.comparison}
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 4"
          className="stroke-muted-foreground"
        />
        <path
          d={g.participants}
          fill="none"
          strokeWidth={2.5}
          className="stroke-module-tna"
        />
        {g.dots.map((d) => (
          <circle
            key={d.key}
            cx={d.x}
            cy={d.y}
            r={3.5}
            className="fill-module-tna"
          />
        ))}
      </svg>
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>Bulan</th>
              <th>{participantsLabel}</th>
              <th>{comparisonLabel}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.offset}>
                <td>{offsetText(p.offset)}</td>
                <td>{fmt(pick(p)[0])}</td>
                <td>{fmt(pick(p)[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
