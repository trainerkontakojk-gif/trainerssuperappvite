import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useAuthStore } from "../../../../store/authStore";
import { isCapabilityAllowed } from "../../../../lib/app-config";
import { MANAGEMENT_LINKS } from "../../../../components/layout/nav-config";

// Monitoring ada di menu Management tetapi modul tersendiri dengan header dan
// navigasinya sendiri, jadi tidak ikut navigasi seksi ini.
const MANAGEMENT_SECTIONS = MANAGEMENT_LINKS.filter(
  (link) => link.to !== "/monitoring",
);

interface ManagementShellProps {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function ManagementShell({
  title,
  description,
  actions,
  children,
}: ManagementShellProps) {
  const role = useAuthStore((s) => s.profile?.role);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sections = MANAGEMENT_SECTIONS.filter((section) =>
    isCapabilityAllowed(role, section.capability),
  );

  return (
    <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <nav
        aria-label="Navigasi manajemen"
        className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1">
          {sections.map((section) => {
            const active = pathname === section.to;
            return (
              <li key={section.to}>
                <Link
                  to={section.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>

      {children}
    </div>
  );
}
