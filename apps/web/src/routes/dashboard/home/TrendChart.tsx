import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

export type ChartPoint = { label: string; value: number };

const NUMBER = new Intl.NumberFormat("id-ID");
const PAD = { left: 40, right: 20, top: 16, bottom: 28 };

/** Kelipatan sumbu Y yang rapi untuk nilai maksimum `max`. */
function yScale(max: number) {
  const step =
    max > 200 ? 100 : max > 100 ? 50 : max > 40 ? 20 : max > 10 ? 5 : 2;
  const top = Math.max(step, Math.ceil((max * 1.15) / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

type XY = [number, number];

/**
 * Kurva monotone (seperti `curveMonotoneX` d3): halus, tetapi tidak pernah
 * melampaui nilai tetangganya, jadi tidak menggambar puncak atau nilai di
 * bawah nol yang tidak ada di data.
 */
function monotonePath(pts: XY[]) {
  if (pts.length === 0) return "";
  const [x0, y0] = pts[0];
  if (pts.length === 1) return `M${x0} ${y0}`;
  const n = pts.length;
  const h = pts.slice(1).map(([x], i) => x - pts[i][0]);
  const s = pts.slice(1).map(([, y], i) => (y - pts[i][1]) / h[i]);
  const m = pts.map((_, i) => {
    if (i === 0) return s[0];
    if (i === n - 1) return s[n - 2];
    const [a, b] = [s[i - 1], s[i]];
    if (a * b <= 0) return 0;
    const p = (a * h[i] + b * h[i - 1]) / (h[i - 1] + h[i]);
    return (
      (Math.sign(a) + Math.sign(b)) *
      Math.min(Math.abs(a), Math.abs(b), 0.5 * Math.abs(p))
    );
  });
  let d = `M${x0.toFixed(1)} ${y0.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [xa, ya] = pts[i];
    const [xb, yb] = pts[i + 1];
    const t = h[i] / 3;
    d += ` C${(xa + t).toFixed(1)} ${(ya + m[i] * t).toFixed(1)} ${(xb - t).toFixed(1)} ${(yb - m[i + 1] * t).toFixed(1)} ${xb.toFixed(1)} ${yb.toFixed(1)}`;
  }
  return d;
}

/**
 * Tren temuan per bulan: kurva halus dengan area tipis, bulan terakhir
 * disorot beserta angkanya, dan satu titik proyeksi putus-putus bila ada.
 * SVG-nya dekoratif; data yang sama tersedia sebagai tabel untuk pembaca
 * layar.
 */
export function TrendChart({
  points,
  projection,
}: {
  points: ChartPoint[];
  projection: ChartPoint | null;
}) {
  const hostRef = useRef<HTMLElement>(null);
  const gradientId = useId();
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
  const base = y(0);
  const last = points.length - 1;
  // Label sumbu X: tanpa tahun bila sempit, dan dijarangkan bila masih rapat.
  const slot = (width - PAD.left - PAD.right) / span;
  const shortLabels = slot < 60;
  const labelEvery = Math.max(1, Math.ceil((shortLabels ? 32 : 56) / slot));

  const coords = points.map((p, i): XY => [x(i), y(p.value)]);
  const line = monotonePath(coords);
  const area =
    coords.length > 1
      ? `${line} L${coords[last][0].toFixed(1)} ${base} L${coords[0][0].toFixed(1)} ${base} Z`
      : "";
  // Kunci animasi: kurva digambar ulang hanya bila datanya berubah.
  const seriesKey = points.map((p) => `${p.label}:${p.value}`).join("|");

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
  const lastPoint = last >= 0 ? points[last] : null;
  const edgeAlign = (i: number) =>
    i === 0 ? "start" : i === all.length - 1 ? "end" : undefined;

  return (
    <figure ref={hostRef} className="home-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="home-chart-fill-top" />
            <stop offset="100%" className="home-chart-fill-bottom" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              className={t === 0 ? "home-chart-base" : "home-chart-grid"}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
            />
            <text
              className="home-chart-axis"
              x={PAD.left - 10}
              y={y(t) + 4}
              textAnchor="end"
            >
              {NUMBER.format(t)}
            </text>
          </g>
        ))}

        {projection && last >= 0 && (
          <rect
            className="home-chart-future"
            x={x(last)}
            y={PAD.top}
            width={width - PAD.right - x(last)}
            height={base - PAD.top}
          />
        )}

        {all.map((p, i) =>
          (all.length - 1 - i) % labelEvery === 0 ? (
            <text
              key={`${p.label}-${i}`}
              className="home-chart-axis"
              data-active={active === i || undefined}
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
            className="home-chart-cursor"
            x1={x(active!)}
            x2={x(active!)}
            y1={PAD.top}
            y2={base}
          />
        )}

        <g key={seriesKey}>
          {area && (
            <path
              className="home-chart-area"
              d={area}
              fill={`url(#${gradientId})`}
            />
          )}
          <path className="home-chart-line" d={line} pathLength={1} />
        </g>

        {projection && lastPoint && (
          <path
            className="home-chart-projection"
            d={`M${x(last)} ${y(lastPoint.value)} L${x(all.length - 1)} ${y(projection.value)}`}
          />
        )}
        {projection && (
          <>
            <circle
              className="home-chart-projection-dot"
              cx={x(all.length - 1)}
              cy={y(projection.value)}
              r={4}
            />
            {!activeIsProjection && (
              <text
                className="home-chart-axis"
                x={x(all.length - 1)}
                y={y(projection.value) - 12}
                textAnchor="middle"
              >
                {NUMBER.format(projection.value)}
              </text>
            )}
          </>
        )}

        {activePoint && !activeIsProjection && active !== last && (
          <circle
            className="home-chart-dot"
            cx={x(active!)}
            cy={y(activePoint.value)}
            r={4}
          />
        )}
        {lastPoint && (
          <>
            <circle
              className="home-chart-halo"
              cx={x(last)}
              cy={y(lastPoint.value)}
              r={9}
            />
            <circle
              className="home-chart-dot home-chart-dot-last"
              cx={x(last)}
              cy={y(lastPoint.value)}
              r={4.5}
            />
          </>
        )}
      </svg>

      {lastPoint && active === null && (
        <div
          className="home-chart-end"
          data-align={edgeAlign(last)}
          style={{
            left: `${(x(last) / width) * 100}%`,
            top: `${(y(lastPoint.value) / height) * 100}%`,
          }}
        >
          {NUMBER.format(lastPoint.value)}
        </div>
      )}

      {activePoint && (
        <div
          role="tooltip"
          className="home-chart-tip"
          data-align={edgeAlign(active!)}
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
