import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, MessageSquare, Phone, BarChart3, Menu } from "lucide-react";
import { isRoleAllowed } from "../../lib/app-config";

const PRIMARY_TABS = [
  { id: "dashboard", href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { id: "ketik", href: "/ketik", icon: MessageSquare, label: "Ketik" },
  { id: "telefun", href: "/telefun", icon: Phone, label: "Telefun" },
  {
    id: "qa-analyzer",
    href: "/sidak",
    icon: BarChart3,
    label: "SIDAK",
    allowedRoles: ["trainer", "leader", "admin"],
  },
];

interface MobileTabBarProps {
  profile: { role?: string } | null;
  hasTelefunAccess: boolean;
  openMaintenance: () => void;
  onOpenDrawer: () => void;
}

export function MobileTabBar({
  profile,
  hasTelefunAccess,
  openMaintenance,
  onOpenDrawer,
}: MobileTabBarProps) {
  const { pathname } = useLocation();

  const tabs = PRIMARY_TABS.filter((t) =>
    isRoleAllowed(profile?.role, t.allowedRoles),
  );

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-bg pb-[env(safe-area-inset-bottom,0px)] lg:hidden shadow-lg"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex h-12 items-center justify-around">
        {tabs.map((tab) => {
          const active =
            tab.id === "dashboard"
              ? pathname === tab.href
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              to={tab.href as any}
              onClick={(e) => {
                if (tab.id === "telefun" && !hasTelefunAccess) {
                  e.preventDefault();
                  openMaintenance();
                }
              }}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 transition-colors"
              style={{ color: active ? "var(--fg)" : "var(--fg3)" }}
            >
              <tab.icon className="h-[18px] w-[18px]" />
              <span className="text-[9px] font-semibold tracking-wider">
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* "More" tab — opens fullscreen drawer */}
        <button
          onClick={onOpenDrawer}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
          style={{ color: "var(--fg3)" }}
        >
          <Menu className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold tracking-wider">Lainnya</span>
        </button>
      </div>
    </nav>
  );
}
