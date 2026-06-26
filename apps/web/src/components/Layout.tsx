import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Suspense, useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { signOutLocalSession } from "../lib/session-logout";
import { useThemeMode } from "../hooks/useThemeMode";
import {
  TelefunWarningProvider,
  useTelefunWarning,
} from "../context/TelefunWarningContext";
import { MaintenanceModal } from "../routes/telefun/components/MaintenanceModal";
import { Sidebar, AppHeader, MobileTabBar, MobileDrawer } from "./layout/index";

function DashboardLayoutContent() {
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeMode();

  const {
    isMaintenanceOpen,
    openMaintenance,
    hasTelefunAccess,
    grantTelefunAccess,
    revokeTelefunAccess,
  } = useTelefunWarning();
  const prevPathnameRef = useRef(pathname);

  // Auto-grant access to allowed roles immediately on profile load so they can bypass sidebar warning gates
  useEffect(() => {
    if (profile) {
      const normalizedRole = profile.role?.toLowerCase().trim();
      const isAllowedRole = ["admin", "trainer", "trainers"].includes(normalizedRole || "");
      if (isAllowedRole && !hasTelefunAccess) {
        grantTelefunAccess();
      }
    }
  }, [profile, hasTelefunAccess, grantTelefunAccess]);

  useEffect(() => {
    if (pathname.startsWith("/telefun") && !hasTelefunAccess && profile) {
      const normalizedRole = profile.role?.toLowerCase().trim();
      const isAllowedRole = ["admin", "trainer", "trainers"].includes(normalizedRole || "");
      if (isAllowedRole) {
        grantTelefunAccess();
        navigate({ to: "/telefun" });
      } else {
        openMaintenance();
      }
    }

    if (
      prevPathnameRef.current.startsWith("/telefun") &&
      !pathname.startsWith("/telefun")
    ) {
      const normalizedRole = profile?.role?.toLowerCase().trim();
      const isAllowedRole = ["admin", "trainer", "trainers"].includes(normalizedRole || "");
      if (!isAllowedRole) {
        revokeTelefunAccess();
      }
    }

    prevPathnameRef.current = pathname;
  }, [
    pathname,
    hasTelefunAccess,
    openMaintenance,
    grantTelefunAccess,
    revokeTelefunAccess,
    profile,
    navigate,
  ]);

  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutModule, setFlyoutModule] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isPublicRoute = [
    "/",
    "/auth/callback",
    "/waiting-approval",
    "/reset-password",
  ].includes(pathname);
  const isStandaloneRoute = ["/pdkt/simulation"].includes(pathname);

  useEffect(() => {
    // Close mobile drawer on route change
    setMobileDrawerOpen(false);
  }, [pathname]);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileDrawerOpen]);

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

  const handleLogout = async () => {
    await signOutLocalSession({ markLoggedOut: true, redirectTo: "/" });
  };

  return (
    <div className="flex h-screen bg-background text-foreground transition-colors duration-300">
      {/* Sidebar */}
      <Sidebar
        pathname={pathname}
        profile={profile}
        session={session}
        mobileMenuOpen={mobileDrawerOpen}
        setMobileMenuOpen={setMobileDrawerOpen}
        hasTelefunAccess={hasTelefunAccess}
        openMaintenance={openMaintenance}
        theme={theme}
        setTheme={setTheme}
        handleLogout={handleLogout}
        flyoutOpen={flyoutOpen}
        setFlyoutOpen={setFlyoutOpen}
        flyoutModule={flyoutModule}
        setFlyoutModule={setFlyoutModule}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden pb-[calc(3rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {/* Sticky Glass Header */}
        {!pathname.startsWith("/profiler") && (
          <AppHeader onOpenMobileMenu={() => setMobileDrawerOpen(true)} />
        )}

        {/* Scrollable Workspace Content */}
        <section
          className={`flex-1 min-w-0 ${pathname === "/profiler" || pathname === "/profiler/" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}
        >
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

      {/* Bottom Tab Bar — Mobile Only */}
      <MobileTabBar
        profile={profile}
        hasTelefunAccess={hasTelefunAccess}
        openMaintenance={openMaintenance}
        onOpenDrawer={() => setMobileDrawerOpen(true)}
      />

      {/* Mobile drawer bottom sheet */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        profile={profile}
        session={session}
        theme={theme}
        setTheme={setTheme}
        handleLogout={handleLogout}
        hasTelefunAccess={hasTelefunAccess}
        openMaintenance={openMaintenance}
      />

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
