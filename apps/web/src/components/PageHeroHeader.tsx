import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "./ThemeToggle";

interface PageHeroHeaderProps {
  backHref?: string;
  backLabel?: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  actions?: ReactNode;
}

export default function PageHeroHeader({
  backHref = "/dashboard",
  backLabel = "Kembali ke Dashboard",
  eyebrow,
  title,
  description,
  icon,
  actions,
}: PageHeroHeaderProps) {
  return (
    <>
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <Link
            to={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-0 h-[20rem] md:h-[28rem] w-full max-w-[1000px] -translate-x-1/2 rounded-full bg-primary/5 blur-[80px] md:blur-[140px] opacity-60" />

      <header className="relative z-10 mb-8 md:mb-10 rounded-[1.5rem] md:rounded-[2rem] border border-border/50 bg-card/70 p-6 md:p-8 shadow-xl shadow-black/5 backdrop-blur-xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
              {icon}
              <span className="truncate">{eyebrow}</span>
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-balance leading-[1.1]">
                {title}
              </h1>
              <p className="max-w-3xl text-sm md:text-base lg:text-lg leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          {actions ? (
            <div className="relative z-10 flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </header>
    </>
  );
}
