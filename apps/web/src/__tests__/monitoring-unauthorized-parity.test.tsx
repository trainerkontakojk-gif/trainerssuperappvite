import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockAiClient = {
  "monitoring/history": { $get: vi.fn() },
  "monitoring/aggregation": { $get: vi.fn() },
  "monitoring/pricing": { $get: vi.fn() },
  "monitoring/billing": { $get: vi.fn() },
};
const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };

vi.mock("../lib/api", () => ({
  aiClient: mockAiClient,
  unwrapResponse: (x: any) => x,
}));

vi.mock("../lib/toast", () => ({ notify: mockToast }));

const mockSetState = vi.fn();
let _mockProfile: any = { id: "u1", role: "trainer", full_name: "Test", status: "active", email: "test@test.com" };

vi.mock("../store/authStore", () => ({
  useAuthStore: (selector: (s: any) => any) => selector({ profile: _mockProfile, session: null, setSession: mockSetState, setProfile: mockSetState }),
}));

const SAMPLE_HISTORY = [
  {
    id: "h1", user_id: "u1", module: "ketik", scenario_title: "Skenario A",
    created_at: "2025-05-01T10:00:00Z", duration_seconds: 120, score: 85,
    history: [], user_email: "a@test.com", user_role: "trainer",
    review_status: "completed", scores: { final: 85, empathy: 90, probing: 80, typo: 85, compliance: 85 },
  },
  {
    id: "h2", user_id: "u2", module: "pdkt", scenario_title: "Skenario B",
    created_at: "2025-05-02T14:00:00Z", duration_seconds: 60, score: null,
    history: [], user_email: "b@test.com", user_role: "leader",
    review_status: "not_started",
  },
  {
    id: "h3", user_id: "u3", module: "telefun", scenario_title: "Skenario C",
    created_at: "2025-05-03T09:00:00Z", duration_seconds: 300, score: 45,
    history: "http://rec.url", user_email: "c@test.com", user_role: "qa",
    review_status: "completed",
  },
];

const SAMPLE_AGGREGATION = [
  {
    user_id: "u1", user_name: "User One", user_email: "u1@test.com", user_role: "trainer",
    total_calls: 10, total_input_tokens: 1000, total_output_tokens: 500, total_tokens: 1500, total_cost_idr: 5000,
    models: [{ model_id: "gemini-2.0-flash", module: "ketik", calls: 5, input_tokens: 500, output_tokens: 250, total_tokens: 750, cost_idr: 2500 }],
  },
];

const SAMPLE_PRICING = [
  { model_id: "gemini-2.0-flash", model_name: "Gemini 2.0 Flash", provider: "gemini", input_price_usd_per_million: 0.15, output_price_usd_per_million: 0.60 },
];

const SAMPLE_BILLING = { usd_to_idr_rate: 15000 };

