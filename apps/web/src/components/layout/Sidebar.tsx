import { Link } from "@tanstack/react-router";
import { useRef, useEffect } from "react";
import {
  ChevronRight,
  LogOut,
  UserCog,
  Sun,
  Moon,
  Settings,
} from "lucide-react";
import {
  APP_MODULES,
  isCapabilityAllowed,
} from "../../lib/app-config";
import { SIDAK_CHILDREN, MANAGEMENT_LINKS } from "./nav-config";
import { ThemeMode } from "../../hooks/useThemeMode";

interface SidebarProps {
  pathname: string;
  profile: any;
  session: any;
  hasTelefunAccess: boolean;
  openMaintenance: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  handleLogout: () => void;
  flyoutOpen: boolean;
  setFlyoutOpen: (open: boolean) => void;
  flyoutModule: string | null;
  setFlyoutModule: (module: string | null) => void;
}

export function Sidebar({
  pathname,
  profile,
  session,
  hasTelefunAccess,
  openMaintenance,
  theme,
  setTheme,
  handleLogout,
  flyoutOpen,
  setFlyoutOpen,
  flyoutModule,
  setFlyoutModule,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Click outside flyout handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        flyoutOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setFlyoutOpen(false);
        setFlyoutModule(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [flyoutOpen, setFlyoutOpen, setFlyoutModule]);

  const userInitial = (profile?.full_name || session?.user?.email || "U")
    .charAt(0)
    .toUpperCase();

  const handleLinkClick = () => {
    setFlyoutOpen(false);
    setFlyoutModule(null);
  };

  // Determine which modules to render in rail
  const desktopRailModules = APP_MODULES.filter(
    (module) =>
      ["dashboard", "ketik", "pdkt", "telefun", "profiler"].includes(
        module.id,
      ) && isCapabilityAllowed(profile?.role, module.capability),
  );

  const qaModule = APP_MODULES.find((module) => module.id === "qa-analyzer");
  const isQaAllowed =
    qaModule && isCapabilityAllowed(profile?.role, qaModule.capability);

  const visibleManagementLinks = MANAGEMENT_LINKS.filter((item) =>
    isCapabilityAllowed(profile?.role, item.capability),
  );

  const showManagementButton = visibleManagementLinks.length > 0;

  // Active check helper
  const isModuleActive = (moduleHref: string) => {
    if (moduleHref === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(moduleHref);
  };

  return (
    <div className="hidden h-screen shrink-0 lg:flex" ref={sidebarRef}>
      {/* Desktop Icon Rail */}
      <div className="sidebar-rail hidden lg:flex">
        {/* BrandMark */}
        <Link
          to="/dashboard"
          onClick={handleLinkClick}
          className="sidebar-rail-item group mb-4 h-9 w-9 rounded-xl border border-border bg-surface flex items-center justify-center text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
        >
          <span className="font-display font-bold text-sm tracking-tight">
            S
          </span>
          <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-xs font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
            Dashboard
          </div>
        </Link>

        <div className="w-8 border-b border-border mb-3" />

        {/* Regular Modules */}
        <div className="flex-1 flex flex-col gap-2 w-full items-center">
          {desktopRailModules.map((module) => {
            const isActive = isModuleActive(module.href);
            return (
              <Link
                key={module.id}
                to={module.href as any}
                className="sidebar-rail-item group"
                data-active={isActive}
                onClick={(e) => {
                  if (module.id === "telefun" && !hasTelefunAccess) {
                    e.preventDefault();
                    openMaintenance();
                    return;
                  }
                  handleLinkClick();
                }}
              >
                <module.icon className="h-[18px] w-[18px]" />
                <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-xs font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
                  {module.shortTitle}
                </div>
              </Link>
            );
          })}

          {/* SIDAK Module (qa-analyzer) */}
          {isQaAllowed &&
            qaModule &&
            (() => {
              const isSidakActive = pathname.startsWith("/sidak");
              const isSidakOpen = flyoutModule === "sidak" && flyoutOpen;
              return (
                <button
                  className="sidebar-rail-item group"
                  data-active={isSidakActive}
                  data-open={isSidakOpen}
                  onClick={() => {
                    if (flyoutModule === "sidak" && flyoutOpen) {
                      setFlyoutOpen(false);
                      setFlyoutModule(null);
                    } else {
                      setFlyoutModule("sidak");
                      setFlyoutOpen(true);
                    }
                  }}
                >
                  <qaModule.icon className="h-[18px] w-[18px]" />
                  <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-xs font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
                    {qaModule.shortTitle}
                  </div>
                </button>
              );
            })()}
        </div>

        {/* Footer actions inside rail */}
        <div className="mt-auto flex flex-col gap-2 w-full items-center border-t border-border pt-4">
          {showManagementButton &&
            (() => {
              const isManagementActive =
                pathname.startsWith("/dashboard/users") ||
                pathname.startsWith("/dashboard/access-") ||
                pathname === "/monitoring" ||
                pathname === "/dashboard/activities";
              const isManagementOpen =
                flyoutModule === "management" && flyoutOpen;
              return (
                <button
                  className="sidebar-rail-item group"
                  data-active={isManagementActive}
                  data-open={isManagementOpen}
                  onClick={() => {
                    if (flyoutModule === "management" && flyoutOpen) {
                      setFlyoutOpen(false);
                      setFlyoutModule(null);
                    } else {
                      setFlyoutModule("management");
                      setFlyoutOpen(true);
                    }
                  }}
                >
                  <Settings className="h-[18px] w-[18px]" />
                  <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-xs font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
                    Management
                  </div>
                </button>
              );
            })()}

          <Link
            to="/account"
            className="sidebar-rail-item group"
            data-active={pathname.startsWith("/account")}
            onClick={handleLinkClick}
          >
            <UserCog className="h-[18px] w-[18px]" />
            <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-xs font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
              Akun
            </div>
          </Link>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="sidebar-rail-item group text-muted-foreground hover:text-foreground"
          >
            {theme === "dark" ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
            <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-xs font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
              Tema {theme === "dark" ? "Terang" : "Gelap"}
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="sidebar-rail-item group text-red-600 hover:bg-red-500/10"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-xs font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
              Keluar
            </div>
          </button>

          <div className="w-8 border-b border-border my-2" />

          {/* User Initial Circle */}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary"
            title={profile?.full_name || "User"}
          >
            {userInitial}
          </div>
        </div>
      </div>

      {/* Desktop Flyout Panel */}
      <div className="sidebar-flyout hidden lg:block" data-open={flyoutOpen}>
        <div className="flex flex-col h-full w-[260px] p-6 overflow-y-auto">
          {flyoutModule === "sidak" && (
            <>
              <div className="mb-6">
                <h2 className="font-display font-semibold text-sm tracking-tight text-foreground">
                  SIDAK
                </h2>
                <p className="text-xs font-semibold text-muted-foreground mt-1">
                  Sistem Informasi Data Analisis Kualitas
                </p>
              </div>
              <nav className="space-y-1.5">
                {SIDAK_CHILDREN.filter((item) =>
                  isCapabilityAllowed(profile?.role, item.capability),
                ).map((item) => {
                  const active = item.exactMatch
                    ? pathname === item.to
                    : pathname.startsWith(item.to);

                  return (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? "bg-foreground/5 text-foreground font-semibold"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      }`}
                      onClick={handleLinkClick}
                    >
                      <span>{item.label}</span>
                      {active && <ChevronRight className="h-3 w-3" />}
                    </Link>
                  );
                })}
              </nav>
            </>
          )}

          {flyoutModule === "management" && (
            <>
              <div className="mb-6">
                <h2 className="font-display font-semibold text-sm tracking-tight text-foreground">
                  Management
                </h2>
                <p className="text-xs font-semibold text-muted-foreground mt-1">
                  Administrasi & Monitoring
                </p>
              </div>
              <nav className="space-y-1.5">
                {visibleManagementLinks.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? "bg-foreground/5 text-foreground font-semibold"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      }`}
                      onClick={handleLinkClick}
                    >
                      <div className="flex items-center gap-2">
                        <item.icon className="h-3.5 w-3.5" />
                        <span>{item.label}</span>
                      </div>
                      {active && <ChevronRight className="h-3 w-3" />}
                    </Link>
                  );
                })}
              </nav>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
