import { Link } from "@tanstack/react-router";
import type { EfekReportSearch } from "../../router";

/**
 * TNA views: the needs/plans analysis, completed plan results (phase 6),
 * EFEK (training effectiveness), and the program catalog (phase 5).
 * `efekSearch` keeps the report filters (window, team, proper input mode)
 * when the EFEK tab leads back from a program detail.
 */
export function TnaTabs({
  current,
  efekSearch,
}: {
  current: "kebutuhan" | "hasil" | "efek" | "katalog";
  efekSearch?: EfekReportSearch;
}) {
  const tabs = [
    { id: "kebutuhan", to: "/tna", label: "Kebutuhan & rencana" },
    { id: "hasil", to: "/tna/hasil", label: "Hasil rencana" },
    { id: "efek", to: "/tna/efek", label: "EFEK" },
    { id: "katalog", to: "/tna/katalog", label: "Katalog program" },
  ] as const;
  return (
    <nav
      aria-label="Bagian TNA"
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          search={(tab.id === "efek" ? efekSearch : undefined) as never}
          aria-current={tab.id === current ? "page" : undefined}
          className={`-mb-px inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-foreground ${
            tab.id === current
              ? "border-foreground font-semibold text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
