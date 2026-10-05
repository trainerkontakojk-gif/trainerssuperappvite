import type { ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  busy?: boolean;
  children: ReactNode;
}

/** Shared panel frame for the SIDAK dashboard: one border, one heading row. */
export default function SidakDashboardPanel({
  id,
  title,
  description,
  action,
  className = "",
  busy,
  children,
}: Props) {
  return (
    <section
      data-dashboard-panel
      aria-labelledby={id}
      aria-busy={busy}
      className={`flex min-w-0 flex-col rounded-xl border border-border bg-surface-elevated p-4 sm:p-5 ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id={id}
            className="font-outfit text-base font-semibold tracking-[-0.02em] text-balance text-foreground"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="mt-4 flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export const panelLinkClass =
  "-my-2 -mr-2 inline-flex min-h-[44px] shrink-0 items-center rounded-md px-2 text-sm font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
