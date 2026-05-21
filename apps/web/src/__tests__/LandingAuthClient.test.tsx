import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createRouter, createRootRoute } from '@tanstack/react-router';
import { AuthContext, HeroAuthActions, NavbarAuthActions, FooterAuthActions } from '../components/LandingAuthClient';
import type { ReactNode } from 'react';

function TestApp({ children, isCheckingAuth, isLoggedIn }: { children: ReactNode; isCheckingAuth: boolean; isLoggedIn: boolean }) {
  return (
    <AuthContext.Provider value={{ isLoggedIn, isCheckingAuth, openAuth: vi.fn() }}>
      {children}
    </AuthContext.Provider>
  );
}

function renderWithRouter(ui: ReactNode, isCheckingAuth: boolean, isLoggedIn: boolean) {
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

describe('HeroAuthActions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "Menyiapkan akses" while checking auth', async () => {
    renderWithRouter(<HeroAuthActions />, true, false);
    expect(await screen.findByText('Menyiapkan akses')).toBeDefined();
  });

  it('shows "Masuk ke Platform" when not logged in', async () => {
    renderWithRouter(<HeroAuthActions />, false, false);
    expect(await screen.findByText('Masuk ke Platform')).toBeDefined();
    expect(screen.getByText('Ajukan Akses')).toBeDefined();
  });

  it('shows "Buka Dashboard" when logged in', async () => {
    renderWithRouter(<HeroAuthActions />, false, true);
    expect(await screen.findByText('Buka Dashboard')).toBeDefined();
  });
});

describe('NavbarAuthActions', () => {
  it('shows "Masuk" when not logged in', async () => {
    renderWithRouter(<NavbarAuthActions />, false, false);
    expect(await screen.findByText('Masuk')).toBeDefined();
  });

  it('shows "Dashboard" link when logged in', async () => {
    renderWithRouter(<NavbarAuthActions />, false, true);
    expect(await screen.findByText('Dashboard')).toBeDefined();
  });

  it('hides buttons while checking auth', () => {
    renderWithRouter(<NavbarAuthActions />, true, false);
    expect(screen.queryByText('Masuk')).toBeNull();
    expect(screen.queryByText('Dashboard')).toBeNull();
  });
});

describe('FooterAuthActions', () => {
  it('shows buttons when not logged in', async () => {
    renderWithRouter(<FooterAuthActions />, false, false);
    expect(await screen.findByText('Mulai Sekarang')).toBeDefined();
    expect(screen.getByText('Belum punya akses? Minta akses')).toBeDefined();
  });

  it('shows nothing while checking auth', () => {
    renderWithRouter(<FooterAuthActions />, true, false);
    expect(screen.queryByText('Mulai Sekarang')).toBeNull();
  });

  it('shows nothing when logged in', () => {
    renderWithRouter(<FooterAuthActions />, false, true);
    expect(screen.queryByText('Mulai Sekarang')).toBeNull();
  });
});
