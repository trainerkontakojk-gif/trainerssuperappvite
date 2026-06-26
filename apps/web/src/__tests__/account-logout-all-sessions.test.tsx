import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import type { UserProfile } from "@trainers/types";

const { mockGetUser, mockRevokeAllSessions, mockSignOutLocalSession } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockRevokeAllSessions: vi.fn(),
    mockSignOutLocalSession: vi.fn(),
  }));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
      updateUser: vi.fn(),
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

vi.mock("../lib/accountApi", () => ({
  accountApi: {
    revokeAllSessions: () => mockRevokeAllSessions(),
  },
}));

vi.mock("../lib/session-logout", () => ({
  signOutLocalSession: (args: unknown) => mockSignOutLocalSession(args),
}));

import AccountPage from "../routes/account";

const profile: UserProfile = {
  id: "user-1",
  email: "user@example.com",
  role: "trainer",
  full_name: "Test User",
  status: "active",
  is_deleted: false,
};

describe("AccountPage logout all sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setProfile(profile);
    useAuthStore.getState().setSession(null);
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    });
    mockRevokeAllSessions.mockResolvedValue({ success: true });
    mockSignOutLocalSession.mockResolvedValue(undefined);
  });

  it("renders the session security section with honest device copy", async () => {
    render(<AccountPage />);

    expect(await screen.findByText("Keamanan sesi")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /logout dari semua perangkat/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /perangkat lain akan diminta login ulang saat sesi mereka dipakai kembali/i,
      ),
    ).toBeInTheDocument();
  });

  it("does nothing when confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AccountPage />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: /logout dari semua perangkat/i,
      }),
    );

    expect(mockRevokeAllSessions).not.toHaveBeenCalled();
    expect(mockSignOutLocalSession).not.toHaveBeenCalled();
  });

  it("revokes sessions and logs out locally after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AccountPage />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: /logout dari semua perangkat/i,
      }),
    );

    await waitFor(() => {
      expect(mockRevokeAllSessions).toHaveBeenCalledTimes(1);
    });
    expect(mockSignOutLocalSession).toHaveBeenCalledWith({
      markLoggedOut: true,
      redirectTo: "/",
    });
  });

  it("shows an inline error when the API fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockRevokeAllSessions.mockRejectedValueOnce(
      new Error("Layanan auth sedang tidak tersedia."),
    );

    render(<AccountPage />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: /logout dari semua perangkat/i,
      }),
    );

    expect(
      await screen.findByText("Layanan auth sedang tidak tersedia."),
    ).toBeInTheDocument();
    expect(mockSignOutLocalSession).not.toHaveBeenCalled();
  });
});
