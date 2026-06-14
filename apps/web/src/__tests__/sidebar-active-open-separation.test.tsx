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
    />
  );
}

describe("Sidebar Active & Open Decoupling", () => {
  it("shows Profiler as data-active, and SIDAK/Management as inactive/closed when on Profiler page and no flyouts open", () => {
    const { container } = renderSidebar({
      pathname: "/profiler",
      flyoutOpen: false,
      flyoutModule: null,
    });

    // Profiler links to "/profiler"
    const profilerItem = container.querySelector('a[href="/profiler"]');
    expect(profilerItem).not.toBeNull();
    // Attribute values in jsdom are strings
    expect(profilerItem?.getAttribute("data-active")).toBe("true");

    // SIDAK and Management buttons
    const buttons = container.querySelectorAll("button.sidebar-rail-item");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    
    const sidakBtn = buttons[0];
    const managementBtn = buttons[1];

    expect(sidakBtn.getAttribute("data-active")).toBe("false");
    expect(sidakBtn.getAttribute("data-open")).toBe("false");

    expect(managementBtn.getAttribute("data-active")).toBe("false");
    expect(managementBtn.getAttribute("data-open")).toBe("false");
  });

  it("keeps Profiler as data-active and marks SIDAK as data-open (not data-active) when on Profiler page and SIDAK flyout is open", () => {
    const { container } = renderSidebar({
      pathname: "/profiler",
      flyoutOpen: true,
      flyoutModule: "sidak",
    });

    const profilerItem = container.querySelector('a[href="/profiler"]');
    expect(profilerItem?.getAttribute("data-active")).toBe("true");

    const buttons = container.querySelectorAll("button.sidebar-rail-item");
    const sidakBtn = buttons[0];
    
    expect(sidakBtn.getAttribute("data-active")).toBe("false");
    expect(sidakBtn.getAttribute("data-open")).toBe("true");
  });

  it("marks SIDAK as data-active and data-open when on SIDAK page and SIDAK flyout is open", () => {
    const { container } = renderSidebar({
      pathname: "/sidak/ranking",
      flyoutOpen: true,
      flyoutModule: "sidak",
    });

    const profilerItem = container.querySelector('a[href="/profiler"]');
    expect(profilerItem?.getAttribute("data-active")).toBe("false");

    const buttons = container.querySelectorAll("button.sidebar-rail-item");
    const sidakBtn = buttons[0];

    expect(sidakBtn.getAttribute("data-active")).toBe("true");
    expect(sidakBtn.getAttribute("data-open")).toBe("true");
  });

  it("keeps Profiler as data-active and marks Management as data-open (not data-active) when on Profiler page and Management flyout is open", () => {
    const { container } = renderSidebar({
      pathname: "/profiler",
      flyoutOpen: true,
      flyoutModule: "management",
    });

    const profilerItem = container.querySelector('a[href="/profiler"]');
    expect(profilerItem?.getAttribute("data-active")).toBe("true");

    const buttons = container.querySelectorAll("button.sidebar-rail-item");
    const managementBtn = buttons[1];

    expect(managementBtn.getAttribute("data-active")).toBe("false");
    expect(managementBtn.getAttribute("data-open")).toBe("true");
  });
});
