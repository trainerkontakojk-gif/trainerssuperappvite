import { useEffect, useRef, useState, type PointerEvent } from "react";

export type ChartPoint = { label: string; value: number };

const NUMBER = new Intl.NumberFormat("id-ID");
const PAD = { left: 40, right: 20, top: 12, bottom: 28 };

/** Kelipatan sumbu Y yang rapi untuk nilai maksimum `max`. */
function yScale(max: number) {
  const step =
    max > 200 ? 100 : max > 100 ? 50 : max > 40 ? 20 : max > 10 ? 5 : 2;
  const top = Math.max(step, Math.ceil((max * 1.1) / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

/**
 * Garis tren temuan per bulan, dengan satu titik proyeksi putus-putus bila
 * ada. SVG-nya dekoratif; data yang sama tersedia sebagai tabel untuk
 * pembaca layar.
 */
export function TrendChart({
  points,
  projection,
}: {
  points: ChartPoint[];
  projection: ChartPoint | null;
}) {
  const hostRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const all = projection ? [...points, projection] : points;
  const height = width < 520 ? 200 : 240;
  const { top, ticks } = yScale(Math.max(0, ...all.map((p) => p.value)));
  const span = Math.max(1, all.length - 1);
  const x = (i: number) =>
    all.length === 1
      ? (PAD.left + width - PAD.right) / 2
      : PAD.left + (i * (width - PAD.left - PAD.right)) / span;
  const y = (v: number) =>
    PAD.top + (height - PAD.top - PAD.bottom) * (1 - v / top);
  const last = points.length - 1;
  // Label sumbu X: tanpa tahun bila sempit, dan dijarangkan bila masih rapat.
  const slot = (width - PAD.left - PAD.right) / span;
  const shortLabels = slot < 60;
  const labelEvery = Math.max(1, Math.ceil((shortLabels ? 32 : 56) / slot));
  const line = points
    .map(
      (p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`,
    )
    .join(" ");

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const vx = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    all.forEach((_, i) => {
      if (Math.abs(x(i) - vx) < Math.abs(x(best) - vx)) best = i;
    });
    setActive(best);
  };

  const activePoint = active === null ? null : all[active];
  const activeIsProjection = projection !== null && active === all.length - 1;

  return (
    <figure ref={hostRef} className="home-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
            />
            <text
              className="home-chart-axis"
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
            >
              {NUMBER.format(t)}
            </text>
          </g>
        ))}
        {all.map((p, i) =>
          (all.length - 1 - i) % labelEvery === 0 ? (
            <text
              key={`${p.label}-${i}`}
              className="home-chart-axis"
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
            >
              {shortLabels ? p.label.split(" ")[0] : p.label}
            </text>
          ) : null,
        )}
        {activePoint && (
          <line
            x1={x(active!)}
            x2={x(active!)}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="var(--fg3)"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="var(--fg)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {projection && last >= 0 && (
          <path
            d={`M${x(last)} ${y(points[last].value)} L${x(all.length - 1)} ${y(projection.value)}`}
            fill="none"
            stroke="var(--fg2)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={`${p.label}-${i}`}
            cx={x(i)}
            cy={y(p.value)}
            r={i === last ? 4 : 2.5}
            fill={i === last ? "var(--fg)" : "var(--surface)"}
            stroke="var(--fg)"
            strokeWidth={1.5}
          />
        ))}
        {projection && (
          <circle
            cx={x(all.length - 1)}
            cy={y(projection.value)}
            r={3}
            fill="var(--surface)"
            stroke="var(--fg2)"
            strokeWidth={1.5}
          />
        )}
      </svg>
      {activePoint && (
        <div
          role="tooltip"
          className="home-chart-tip"
          data-align={
            active === 0
              ? "start"
              : active === all.length - 1
                ? "end"
                : undefined
          }
          style={{
            left: `${(x(active!) / width) * 100}%`,
            top: `${(y(activePoint.value) / height) * 100}%`,
          }}
        >
          {activePoint.label}
          {activeIsProjection ? " (proyeksi)" : ""} ·{" "}
          {NUMBER.format(activePoint.value)} temuan
        </div>
      )}
      <table className="sr-only">
        <caption>Temuan per bulan</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={`${p.label}-${i}`}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
          {projection && (
            <tr data-projection="">
              <th scope="row">{projection.label} (proyeksi)</th>
              <td>{projection.value}</td>
            </tr>
          )}
        </tbody>
      </table>
    </figure>
  );
}
