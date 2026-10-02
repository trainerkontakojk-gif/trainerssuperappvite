import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Sidebar } from "../components/layout/Sidebar";
import type { ReactNode } from "react";

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock framer-motion to bypass layout/animation issues in jsdom
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

interface RenderProps {
  pathname: string;
  flyoutOpen: boolean;
  flyoutModule: string | null;
}

function renderSidebar({ pathname, flyoutOpen, flyoutModule }: RenderProps) {
  const mockProfile = { role: "admin", full_name: "Test Admin" };
  const mockSession = { user: { email: "admin@test.com" } };

  const setMobileMenuOpen = vi.fn();
  const openMaintenance = vi.fn();
  const setTheme = vi.fn();
  const handleLogout = vi.fn();
  const setFlyoutOpen = vi.fn();
  const setFlyoutModule = vi.fn();

  return render(
    <Sidebar
      pathname={pathname}
      profile={mockProfile}
      session={mockSession}
      mobileMenuOpen={false}
      setMobileMenuOpen={setMobileMenuOpen}
      hasTelefunAccess={true}
      openMaintenance={openMaintenance}
      theme="light"
      setTheme={setTheme}
      handleLogout={handleLogout}
      flyoutOpen={flyoutOpen}
      setFlyoutOpen={setFlyoutOpen}
      flyoutModule={flyoutModule}
      setFlyoutModule={setFlyoutModule}
    />,
  );
}

/**
 * HANYA kontrak TAMPILAN yang tersisa di sini.
 *
 * Empat kontrak perilaku (pemisahan `data-active` vs `data-open` untuk SIDAK,
 * Management, dan halaman SIDAK) sudah dibuktikan browser-level di
 * `e2e/sidebar-nav-state.spec.ts`; salinan unitnya dihapus supaya tidak ada dua
 * versi yang bisa saling menyimpang. Assertion class responsif di bawah tidak
 * bisa dibuktikan lewat E2E secara jujur (butuh mengukur breakpoint), jadi tetap.
 */

describe("Sidebar (kontrak tampilan)", () => {
  it("hides the sidebar shell below desktop breakpoints", () => {
    const { container } = renderSidebar({
      pathname: "/dashboard",
      flyoutOpen: false,
      flyoutModule: null,
    });

    const sidebarShell = container.firstElementChild;

    expect(sidebarShell).toHaveClass(
      "hidden",
      "h-screen",
      "shrink-0",
      "lg:flex",
    );
  });
});
