import { Link } from "@tanstack/react-router";
import { useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  ChevronRight,
  LogOut,
  UserCog,
  Sun,
  Moon,
  Settings,
  LayoutDashboard,
  MessageSquare,
  Mail,
  Phone,
  Users,
} from "lucide-react";
import {
  APP_MODULES,
  isRoleAllowed,
  normalizeRoleLabel,
} from "../../lib/app-config";
import { SIDAK_CHILDREN, MANAGEMENT_LINKS } from "./nav-config";
import { ThemeMode } from "../../hooks/useThemeMode";

interface SidebarProps {
  pathname: string;
  profile: any;
  session: any;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
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
  mobileMenuOpen,
  setMobileMenuOpen,
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

  // Prevent background scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const userInitial = (profile?.full_name || session?.user?.email || "U")
    .charAt(0)
    .toUpperCase();

  const handleLinkClick = () => {
    setFlyoutOpen(false);
    setFlyoutModule(null);
    setMobileMenuOpen(false);
  };

  const getModuleId = (id: string) => {
    if (id === "qa-analyzer") return "sidak";
    return id;
  };

  // Determine which modules to render in rail
  const desktopRailModules = APP_MODULES.filter(
    (module) =>
      ["dashboard", "ketik", "pdkt", "telefun", "profiler"].includes(
        module.id,
      ) && isRoleAllowed(profile?.role, module.allowedRoles),
  );

  const qaModule = APP_MODULES.find((module) => module.id === "qa-analyzer");
  const isQaAllowed =
    qaModule && isRoleAllowed(profile?.role, qaModule.allowedRoles);

  const visibleManagementLinks = MANAGEMENT_LINKS.filter((item) =>
    isRoleAllowed(profile?.role, item.allowedRoles),
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
          <span className="font-display font-bold text-sm tracking-tight">S</span>
          <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
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
                <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
                  {module.shortTitle}
                </div>
              </Link>
            );
          })}

          {/* SIDAK Module (qa-analyzer) */}
          {isQaAllowed && qaModule && (() => {
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
                <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
                  {qaModule.shortTitle}
                </div>
              </button>
            );
          })()}
        </div>

        {/* Footer actions inside rail */}
        <div className="mt-auto flex flex-col gap-2 w-full items-center border-t border-border pt-4">
          {showManagementButton && (() => {
            const isManagementActive = pathname.startsWith("/dashboard/users") || pathname.startsWith("/dashboard/access-") || pathname === "/monitoring" || pathname === "/dashboard/activities";
            const isManagementOpen = flyoutModule === "management" && flyoutOpen;
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
                <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
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
            <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
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
            <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
              Tema {theme === "dark" ? "Terang" : "Gelap"}
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="sidebar-rail-item group text-red-600 hover:bg-red-500/10"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <div className="absolute left-16 z-50 scale-0 group-hover:scale-100 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded shadow-md transition-all duration-150 origin-left whitespace-nowrap">
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
                <p className="text-[10px] font-semibold text-muted-foreground mt-1">
                  Sistem Informasi Data Analisis Kualitas
                </p>
              </div>
              <nav className="space-y-1.5">
                {SIDAK_CHILDREN.filter((item) =>
                  isRoleAllowed(profile?.role, item.allowedRoles),
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
                <p className="text-[10px] font-semibold text-muted-foreground mt-1">
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

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm lg:hidden"
              onClick={handleLinkClick}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.25 }}
              className="fixed inset-y-0 left-0 z-[70] w-76 bg-card border-r border-border p-6 lg:hidden flex flex-col h-full"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <span className="font-display font-bold text-sm">S</span>
                  </div>
                  <span className="font-display font-bold text-sm tracking-tight">
                    Trainers SuperApp
                  </span>
                </div>
                <button
                  onClick={handleLinkClick}
                  className="p-1 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-3 px-3">
                  Platform
                </p>

                {desktopRailModules.map((module) => {
                  const active = isModuleActive(module.href);
                  return (
                    <Link
                      key={module.id}
                      to={module.href as any}
                      onClick={(e) => {
                        if (module.id === "telefun" && !hasTelefunAccess) {
                          e.preventDefault();
                          openMaintenance();
                          return;
                        }
                        handleLinkClick();
                      }}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      }`}
                    >
                      <module.icon className="h-4 w-4 shrink-0" />
                      <span>{module.shortTitle}</span>
                    </Link>
                  );
                })}

                {isQaAllowed && qaModule && (
                  <div className="pt-2 border-t border-border/50 mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-3 px-3">
                      SIDAK
                    </p>
                    {SIDAK_CHILDREN.filter((item) =>
                      isRoleAllowed(profile?.role, item.allowedRoles),
                    ).map((item) => {
                      const active = item.exactMatch
                        ? pathname === item.to
                        : pathname.startsWith(item.to);

                      return (
                        <Link
                          key={item.to}
                          to={item.to as any}
                          onClick={handleLinkClick}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                          }`}
                        >
                          <BarChart3 className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {showManagementButton && (
                  <div className="pt-2 border-t border-border/50 mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-3 px-3">
                      Management
                    </p>
                    {visibleManagementLinks.map((item) => {
                      const active = pathname === item.to;
                      return (
                        <Link
                          key={item.to}
                          to={item.to as any}
                          onClick={handleLinkClick}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                          }`}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </nav>

              <div className="border-t border-border pt-4 mt-auto flex flex-col gap-1">
                <div className="px-3 py-2 rounded-xl bg-surface mb-2 border border-border/50">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Signed in as</p>
                  <p className="text-xs font-semibold truncate text-foreground" title={profile?.email || session?.user?.email}>
                    {profile?.email || session?.user?.email}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Role: {normalizeRoleLabel(profile?.role)}</p>
                </div>

                <Link
                  to="/account"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition cursor-pointer"
                  onClick={handleLinkClick}
                >
                  <UserCog className="h-4 w-4 shrink-0" />
                  <span>Akun</span>
                </Link>

                <button
                  onClick={() => {
                    setTheme(theme === "dark" ? "light" : "dark");
                    handleLinkClick();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition cursor-pointer text-left"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 shrink-0" />
                  ) : (
                    <Moon className="h-4 w-4 shrink-0" />
                  )}
                  <span>Tema {theme === "dark" ? "Terang" : "Gelap"}</span>
                </button>

                <button
                  onClick={() => {
                    handleLinkClick();
                    handleLogout();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-500/10 transition cursor-pointer text-left font-medium"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Keluar</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
