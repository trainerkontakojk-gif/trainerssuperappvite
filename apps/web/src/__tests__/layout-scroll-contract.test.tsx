import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const authState = {
  profile: { role: "admin", full_name: "Fajar", email: "fajar@example.com" },
  session: { user: { email: "fajar@example.com" } },
};

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => ({ pathname: "/sidak/agents" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("../store/authStore", () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) =>
    selector(authState),
}));

vi.mock("../hooks/useThemeMode", () => ({
  useThemeMode: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("../context/TelefunWarningContext", () => ({
  TelefunWarningProvider: ({ children }: { children: ReactNode }) => children,
  useTelefunWarning: () => ({
    isMaintenanceOpen: false,
    openMaintenance: vi.fn(),
    hasTelefunAccess: true,
    grantTelefunAccess: vi.fn(),
    revokeTelefunAccess: vi.fn(),
  }),
}));

vi.mock("../routes/telefun/components/MaintenanceModal", () => ({
  MaintenanceModal: () => null,
}));

vi.mock("../components/layout/index", () => ({
  Sidebar: () => null,
  AppHeader: () => null,
  MobileTabBar: () => null,
  MobileDrawer: () => null,
}));

vi.mock("../lib/session-logout", () => ({
  signOutLocalSession: vi.fn(),
}));

import { DashboardLayout } from "../components/Layout";

describe("DashboardLayout workspace scroll contract", () => {
  it("keeps the workspace lane shrinkable and keyboard reachable", () => {
    render(<DashboardLayout />);

    const workspace = screen.getByRole("region", { name: "Konten halaman" });

    expect(workspace).toHaveClass("min-h-0", "overflow-y-auto");
    expect(workspace).toHaveAttribute("tabindex", "0");
  });
});
