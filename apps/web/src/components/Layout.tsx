import { Outlet, Link, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Shield,
  History,
  Activity,
  Layers,
  UserCheck,
  Moon,
  Sun,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { Suspense, useState, useEffect, useRef } from "react";
import {
  APP_MODULES,
  isRoleAllowed,
  normalizeRoleLabel,
} from "../lib/app-config";
import { supabase } from "../lib/supabase";
import { ThemeToggle } from "./ThemeToggle";
import { useThemeMode } from "../hooks/useThemeMode";
import { TelefunWarningProvider, useTelefunWarning } from "../context/TelefunWarningContext";
import { MaintenanceModal } from "../routes/telefun/components/MaintenanceModal";

const SIDAK_CHILDREN = [
  { to: "/sidak", label: "Beranda SIDAK", exactMatch: true },
  { to: "/sidak/dashboard", label: "Dashboard QA" },
  { to: "/sidak/agents", label: "Analisis Individu", startsWith: true },
  { to: "/sidak/ranking", label: "Ranking Agen" },
  {
    to: "/sidak/reports",
    label: "Laporan",
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/sidak/input",
    label: "Input Temuan",
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/sidak/periods",
    label: "Periode QA",
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/sidak/settings",
    label: "Parameter QA",
    allowedRoles: ["trainer", "admin"],
  },
];

const MANAGEMENT_LINKS = [
  {
    to: "/dashboard/users",
    label: "User Management",
    icon: Shield,
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/dashboard/access-approval",
    label: "Access Approval",
    icon: UserCheck,
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/dashboard/access-groups",
    label: "Access Groups",
    icon: Layers,
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/monitoring",
    label: "Monitoring",
    icon: Activity,
    allowedRoles: ["trainer", "leader", "admin"],
  },
  {
    to: "/dashboard/activities",
    label: "Activity Logs",
    icon: History,
    allowedRoles: ["trainer", "admin"],
  },
];

function getHeaderContent(pathname: string) {
  if (pathname === "/dashboard") {
    return { eyebrow: "Dashboard Terpadu", title: "Pusat Kendali" };
  }
  if (pathname.startsWith("/sidak")) {
    return {
      eyebrow: "Sistem Informasi Data Analisis Kualitas",
      title: "SIDAK",
    };
  }
  if (pathname.startsWith("/ketik")) {
    return { eyebrow: "Kelas Etika & Trik Komunikasi", title: "KETIK" };
  }
  if (pathname.startsWith("/pdkt")) {
    return { eyebrow: "Paham Dulu Kasih Tanggapan", title: "PDKT" };
  }
  if (pathname.startsWith("/telefun")) {
    return { eyebrow: "Telephone Fun", title: "Telefun" };
  }
  if (pathname.startsWith("/profiler")) {
    return { eyebrow: "Kotak Tool Profil", title: "KTP / Profiler" };
  }
  if (
    pathname.startsWith("/monitoring") ||
    pathname === "/dashboard/monitoring"
  ) {
    return { eyebrow: "Monitoring AI Usage", title: "Monitoring" };
  }
  if (pathname.startsWith("/account")) {
    return { eyebrow: "Pengaturan Akun", title: "Profil Pengguna" };
  }
  if (pathname === "/dashboard/users") {
    return { eyebrow: "Panel Administrator", title: "Kelola Pengguna" };
  }
  if (pathname === "/dashboard/access-groups") {
    return { eyebrow: "Panel Administrator", title: "Grup Akses" };
  }
  if (pathname === "/dashboard/access-approval") {
    return { eyebrow: "Panel Administrator", title: "Persetujuan Akses" };
  }
  if (pathname === "/dashboard/activities") {
    return { eyebrow: "Panel Administrator", title: "Log Aktivitas" };
  }
  return { eyebrow: "Trainers SuperApp", title: "Pusat Kendali" };
}

export function DashboardLayoutContent() {
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const { pathname } = useLocation();
  const { theme, setTheme } = useThemeMode();

  const {
    isMaintenanceOpen,
    openMaintenance,
    hasTelefunAccess,
    revokeTelefunAccess,
  } = useTelefunWarning();
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (pathname.startsWith("/telefun") && !hasTelefunAccess && profile) {
      openMaintenance();
    }

    if (prevPathnameRef.current.startsWith("/telefun") && !pathname.startsWith("/telefun")) {
      revokeTelefunAccess();
    }

    prevPathnameRef.current = pathname;
  }, [pathname, hasTelefunAccess, openMaintenance, revokeTelefunAccess, profile]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [sidakOpen, setSidakOpen] = useState(pathname.startsWith("/sidak"));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const effectiveIsCollapsed = isSidebarCollapsed && !isSidebarHovered;
  const isPublicRoute = ["/", "/waiting-approval", "/reset-password"].includes(
    pathname,
  );
  const isStandaloneRoute = ["/pdkt/simulation"].includes(pathname);



  useEffect(() => {
    if (pathname.startsWith("/sidak")) {
      setSidakOpen(true);
    }
    // Close mobile menu on route change
    setMobileMenuOpen(false);
  }, [pathname]);

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

  if (isPublicRoute || isStandaloneRoute) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">
                Memuat halaman...
              </p>
            </div>
          </div>
        }
      >
        <Outlet />
      </Suspense>
    );
  }

  const isActive = (path: string, startsWith = false) =>
    startsWith ? pathname.startsWith(path) : pathname === path;

  const navItemClass = (active: boolean) =>
    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-300 ${
      active
        ? "bg-primary text-primary-foreground shadow-md shadow-primary/15"
        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
    } ${effectiveIsCollapsed ? "lg:justify-center lg:px-0" : ""}`;

  const visibleModules = APP_MODULES.filter(
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

  const headerContent = getHeaderContent(pathname);
  const userInitial = (profile?.full_name || session?.user?.email || "U")
    .charAt(0)
    .toUpperCase();

  const handleLogout = async () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_profile");
    localStorage.removeItem("trainers_login_time");
    localStorage.removeItem("trainers_last_activity");
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setProfile(null);
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex h-screen bg-background text-foreground transition-colors duration-300">
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={() => isSidebarCollapsed && setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`${effectiveIsCollapsed ? "lg:w-20 w-76" : "w-76"} relative z-50 shrink-0 border-r border-border/40 bg-card/55 backdrop-blur-2xl transition-all duration-500 ease-in-out lg:z-20 ${mobileMenuOpen ? "fixed inset-y-0 left-0 flex translate-x-0 z-[70]" : "fixed inset-y-0 left-0 hidden -translate-x-full lg:static lg:flex lg:translate-x-0"}`}
      >
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          {/* Brand block */}
          <div
            className={`mb-8 flex items-center overflow-hidden ${effectiveIsCollapsed ? "lg:justify-center" : "justify-between"}`}
          >
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <BarChart3 className="h-5 w-5" />
              </div>
              {!effectiveIsCollapsed && (
                <div className="flex flex-col">
                  <span className="font-display text-sm font-semibold tracking-tight">
                    Trainers SuperApp
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    Unified workspace
                  </span>
                </div>
              )}
            </Link>

            {!effectiveIsCollapsed && (
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="hidden h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground lg:flex"
                title="Sembunyikan menu"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}

            {effectiveIsCollapsed && (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute right-0 top-[28px] hidden h-6 w-6 translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary hover:text-primary lg:flex"
                title="Tampilkan menu"
              >
                <PanelLeftOpen className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 space-y-2 overflow-y-auto pb-4 pr-2 -mr-2 scrollbar-hide">
            {!effectiveIsCollapsed && (
              <p className="mb-4 ml-2 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Platform
              </p>
            )}

            {visibleModules.map((module) => (
              <Link
                key={module.id}
                to={module.href as any}
                className={navItemClass(pathname === module.href)}
                onClick={(e) => {
                  if (module.id === "telefun" && !hasTelefunAccess) {
                    e.preventDefault();
                    openMaintenance();
                  }
                  setMobileMenuOpen(false);
                }}
              >
                <module.icon className="h-4 w-4 shrink-0" />
                {!effectiveIsCollapsed && <span>{module.shortTitle}</span>}
              </Link>
            ))}

            {isQaAllowed && qaModule && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    if (effectiveIsCollapsed) setIsSidebarCollapsed(false);
                    setSidakOpen(!sidakOpen);
                  }}
                  className={`w-full ${navItemClass(pathname.startsWith("/sidak") && !sidakOpen)}`}
                >
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  {!effectiveIsCollapsed && (
                    <>
                      <span className="flex-1 text-left">
                        {qaModule.shortTitle}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-300 ${sidakOpen ? "rotate-180" : ""}`}
                      />
                    </>
                  )}
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${sidakOpen && !effectiveIsCollapsed ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
                >
                  <div className="space-y-1 px-2 pb-2 pl-11 pt-2">
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
                          className={`block rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] transition ${
                            active
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                          }`}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {visibleManagementLinks.length > 0 && (
              <>
                {!effectiveIsCollapsed && (
                  <p className="mb-4 ml-2 mt-8 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                    Management
                  </p>
                )}
                {visibleManagementLinks.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to as any}
                    className={navItemClass(pathname === item.to)}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!effectiveIsCollapsed && <span>{item.label}</span>}
                  </Link>
                ))}
              </>
            )}
          </nav>

          {/* Footer Card & Controls */}
          <div className="mt-auto space-y-2 border-t border-border/40 pt-6">
            {!effectiveIsCollapsed && (
              <div className="rounded-3xl border border-border/50 bg-background/60 px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                  Signed in
                </p>
                <p
                  className="mt-2 truncate text-sm font-semibold text-foreground"
                  title={profile?.email || session?.user?.email}
                >
                  {profile?.email || session?.user?.email}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Role: {normalizeRoleLabel(profile?.role)}
                </p>
              </div>
            )}

            <Link
              to="/account"
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground ${effectiveIsCollapsed ? "lg:justify-center lg:px-0" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <UserCog className="h-4 w-4 shrink-0" />
              {!effectiveIsCollapsed && <span>Akun</span>}
            </Link>

            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground ${effectiveIsCollapsed ? "lg:justify-center lg:px-0" : ""}`}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 shrink-0" />
              ) : (
                <Moon className="h-4 w-4 shrink-0" />
              )}
              {!effectiveIsCollapsed && (
                <span>Tema {theme === "dark" ? "Terang" : "Gelap"}</span>
              )}
            </button>

            <button
              onClick={handleLogout}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-red-500/10 hover:text-red-600 ${effectiveIsCollapsed ? "lg:justify-center lg:px-0" : ""}`}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!effectiveIsCollapsed && <span>Keluar</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky Glass Header */}
        {!pathname.startsWith("/profiler") && (
          <header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl shrink-0">
            <div className="flex h-16 items-center justify-between px-6 lg:px-10">
              <div className="flex items-center">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 rounded-xl text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors mr-3"
                >
                  <PanelLeftOpen className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground leading-none">
                    {headerContent.eyebrow}
                  </p>
                  <h1 className="font-display mt-1 text-base font-semibold tracking-tight text-foreground leading-none">
                    {headerContent.title}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ThemeToggle />
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary"
                  title={profile?.full_name || "User"}
                >
                  {userInitial}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Scrollable Workspace Content */}
        <section className={`flex-1 min-w-0 ${pathname === "/profiler" || pathname === "/profiler/" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
          {pathname.startsWith("/telefun") && !hasTelefunAccess ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          )}
        </section>
      </main>

      <MaintenanceModal isOpen={isMaintenanceOpen} role={profile?.role} />
    </div>
  );
}

export function DashboardLayout() {
  return (
    <TelefunWarningProvider>
      <DashboardLayoutContent />
    </TelefunWarningProvider>
  );
}
