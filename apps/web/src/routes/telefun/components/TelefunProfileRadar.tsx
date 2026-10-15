import type {
  CommunicationMetric,
  TelefunCommunicationProfile,
} from "@trainers/types";
import { cn } from "cn";
import {
  formatTelefunScore,
  TELEFUN_FIX_THRESHOLD,
} from "../utils/reviewDisplay";

/**
 * Profil komunikasi sebagai diagram spider. Semua sumbu memakai skor aspek
 * 0–10 yang sama dengan bar skor per aspek (makin ke luar makin baik); zona
 * hijau adalah batas "Sudah baik" (7,0 ke atas).
 */

const AXES: readonly { key: CommunicationMetric["key"]; label: string }[] = [
  { key: "speakingRate", label: "Kecepatan bicara" },
  { key: "intonation", label: "Intonasi" },
  { key: "articulation", label: "Artikulasi" },
  { key: "fillers", label: "Filler" },
  { key: "tone", label: "Nada emosi" },
];

const WIDTH = 360;
const HEIGHT = 300;
const CX = WIDTH / 2;
const CY = 154;
const RADIUS = 96;
const RINGS = [2, 4, 6, 8, 10] as const;

function point(index: number, score: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / AXES.length;
  const r = (Math.max(0, Math.min(10, score)) / 10) * RADIUS;
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
}

function polygon(scores: readonly number[]): string {
  return scores
    .map((score, index) =>
      point(index, score)
        .map((v) => v.toFixed(1))
        .join(","),
    )
    .join(" ");
}

function ringPath(score: number): string {
  const points = AXES.map((_, index) => point(index, score));
  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`;
}

/** Sama dengan warna bar skor per aspek. */
function dotClass(score: number): string {
  if (score < TELEFUN_FIX_THRESHOLD) return "fill-chart-orange";
  if (score >= 8.5) return "fill-chart-green";
  return "fill-foreground";
}

function labelAnchor(x: number): "start" | "middle" | "end" {
  if (x > CX + 4) return "start";
  if (x < CX - 4) return "end";
  return "middle";
}

export function TelefunProfileRadar({
  profile,
}: {
  profile: TelefunCommunicationProfile;
}) {
  const axes = AXES.flatMap((axis) => {
    const metric = profile.metrics.find((item) => item.key === axis.key);
    return metric ? [{ ...axis, score: metric.score }] : [];
  });
  if (axes.length !== AXES.length) return null;
  const scores = axes.map((axis) => axis.score);
  const summary = axes
    .map((axis) => `${axis.label} ${formatTelefunScore(axis.score)}`)
    .join("; ");

  return (
    <figure className="flex flex-col items-center gap-3">
      <svg
        role="img"
        aria-label={`Diagram profil komunikasi, skor 0–10: ${summary}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        className="h-auto max-w-full overflow-visible"
      >
        <path
          d={`${ringPath(10)}${ringPath(TELEFUN_FIX_THRESHOLD)}`}
          fillRule="evenodd"
          className="fill-chart-green/8"
        />
        {RINGS.map((ring) => (
          <path
            key={ring}
            d={ringPath(ring)}
            className={cn(
              "fill-none stroke-border",
              ring === 10 && "stroke-muted-foreground/40",
            )}
          />
        ))}
        {AXES.map((axis, index) => {
          const [x, y] = point(index, 10);
          return (
            <line
              key={axis.key}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              className="stroke-border"
            />
          );
        })}
        <path
          d={ringPath(TELEFUN_FIX_THRESHOLD)}
          strokeDasharray="4 3"
          className="fill-none stroke-chart-green"
        />
        <polygon
          points={polygon(scores)}
          className="fill-module-telefun/20 stroke-module-telefun"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {axes.map((axis, index) => {
          const [x, y] = point(index, axis.score);
          return (
            <circle
              key={axis.key}
              cx={x}
              cy={y}
              r={4.5}
              className={cn("stroke-background", dotClass(axis.score))}
              strokeWidth={1.5}
            />
          );
        })}
        {axes.map((axis, index) => {
          const [x, y] = point(index, 12.2);
          const below = y > CY + 10;
          const anchor = labelAnchor(x);
          return (
            <text
              key={axis.key}
              x={x}
              y={below ? y + 4 : y - 14}
              textAnchor={anchor}
            >
              <tspan className="fill-foreground text-[13px] font-semibold">
                {axis.label}
              </tspan>
              <tspan
                x={x}
                dy={17}
                className="fill-fg2 font-mono text-xs tabular-nums"
              >
                {formatTelefunScore(axis.score)}
              </tspan>
            </text>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-fg2">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm border-2 border-module-telefun bg-module-telefun/20"
          />
          Hasil panggilan ini
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm border border-dashed border-chart-green bg-chart-green/10"
          />
          Zona sudah baik ({formatTelefunScore(TELEFUN_FIX_THRESHOLD)} ke atas)
        </span>
      </figcaption>
    </figure>
  );
}
