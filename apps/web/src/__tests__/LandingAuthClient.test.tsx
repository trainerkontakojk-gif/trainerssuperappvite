import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
} from "@tanstack/react-router";
import {
  AuthContext,
  LandingAuthProvider,
  HeroAuthActions,
  NavbarAuthActions,
  FooterAuthActions,
} from "../components/LandingAuthClient";
import type { ReactNode } from "react";

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

function TestApp({
  children,
  isCheckingAuth,
  isLoggedIn,
}: {
  children: ReactNode;
  isCheckingAuth: boolean;
  isLoggedIn: boolean;
}) {
  return (
    <AuthContext.Provider
      value={{ isLoggedIn, isCheckingAuth, openAuth: vi.fn() }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function renderWithRouter(
  ui: ReactNode,
  isCheckingAuth: boolean,
  isLoggedIn: boolean,
) {
  const rootRoute = createRootRoute({
    component: () => (
      <TestApp isCheckingAuth={isCheckingAuth} isLoggedIn={isLoggedIn}>
        {ui}
      </TestApp>
    ),
  });
  const router = createRouter({ routeTree: rootRoute });
  return render(<RouterProvider router={router} />);
}

describe("HeroAuthActions", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "Menyiapkan akses" while checking auth', async () => {
    renderWithRouter(<HeroAuthActions />, true, false);
    expect(await screen.findByText("Menyiapkan akses")).toBeDefined();
  });

  it('shows "Masuk ke Platform" when not logged in', async () => {
    renderWithRouter(<HeroAuthActions />, false, false);
    expect(await screen.findByText("Masuk ke Platform")).toBeDefined();
    expect(screen.getByText("Ajukan Akses")).toBeDefined();
  });

  it('shows "Buka Dashboard" when logged in', async () => {
    renderWithRouter(<HeroAuthActions />, false, true);
    expect(await screen.findByText("Buka Dashboard")).toBeDefined();
  });
});

describe("LandingAuthProvider", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps landing in guest mode after logout even when Supabase still returns a stale user", async () => {
    localStorage.setItem("trainers_logout_guest_lock", "1");
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", email: "stale@example.com" } },
      error: null,
    });

    const rootRoute = createRootRoute({
      component: () => (
        <LandingAuthProvider>
          <NavbarAuthActions />
        </LandingAuthProvider>
      ),
    });
    const router = createRouter({ routeTree: rootRoute });

    const view = render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Masuk")).toBeDefined();
    });
    expect(screen.queryByText("Dashboard")).toBeNull();
    view.unmount();
  });
});

describe("NavbarAuthActions", () => {
  it('shows "Masuk" when not logged in', async () => {
    renderWithRouter(<NavbarAuthActions />, false, false);
    expect(await screen.findByText("Masuk")).toBeDefined();
  });

  it('shows "Dashboard" link when logged in', async () => {
    renderWithRouter(<NavbarAuthActions />, false, true);
    expect(await screen.findByText("Dashboard")).toBeDefined();
  });

  it("hides buttons while checking auth", () => {
    renderWithRouter(<NavbarAuthActions />, true, false);
    expect(screen.queryByText("Masuk")).toBeNull();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });
});

describe("FooterAuthActions", () => {
  it("shows buttons when not logged in", async () => {
    renderWithRouter(<FooterAuthActions />, false, false);
    expect(await screen.findByText("Mulai Sekarang")).toBeDefined();
    expect(screen.getByText("Belum punya akses? Minta akses")).toBeDefined();
  });

  it("shows nothing while checking auth", () => {
    renderWithRouter(<FooterAuthActions />, true, false);
    expect(screen.queryByText("Mulai Sekarang")).toBeNull();
  });

  it("shows nothing when logged in", () => {
    renderWithRouter(<FooterAuthActions />, false, true);
    expect(screen.queryByText("Mulai Sekarang")).toBeNull();
  });
});
