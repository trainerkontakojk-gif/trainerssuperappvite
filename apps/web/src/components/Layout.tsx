import { Outlet, useLocation } from "@tanstack/react-router";
import { Suspense, useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { signOutLocalSession } from "../lib/session-logout";
import { useThemeMode } from "../hooks/useThemeMode";
import { Sidebar, AppHeader, MobileTabBar, MobileDrawer } from "./layout/index";
import { useRouteFocus } from "./layout/useRouteFocus";

function DashboardLayoutContent() {
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const { pathname } = useLocation();
  const { theme, setTheme } = useThemeMode();

  const contentRef = useRef<HTMLElement>(null);

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isPublicRoute = [
    "/",
    "/auth/callback",
    "/waiting-approval",
    "/reset-password",
  ].includes(pathname);
  // Halaman publik mengatur judul sendiri, tanpa shell.
  useRouteFocus(pathname, contentRef, !isPublicRoute);

  useEffect(() => {
    // Close mobile drawer on route change
    setMobileDrawerOpen(false);
  }, [pathname]);

  if (isPublicRoute) {
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
      <a
        href="#konten-halaman"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >
        Lewati ke konten
      </a>

      {/* Sidebar */}
      <Sidebar
        pathname={pathname}
        profile={profile}
        session={session}
        theme={theme}
        setTheme={setTheme}
        handleLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(44px+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {/* Sticky Glass Header */}
        {!pathname.startsWith("/profiler") && (
          <AppHeader onOpenMobileMenu={() => setMobileDrawerOpen(true)} />
        )}

        {/* Scrollable Workspace Content */}
        <section
          ref={contentRef}
          id="konten-halaman"
          role="region"
          aria-label="Konten halaman"
          tabIndex={0}
          className={`min-h-0 min-w-0 flex-1 overscroll-contain ${pathname === "/profiler" || pathname === "/profiler/" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </section>
      </main>

      {/* Bottom Tab Bar — Mobile Only */}
      <MobileTabBar
        profile={profile}
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
      />
    </div>
  );
}

export function DashboardLayout() {
  return <DashboardLayoutContent />;
}
