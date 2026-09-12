import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { Badge } from "../../../components/ui/badge";

interface ProfilerPageHeaderProps {
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}

/** Shared, restrained header for Profiler subroutes. */
export function ProfilerPageHeader({
  backHref = "/profiler",
  backLabel = "Kembali ke Profiler",
  eyebrow = "",
  title = "",
  description = "",
  icon,
  actions,
  compact = false,
}: ProfilerPageHeaderProps) {
  if (compact) {
    return (
      <div className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
          <Link
            to={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            <span className="sr-only">{backLabel}</span>
          </Link>

          {actions ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}

          <ThemeToggle />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            to={backHref}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="max-w-[15rem] truncate">{backLabel}</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-4xl">
              <Badge
                variant="outline"
                className="gap-2 text-[0.68rem] uppercase tracking-[0.16em]"
              >
                {icon}
                <span className="truncate">{eyebrow}</span>
              </Badge>
              <h1 className="mt-3 break-words font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {description}
              </p>
            </div>
            {actions ? (
              <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:max-w-[30rem] lg:justify-end">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}
