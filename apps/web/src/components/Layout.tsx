import { Outlet, useLocation } from "@tanstack/react-router";
import { Suspense, useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../lib/supabase";
import { clearAuthLocalState } from "../lib/authLocalState";
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

    if (
      prevPathnameRef.current.startsWith("/telefun") &&
      !pathname.startsWith("/telefun")
    ) {
      revokeTelefunAccess();
    }

    prevPathnameRef.current = pathname;
  }, [
    pathname,
    hasTelefunAccess,
    openMaintenance,
    revokeTelefunAccess,
    profile,
  ]);

  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutModule, setFlyoutModule] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
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

  const userInitial = (profile?.full_name || session?.user?.email || "U")
    .charAt(0)
    .toUpperCase();

  const handleLogout = async () => {
    clearAuthLocalState({ markLoggedOut: true });
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setProfile(null);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("[Layout] signOut failed during logout:", error);
    } finally {
      window.location.href = "/";
    }
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
