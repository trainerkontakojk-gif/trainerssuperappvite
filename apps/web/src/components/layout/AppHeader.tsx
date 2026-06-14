import { Link, useLocation } from "@tanstack/react-router";
import { PanelLeftOpen, ChevronRight } from "lucide-react";
import { buildBreadcrumb } from "./nav-config";

interface AppHeaderProps {
  onOpenMobileMenu: () => void;
}

export function AppHeader({ onOpenMobileMenu }: AppHeaderProps) {
  const { pathname } = useLocation();
  const crumbs = buildBreadcrumb(pathname);

  return (
    <header
      className="sticky top-0 z-30 shrink-0 border-b bg-bg"
      style={{ borderColor: "var(--border)", height: "var(--header-height, 48px)" }}
    >
      <div className="flex h-full items-center px-4 lg:px-6">
        {/* Mobile hamburger */}
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 rounded-md -ml-1 mr-2 transition-colors cursor-pointer hover:bg-foreground/5"
          style={{ color: "var(--fg3)" }}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-[13px] font-medium min-w-0">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--fg3)" }} />}
              {crumb.href ? (
                <Link
                  to={crumb.href as any}
                  className="truncate transition-colors text-muted-foreground hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate text-foreground font-semibold">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Right side — spacer for future actions */}
        <div className="ml-auto" />
      </div>
    </header>
  );
}
