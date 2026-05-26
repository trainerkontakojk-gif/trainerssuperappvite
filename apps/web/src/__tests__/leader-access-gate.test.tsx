import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseAccessStatus = vi.hoisted(() => vi.fn());
const mockUseAuthStore = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useAccessStatus", () => ({
  useAccessStatus: (module: string) => mockUseAccessStatus(module),
}));

vi.mock("../store/authStore", () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

import LeaderAccessGate from "../components/LeaderAccessGate";

describe("LeaderAccessGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ profile: { role: "trainer" } });
    mockUseAccessStatus.mockReturnValue({
      status: "approved",
      createdAt: "2025-01-01",
      loading: false,
      error: null,
      submitRequest: vi.fn(),
      refetch: vi.fn(),
    });
  });

  it("renders children for admin role", () => {
    mockUseAuthStore.mockReturnValue({ profile: { role: "admin" } });
    render(
      <LeaderAccessGate module="ktp" moduleLabel="KTP">
        <div data-testid="child">Content</div>
      </LeaderAccessGate>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });

  it("renders children for trainer role", () => {
    mockUseAuthStore.mockReturnValue({ profile: { role: "trainer" } });
    render(
      <LeaderAccessGate module="sidak" moduleLabel="SIDAK">
        <div data-testid="child">Content</div>
      </LeaderAccessGate>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });

  it("renders children for agent role", () => {
    mockUseAuthStore.mockReturnValue({ profile: { role: "agent" } });
    render(
      <LeaderAccessGate module="ktp" moduleLabel="KTP">
        <div data-testid="child">Content</div>
      </LeaderAccessGate>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });

  it("renders children for leader with approved access", () => {
    mockUseAuthStore.mockReturnValue({ profile: { role: "leader" } });
    mockUseAccessStatus.mockReturnValue({
      status: "approved",
      createdAt: "2025-01-01",
      loading: false,
      error: null,
      submitRequest: vi.fn(),
      refetch: vi.fn(),
    });
    render(
      <LeaderAccessGate module="ktp" moduleLabel="KTP">
        <div data-testid="child">Content</div>
      </LeaderAccessGate>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });

  it("shows loading spinner when loading", () => {
    mockUseAuthStore.mockReturnValue({ profile: { role: "leader" } });
    mockUseAccessStatus.mockReturnValue({
      status: "none",
      createdAt: null,
      loading: true,
      error: null,
      submitRequest: vi.fn(),
      refetch: vi.fn(),
    });
    render(
      <LeaderAccessGate module="ktp" moduleLabel="KTP">
        <div data-testid="child">Content</div>
      </LeaderAccessGate>,
    );
    expect(screen.getByText("Memuat status akses...")).toBeDefined();
  });

  it("shows access denied for non-leader non-admin role", () => {
    mockUseAuthStore.mockReturnValue({ profile: { role: "qa" } });
    render(
      <LeaderAccessGate module="ktp" moduleLabel="KTP">
        <div data-testid="child">Content</div>
      </LeaderAccessGate>,
    );
    expect(
      screen.getByText("Anda tidak memiliki akses ke modul ini"),
    ).toBeDefined();
  });

  describe("leader with no approved access", () => {
    beforeEach(() => {
      mockUseAuthStore.mockReturnValue({ profile: { role: "leader" } });
    });

    it("shows none status with ajukan akses button", () => {
      mockUseAccessStatus.mockReturnValue({
        status: "none",
        createdAt: null,
        loading: false,
        error: null,
        submitRequest: vi.fn(),
        refetch: vi.fn(),
      });
      render(
        <LeaderAccessGate module="ktp" moduleLabel="KTP">
          <div data-testid="child">Content</div>
        </LeaderAccessGate>,
      );
      expect(screen.getByText("Anda belum mengajukan akses")).toBeDefined();
      expect(screen.getByText("Ajukan Akses")).toBeDefined();
    });

    it("shows pending status with disabled button", () => {
      mockUseAccessStatus.mockReturnValue({
        status: "pending",
        createdAt: "2025-01-01",
        loading: false,
        error: null,
        submitRequest: vi.fn(),
        refetch: vi.fn(),
      });
      render(
        <LeaderAccessGate module="sidak" moduleLabel="SIDAK">
          <div data-testid="child">Content</div>
        </LeaderAccessGate>,
      );
      expect(
        screen.getByText("Request Anda sedang dalam proses review"),
      ).toBeDefined();
      expect(screen.getByText("Menunggu Approval")).toBeDefined();
    });

    it("shows rejected status with ajukan lagi button", () => {
      mockUseAccessStatus.mockReturnValue({
        status: "rejected",
        createdAt: "2025-01-01",
        loading: false,
        error: null,
        submitRequest: vi.fn(),
        refetch: vi.fn(),
      });
      render(
        <LeaderAccessGate module="ktp" moduleLabel="KTP">
          <div data-testid="child">Content</div>
        </LeaderAccessGate>,
      );
      expect(
        screen.getByText("Request akses Anda telah ditolak"),
      ).toBeDefined();
      expect(screen.getByText("Ajukan Akses Lagi")).toBeDefined();
    });

    it("shows revoked status with ajukan lagi button", () => {
      mockUseAccessStatus.mockReturnValue({
        status: "revoked",
        createdAt: "2025-01-01",
        loading: false,
        error: null,
        submitRequest: vi.fn(),
        refetch: vi.fn(),
      });
      render(
        <LeaderAccessGate module="sidak" moduleLabel="SIDAK">
          <div data-testid="child">Content</div>
        </LeaderAccessGate>,
      );
      expect(screen.getByText("Akses Anda telah dicabut")).toBeDefined();
      expect(screen.getByText("Ajukan Akses Lagi")).toBeDefined();
    });

    it("shows error message when present", () => {
      mockUseAccessStatus.mockReturnValue({
        status: "none",
        createdAt: null,
        loading: false,
        error: "Gagal submit request",
        submitRequest: vi.fn(),
        refetch: vi.fn(),
      });
      render(
        <LeaderAccessGate module="ktp" moduleLabel="KTP">
          <div data-testid="child">Content</div>
        </LeaderAccessGate>,
      );
      expect(screen.getByText("Gagal submit request")).toBeDefined();
    });
  });
});
