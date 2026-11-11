import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { buildNavModel } from "./nav-config";
import { useNavBadgeMap } from "./nav-badges";
import { NavBadgeMark } from "./NavBadgeMark";

interface MobileTabBarProps {
  profile: { role?: string } | null;
  onOpenDrawer: () => void;
}

export function MobileTabBar({
  profile,
  onOpenDrawer,
}: MobileTabBarProps) {
  const { pathname } = useLocation();

  const tabs = buildNavModel(profile?.role).mobileTabs;
  const badges = useNavBadgeMap();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-bg pb-[env(safe-area-inset-bottom,0px)] lg:hidden shadow-lg"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex h-[44px] items-center justify-around">
        {tabs.map((tab) => {
          const active =
            tab.id === "dashboard"
              ? pathname === tab.href
              : pathname.startsWith(tab.activePrefix ?? tab.href);

          return (
            <Link
              key={tab.id}
              to={tab.href as any}
              className="relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-2 py-1 transition-colors"
              style={{ color: active ? "var(--fg)" : "var(--fg3)" }}
            >
              <span className="relative">
                <tab.icon className="h-[18px] w-[18px]" />
                <NavBadgeMark
                  badge={badges[tab.id]}
                  className="nav-badge absolute -right-3 -top-1.5 h-4 min-w-4 px-1 text-[10px]"
                />
              </span>
              <span className="text-xs font-semibold tracking-wider">
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* "More" tab — opens fullscreen drawer */}
        <button
          onClick={onOpenDrawer}
          className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
          style={{ color: "var(--fg3)" }}
        >
          <Menu className="h-[18px] w-[18px]" />
          <span className="text-xs font-semibold tracking-wider">
            Lainnya
          </span>
        </button>
      </div>
    </nav>
  );
}
