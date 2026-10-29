import { Link } from "@tanstack/react-router";
import type { EfekReportSearch } from "../../router";

/**
 * Two TNA views: the needs/plans analysis and EFEK (training effectiveness).
 * `efekSearch` keeps the report filters (window, team, proper input mode)
 * when the EFEK tab leads back from a program detail.
 */
export function TnaTabs({
  current,
  efekSearch,
}: {
  current: "kebutuhan" | "efek";
  efekSearch?: EfekReportSearch;
}) {
  const tabs = [
    { id: "kebutuhan", to: "/tna", label: "Kebutuhan & rencana" },
    { id: "efek", to: "/tna/efek", label: "EFEK" },
  ] as const;
  return (
    <nav aria-label="Bagian TNA" className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          search={(tab.id === "efek" ? efekSearch : undefined) as never}
          aria-current={tab.id === current ? "page" : undefined}
          className={`-mb-px inline-flex min-h-[44px] items-center border-b-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-foreground ${
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