describe("MonitoringPage - Unauthorized & Visual Parity Fix", { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockProfile = { id: "u1", role: "trainer", full_name: "Test", status: "active", email: "test@test.com" };

    mockAiClient["monitoring/history"].$get.mockResolvedValue(SAMPLE_HISTORY);
    mockAiClient["monitoring/aggregation"].$get.mockResolvedValue(SAMPLE_AGGREGATION);
    mockAiClient["monitoring/pricing"].$get.mockResolvedValue(SAMPLE_PRICING);
    mockAiClient["monitoring/billing"].$get.mockResolvedValue(SAMPLE_BILLING);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── AC-01/02: No raw unauthenticated fetch ─────────────────────
  describe("Auth Transport", () => {
    it("calls aiClient monitoring/history $get", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await waitFor(() => expect(mockAiClient["monitoring/history"].$get).toHaveBeenCalled());
    }, 30000);

    it("does NOT call global fetch (raw unauthenticated) for monitoring endpoints", async () => {
      const rawFetch = vi.spyOn(globalThis, "fetch");
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await waitFor(() => expect(mockAiClient["monitoring/history"].$get).toHaveBeenCalled());
      const monitoringCalls = rawFetch.mock.calls.filter(
        ([input]: any[]) => typeof input === "string" && input.includes("/ai/monitoring")
      );
      expect(monitoringCalls).toHaveLength(0);
      rawFetch.mockRestore();
    });
  });

  // ── AC-05: Role-gated pricing tab ──────────────────────────────
  describe("Role-gated Pricing Tab", () => {
    it("renders pricing tab for trainer role", async () => {
      _mockProfile = { ..._mockProfile, role: "trainer" };
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Riwayat Simulasi");
      expect(screen.getByText("Harga & Kurs")).toBeTruthy();
    });

    it("renders pricing tab for admin role", async () => {
      _mockProfile = { ..._mockProfile, role: "admin" };
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Riwayat Simulasi");
      expect(screen.getByText("Harga & Kurs")).toBeTruthy();
    });

    it("does NOT render pricing tab for leader role", async () => {
      _mockProfile = { ..._mockProfile, role: "leader" };
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Riwayat Simulasi");
      expect(screen.queryByText("Harga & Kurs")).toBeNull();
    });

    it("does NOT render pricing tab for qa role", async () => {
      _mockProfile = { ..._mockProfile, role: "qa" };
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Riwayat Simulasi");
      expect(screen.queryByText("Harga & Kurs")).toBeNull();
    });
  });

  // ── AC-03: Error mapping ───────────────────────────────────────
  describe("Error Mapping", () => {
    it("maps Unauthorized to user-friendly message", async () => {
      mockAiClient["monitoring/history"].$get.mockRejectedValue(new Error("Unauthorized"));
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Sesi Anda telah berakhir. Silakan login kembali.");
    });

    it("maps Invalid token to user-friendly message", async () => {
      mockAiClient["monitoring/history"].$get.mockRejectedValue(new Error("Invalid token"));
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Sesi Anda telah berakhir. Silakan login kembali.");
    });

    it("passes through other error messages", async () => {
      mockAiClient["monitoring/history"].$get.mockRejectedValue(new Error("Server sedang sibuk"));
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Server sedang sibuk");
    });
  });

  // ── AC-04: Visual legacy parity ────────────────────────────────
  describe("Visual Elements", () => {
    it("renders hero eyebrow badge", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("SIMULATION MONITORING");
    });

    it("renders hero heading", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Pantau histori simulasi dari satu pusat observasi.");
    });

    it("renders hero description", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText(/Lihat performa agen/);
    });

    it("renders tab strip with correct tabs", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Riwayat Simulasi");
      expect(screen.getByText("Penggunaan Token")).toBeTruthy();
      expect(screen.getByText("Harga & Kurs")).toBeTruthy();
    });

    it("Riwayat Simulasi tab is active by default", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      const tab = await screen.findByText("Riwayat Simulasi");
      expect(tab.className).toContain("border-primary");
    });
  });

  // ── AC-06: No regression on existing features ──────────────────
  describe("Feature Regression", () => {
    it("renders KPI cards on history tab", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Total Sesi");
      expect(screen.getByText("Pengguna Aktif")).toBeTruthy();
      expect(screen.getByText("Rata-rata Skor")).toBeTruthy();
      expect(screen.getByText("Review Selesai")).toBeTruthy();
    });

    it("renders history data in table rows", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Skenario A");
      expect(screen.getByText("Skenario B")).toBeTruthy();
    });

    it("renders module pill filters and status dropdown", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Riwayat Simulasi");
      // Status dropdown select
      const selects = document.querySelectorAll("select");
      expect(selects.length).toBeGreaterThanOrEqual(1); // status filter
      // Module pill buttons
      expect(screen.getByText("Semua")).toBeTruthy();
      expect(screen.getByText("KETIK")).toBeTruthy();
      expect(screen.getByText("PDKT")).toBeTruthy();
      expect(screen.getByText("Telefun")).toBeTruthy();
    });

    it("switches to usage tab and fetches aggregation", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      const usageTab = await screen.findByText("Penggunaan Token");
      const user = userEvent.setup();
      await user.click(usageTab);
      await waitFor(() =>
        expect(mockAiClient["monitoring/aggregation"].$get).toHaveBeenCalled(),
      );
    });

    it("switches to pricing tab and fetches pricing + billing", async () => {
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      const pricingTab = await screen.findByText("Harga & Kurs");
      const user = userEvent.setup();
      await user.click(pricingTab);
      await waitFor(() => {
        expect(mockAiClient["monitoring/pricing"].$get).toHaveBeenCalled();
        expect(mockAiClient["monitoring/billing"].$get).toHaveBeenCalled();
      });
    });

    it("renders empty state when no history data", async () => {
      mockAiClient["monitoring/history"].$get.mockResolvedValue([]);
      const { default: MonitoringPage } = await import("../routes/monitoring");
      render(React.createElement(MonitoringPage));
      await screen.findByText("Belum ada riwayat simulasi.");
    });
  });
});
