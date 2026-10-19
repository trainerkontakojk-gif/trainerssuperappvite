import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { serviceLabel, type TrendData } from "./useDashboardTrend";

const NUMBER = new Intl.NumberFormat("id-ID");
const INTEGER = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

interface Row {
  service: string;
  /** Temuan layanan ini pada periode terakhir di rentang. */
  value: number;
  /** Porsi dari seluruh temuan periode itu, dibulatkan ke persen. */
  share: number;
  /** Perubahan persen vs periode sebelumnya; null bila tidak bisa dibanding. */
  change: number | null;
}

function changeLabel(change: number | null) {
  if (change === null) return "—";
  const rounded = Math.round(change);
  if (rounded === 0) return "tetap";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

function changeTone(change: number | null) {
  if (change === null) return undefined;
  const rounded = Math.round(change);
  if (rounded > 0) return "home-bad";
  if (rounded < 0) return "home-good";
  return undefined;
}

/**
 * Temuan per layanan pada **periode terakhir** di rentang yang sama dengan
 * kartu tren: porsi periode itu dan perubahan vs periode sebelumnya. Layanan
 * yang naik paling tajam (≥5%) memimpin kalimat dan tautan SIDAK.
 */
export function ServiceBreakdown({ trend }: { trend: TrendData }) {
  const labels = trend.labels;
  const latestIndex = labels.length - 1;
  const previousIndex = labels.length - 2;
  const latestLabel = labels[latestIndex];
  const previousLabel = labels[previousIndex];
  const activeServices = trend.activeServices.filter(
    (service) => trend.serviceData[service] !== undefined,
  );
  const valueAt = (service: string, index: number) =>
    index >= 0 ? (trend.serviceData[service]?.[index] ?? 0) : 0;

  const total = activeServices.reduce(
    (sum, service) => sum + valueAt(service, latestIndex),
    0,
  );
  const rows: Row[] = activeServices
    .map((service) => {
      const value = valueAt(service, latestIndex);
      const previous = valueAt(service, previousIndex);
      // Perubahan hanya dihitung bila periode pembanding punya temuan.
      const change =
        previousIndex >= 0 && previous > 0
          ? ((value - previous) / previous) * 100
          : null;
      return {
        service,
        value,
        share: total > 0 ? Math.round((value / total) * 100) : 0,
        change,
      };
    })
    .filter((row) => row.value > 0 || valueAt(row.service, previousIndex) > 0)
    .sort((a, b) => b.value - a.value);
  const max = Math.max(1, rows[0]?.value ?? 0);
  const riser = rows
    .filter((row) => row.change !== null && row.change >= 5)
    .sort(
      (a, b) =>
        b.change! - a.change! ||
        serviceLabel(a.service).localeCompare(serviceLabel(b.service), "id"),
    )[0];

  return (
    <section
      aria-labelledby="home-services-title"
      className="home-panel home-bars"
    >
      <h2 id="home-services-title" className="home-section-title">
        Temuan per layanan
      </h2>
      <p className="home-section-sub">
        {latestLabel
          ? `${latestLabel} · ${NUMBER.format(total)} temuan`
          : "Belum ada periode QA"}
      </p>
      {rows.length > 0 ? (
        <ul className="home-bar-list">
          {rows.map((row) => {
            const label = serviceLabel(row.service);
            const change = changeLabel(row.change);
            return (
              <li key={row.service} className="home-bar-row">
                <span className="home-bar-name">{label}</span>
                <span className="home-bar-track" aria-hidden="true">
                  <span style={{ width: `${(row.value / max) * 100}%` }} />
                </span>
                <span className="home-bar-value">
                  {NUMBER.format(row.value)}
                </span>
                <span
                  className="home-bar-share"
                  title={`Porsi dari ${NUMBER.format(total)} temuan ${latestLabel ?? ""}`.trim()}
                >
                  {INTEGER.format(row.share)}%
                </span>
                <span
                  className={`home-bar-change ${changeTone(row.change) ?? ""}`.trim()}
                  title={
                    row.change === null
                      ? "Belum ada periode pembanding"
                      : `Dibanding ${previousLabel ?? "periode sebelumnya"}`
                  }
                >
                  {change}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-fg2">
          Belum ada temuan pada periode ini.
        </p>
      )}
      {riser && (
        <p className="home-bars-note">
          {serviceLabel(riser.service)} naik paling tajam.
        </p>
      )}
      <Link
        to={"/sidak" as any}
        search={(riser ? { layanan: riser.service } : {}) as any}
        className="home-link home-bars-link"
      >
        {riser
          ? `Buka SIDAK untuk ${serviceLabel(riser.service)}`
          : "Buka Dashboard SIDAK"}
        <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
