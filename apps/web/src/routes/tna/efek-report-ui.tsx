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
  deltaClass,
  fmt,
  fmtDelta,
  offsetLabel,
  offsetText,
  one,
} from "./efek-report-format";

/** Shared EFEK report pieces for `/tna/efek` and `/tna/efek/program/$code`. */

const STATUS_CLASS: Record<EfekParticipantStatus, string> = {
  naik: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
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
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${status ? STATUS_CLASS[status] : "bg-amber-600/10 text-amber-700 dark:text-amber-400"}`}
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  );
}

/** Naik / stabil / turun counts, evaluated share, comparison, findings. */
export function ProgramStats({ program: p }: { program: EfekProgramSummary }) {
  const total = p.naik + p.stabil + p.turun;
  return (
    <div className="space-y-3">
      {p.evaluated > 0 ? (
        <p
          className={`font-heading text-3xl font-bold tabular-nums ${deltaClass(p.avg_delta)}`}
        >
          {fmtDelta(p.avg_delta)}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">
            poin QA rata-rata
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Belum ada peserta yang bisa dievaluasi.
        </p>
      )}
      {total > 0 && (
        <div
          className="flex h-2 gap-0.5 overflow-hidden rounded-full"
          aria-hidden="true"
        >
          <i
            className="block bg-emerald-600"
            style={{ width: `${(p.naik / total) * 100}%` }}
          />
          <i
            className="block bg-muted-foreground/40"
            style={{ width: `${(p.stabil / total) * 100}%` }}
          />
          <i
            className="block bg-destructive"
            style={{ width: `${(p.turun / total) * 100}%` }}
          />
        </div>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <dt>Naik / stabil / turun</dt>
        <dd className="text-right font-semibold text-foreground">
          {p.naik} / {p.stabil} / {p.turun}
        </dd>
        <dt>Bisa dievaluasi</dt>
        <dd className="text-right font-semibold text-foreground">
          {p.evaluated} dari {p.participants}
        </dd>
        <dt>Δ relatif agent lain</dt>
        <dd className="text-right font-semibold text-foreground">
          {fmtDelta(p.avg_relative_delta)}
        </dd>
        <dt>Temuan per sesi</dt>
        <dd className="text-right font-semibold text-foreground">
          {fmt(p.findings_per_session_before)} →{" "}
          {fmt(p.findings_per_session_after)}
        </dd>
      </dl>
    </div>
  );
}

/**
 * Two series by month relative to training: participants (solid) against
 * agents of the same service who did not join (dashed). Plain SVG keeps the
 * route light and prints the same way in the phase 3 export; the values are
 * also listed in a table for screen readers.
 */
export function RelativeChart({
  title,
  points,
  pick,
  participantsLabel,
  comparisonLabel,
}: {
  title: string;
  points: EfekChartPoint[];
  pick: (p: EfekChartPoint) => [number | null, number | null];
  participantsLabel: string;
  comparisonLabel: string;
}) {
  const width = 480;
  const height = 200;
  const pad = { left: 36, right: 12, top: 14, bottom: 26 };
  const values = points
    .flatMap((p) => pick(p))
    .filter((v): v is number => v !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const x = (i: number) =>
    pad.left +
    (i * (width - pad.left - pad.right)) / Math.max(1, points.length - 1);
  const y = (v: number) =>
    pad.top + ((hi - v) * (height - pad.top - pad.bottom)) / (hi - lo);
  const path = (series: 0 | 1) => {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = pick(p)[series];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const zero = points.findIndex((p) => p.offset === 0);
  const step = (width - pad.left - pad.right) / Math.max(1, points.length - 1);
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
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        aria-hidden="true"
      >
        {zero >= 0 && (
          <rect
            x={x(zero) - step / 2}
            y={pad.top}
            width={step}
            height={height - pad.top - pad.bottom}
            className="fill-module-tna/10"
          />
        )}
        {[lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15].map(
          (v) => (
            <g key={v}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
              />
              <text
                x={pad.left - 6}
                y={y(v) + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {one.format(v)}
              </text>
            </g>
          ),
        )}
        {points.map((p, i) => (
          <text
            key={p.offset}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {offsetLabel(p.offset)}
          </text>
        ))}
        <path
          d={path(1)}
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 4"
          className="stroke-muted-foreground"
        />
        <path
          d={path(0)}
          fill="none"
          strokeWidth={2.5}
          className="stroke-module-tna"
        />
        {points.map((p, i) => {
          const v = pick(p)[0];
          return v === null ? null : (
            <circle
              key={p.offset}
              cx={x(i)}
              cy={y(v)}
              r={3.5}
              className="fill-module-tna"
            />
          );
        })}
      </svg>
      <table className="sr-only">
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
    </figure>
  );
}
