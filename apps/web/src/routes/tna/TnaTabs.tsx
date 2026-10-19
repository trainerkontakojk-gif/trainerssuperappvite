import { Link } from "@tanstack/react-router";

/** Two TNA views: the needs/plans analysis and EFEK (training effectiveness). */
export function TnaTabs({ current }: { current: "kebutuhan" | "efek" }) {
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
