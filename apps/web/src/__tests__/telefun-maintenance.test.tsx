import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { TelefunWarningProvider, useTelefunWarning } from "../context/TelefunWarningContext";
import { MaintenanceModal } from "../routes/telefun/components/MaintenanceModal";
import type { ReactNode } from "react";

// Mock useNavigate hook
const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const original = await vi.importActual("@tanstack/react-router");
  return {
    ...original,
    useNavigate: () => mockNavigate,
  };
});

function TestWrapper({ children }: { children: ReactNode }) {
  return <TelefunWarningProvider>{children}</TelefunWarningProvider>;
}

describe("Telefun MaintenanceModal Component", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders correctly for allowed roles (trainer) when modal is explicitly opened", async () => {
    render(
      <TestWrapper>
        <MaintenanceModal isOpen={true} role="trainer" />
      </TestWrapper>
    );

    expect(screen.getByText("Modul Dalam Pengembangan")).toBeDefined();
    expect(
      screen.getByText(
        "Modul ini masih dalam pengembangan dan mungkin tidak berjalan stabil. Anda dapat melanjutkan atau menggunakan versi Lite yang lebih stabil."
      )
    ).toBeDefined();
    expect(screen.getByText("Lanjut ke Telefun")).toBeDefined();
    expect(screen.getByText("Berpindah ke App Lite")).toBeDefined();
    expect(screen.getByText("Kembali ke Dashboard")).toBeDefined();
  });

  it("renders correctly for allowed roles (admin) when modal is explicitly opened", async () => {
    render(
      <TestWrapper>
        <MaintenanceModal isOpen={true} role="admin" />
      </TestWrapper>
    );

    expect(screen.getByText("Modul Dalam Pengembangan")).toBeDefined();
    expect(screen.getByText("Lanjut ke Telefun")).toBeDefined();
  });

  it("renders correctly for legacy trainers role alias when modal is explicitly opened", async () => {
    render(
      <TestWrapper>
        <MaintenanceModal isOpen={true} role="trainers" />
      </TestWrapper>
    );

    expect(screen.getByText("Modul Dalam Pengembangan")).toBeDefined();
    expect(screen.getByText("Lanjut ke Telefun")).toBeDefined();
  });

  it("renders restricted access message for non-allowed roles (agent)", async () => {
    render(
      <TestWrapper>
        <MaintenanceModal isOpen={true} role="agent" />
      </TestWrapper>
    );

    expect(screen.getByText("Akses Terbatas")).toBeDefined();
    expect(screen.queryByText("Lanjut ke Telefun")).toBeNull();
    expect(screen.queryByText("Berpindah ke App Lite")).toBeNull();
    expect(screen.getByText("Kembali ke Dashboard")).toBeDefined();
    expect(
      screen.getByText("Modul Telefun hanya dapat diakses oleh Trainer.")
    ).toBeDefined();
  });

  it("renders restricted access message for non-allowed roles (leader)", async () => {
    render(
      <TestWrapper>
        <MaintenanceModal isOpen={true} role="leader" />
      </TestWrapper>
    );

    expect(screen.getByText("Akses Terbatas")).toBeDefined();
    expect(screen.queryByText("Lanjut ke Telefun")).toBeNull();
    expect(screen.getByText("Kembali ke Dashboard")).toBeDefined();
    expect(
      screen.getByText("Modul Telefun hanya dapat diakses oleh Trainer.")
    ).toBeDefined();
  });

  it("calls navigate on redirect/back to dashboard", async () => {
    render(
      <TestWrapper>
        <MaintenanceModal isOpen={true} role="trainer" />
      </TestWrapper>
    );

    const backButton = screen.getByText("Kembali ke Dashboard");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
  });

  it("grants access and closes modal on continue", async () => {
    const { result } = renderHook(() => useTelefunWarning(), {
      wrapper: TestWrapper,
    });

    // Initial state: closed and access not granted
    expect(result.current.isMaintenanceOpen).toBe(false);
    expect(result.current.hasTelefunAccess).toBe(false);

    // Open maintenance modal
    act(() => {
      result.current.openMaintenance();
    });

    expect(result.current.isMaintenanceOpen).toBe(true);

    // Grant access
    act(() => {
      result.current.grantTelefunAccess();
      result.current.closeMaintenance();
    });

    // Verify access granted and modal closed
    expect(result.current.hasTelefunAccess).toBe(true);
    expect(result.current.isMaintenanceOpen).toBe(false);
  });
});
