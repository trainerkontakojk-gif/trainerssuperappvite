import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { serviceLabel, type TrendData } from "./useDashboardTrend";

const NUMBER = new Intl.NumberFormat("id-ID");

/**
 * Temuan per layanan, dijumlahkan atas rentang yang sama dengan kartu tren,
 * terbanyak dulu.
 */
export function ServiceBreakdown({ trend }: { trend: TrendData }) {
  const first = trend.labels[0];
  const last = trend.labels.at(-1);
  const rows = Object.entries(trend.serviceData)
    .map(([service, data]) => ({
      service,
      value: data.reduce((sum, v) => sum + v, 0),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = rows[0]?.value ?? 0;

  return (
    <section
      aria-labelledby="home-services-title"
      className="home-panel home-bars"
    >
      <h2 id="home-services-title" className="home-section-title">
        Temuan per layanan
      </h2>
      <p className="home-section-sub">
        {first && last
          ? `${first === last ? last : `${first} – ${last}`} · ${NUMBER.format(total)} temuan`
          : "Belum ada periode QA"}
      </p>
      {rows.length > 0 ? (
        <ul className="home-bar-list">
          {rows.map((row) => (
            <li key={row.service} className="home-bar-row">
              <span className="home-bar-name">{serviceLabel(row.service)}</span>
              <span className="home-bar-track" aria-hidden="true">
                <span style={{ width: `${(row.value / max) * 100}%` }} />
              </span>
              <span className="home-bar-value">{NUMBER.format(row.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-fg2">
          Belum ada temuan pada periode ini.
        </p>
      )}
      <Link to={"/sidak" as any} className="home-link home-bars-link">
        Buka Dashboard SIDAK
        <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
