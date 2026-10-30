import type { TelefunCommunicationProfile } from "@trainers/types";
import { cn } from "cn";
import { TELEFUN_PROFILE_AXES } from "../utils/reviewView";
import { formatTelefunScore } from "../utils/reviewDisplay";

/**
 * Profil komunikasi sebagai diagram spider. Semua sumbu memakai skor aspek
 * 0–10 yang sama dengan bar skor per aspek (makin ke luar makin baik). Cincin
 * skala diberi angka supaya batasnya terbaca; tidak ada zona berwarna.
 */

const WIDTH = 360;
const HEIGHT = 300;
const CX = WIDTH / 2;
const CY = 154;
const RADIUS = 96;
const RINGS = [2, 4, 6, 8, 10] as const;

function point(index: number, score: number): [number, number] {
  const angle =
    -Math.PI / 2 + (index * 2 * Math.PI) / TELEFUN_PROFILE_AXES.length;
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
  const points = TELEFUN_PROFILE_AXES.map((_, index) => point(index, score));
  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`;
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
  const axes = TELEFUN_PROFILE_AXES.flatMap((axis) => {
    const metric = profile.metrics.find((item) => item.key === axis.key);
    return metric ? [{ ...axis, score: metric.score }] : [];
  });
  if (axes.length !== TELEFUN_PROFILE_AXES.length) return null;
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
        {RINGS.map((ring) => (
          <path
            key={ring}
            d={ringPath(ring)}
            className={cn(
              "fill-none",
              ring === 10 ? "stroke-muted-foreground/60" : "stroke-border",
            )}
          />
        ))}
        {TELEFUN_PROFILE_AXES.map((axis, index) => {
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
              className="fill-module-telefun stroke-background"
              strokeWidth={1.5}
            />
          );
        })}
        {RINGS.map((ring) => {
          // Di garis bagi antara dua sumbu pertama, di tepi cincin, supaya
          // angka skala tidak menimpa label sumbu atau titik hasil.
          const angle = -Math.PI / 2 + Math.PI / TELEFUN_PROFILE_AXES.length;
          const r =
            (ring / 10) *
            RADIUS *
            Math.cos(Math.PI / TELEFUN_PROFILE_AXES.length);
          return (
            <text
              key={ring}
              x={CX + r * Math.cos(angle) + 3}
              y={CY + r * Math.sin(angle) - 2}
              className="fill-fg2 stroke-background font-mono text-xs tabular-nums"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {ring}
            </text>
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
      <figcaption className="text-xs text-fg2">
        Skala 0–10 · makin ke luar makin baik
      </figcaption>
    </figure>
  );
}
