import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";

const { mockGetSettings, mockGenerate, mockWarning } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockGenerate: vi.fn(),
  mockWarning: vi.fn(),
}));

// Mock modules before imports
vi.mock("../routes/ketik/ketikApi", () => ({
  ketikApi: {
    getSettings: mockGetSettings,
    getHistory: vi.fn().mockResolvedValue([]),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    persistSession: vi.fn().mockResolvedValue({}),
    startReview: vi.fn().mockResolvedValue({}),
    getReviewStatus: vi
      .fn()
      .mockResolvedValue({ status: "completed", resultReady: true }),
    getReviewDetail: vi.fn().mockResolvedValue({
      sessionId: "sess1",
      review: {
        id: "r1",
        sessionId: "sess1",
        aiSummary: "Good",
        strengths: [],
        weaknesses: [],
        coachingFocus: [],
        createdAt: "",
      },
      typos: [],
      scores: { final: 85, empathy: 80, probing: 85, typo: 90, compliance: 85 },
    }),
    getUsageSummary: vi.fn().mockResolvedValue({
      total_calls: 10,
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_tokens: 1500,
      total_cost_idr: 5000,
      periodLabel: "Januari 2025",
    }),
    generate: mockGenerate,
  },
}));

vi.mock("../lib/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: mockWarning,
  },
}));

const defaultSettings = {
  scenarios: [
    {
      id: "s1",
      title: "Test Scenario",
      description: "Test",
      category: "General",
      isActive: true,
    },
  ],
  consumerTypes: [
    {
      id: "ct1",
      name: "Test Consumer",
      description: "",
      difficulty: "Mudah",
    },
  ],
  quickTemplates: [],
  activeConsumerTypeId: "random",
  identitySettings: {
    displayName: "",
    signatureName: "",
    phoneNumber: "",
    city: "",
  },
  selectedModel: "gemini-3.1-flash-lite",
  simulationDuration: 5,
  responsePacingMode: "realistic",
};

vi.mock("../lib/usage-summary", () => ({
  fetchUsageSummary: vi.fn().mockResolvedValue({
    totalCalls: 10,
    totalTokens: 1500,
    totalCostIdr: 5000,
    periodLabel: "Januari 2025",
    breakdown: {
      simulation: { calls: 8, totalTokens: 1000, costIdr: 3000 },
      review: { calls: 2, totalTokens: 500, costIdr: 2000 },
    },
  }),
}));

import KetikLanding from "../routes/ketik/index";

describe("KETIK Landing Page", () => {
  beforeEach(() => {
    mockGetSettings.mockReset().mockResolvedValue(defaultSettings);
    mockGenerate.mockReset().mockResolvedValue({ text: "Test response" });
    mockWarning.mockReset();
    // Mock localStorage
    const store: Record<string, string> = { auth_token: "test-token" };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key) => store[key] ?? null,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      store[key] = value;
    });
    useAuthStore.setState({
      session: { access_token: "test-token" } as any,
      profile: { id: "u1" } as any,
    });
  });

  it("renders ModuleWorkspaceIntro with correct description text", async () => {
    render(<KetikLanding />);

    await screen.findByText(/Mulai simulasi/i);
    expect(screen.getByText(/Mulai simulasi/i)).toBeDefined();
    expect(screen.getByText("Pengaturan")).toBeDefined();
    expect(screen.getByText("Riwayat")).toBeDefined();
    expect(screen.getByText(/Pemakaian bulan ini/i)).toBeDefined();

    expect(
      screen.getByText(/Ketik — singkatan dari/), 
    ).toBeDefined();
    expect(
      screen.getByText(/Latih percakapan chat\. Balas lebih tepat dan empatik\./),
    ).toBeDefined();
  });

  it("shows SettingsModal when Pengaturan is clicked", async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText("Pengaturan");
    await user.click(screen.getByText("Pengaturan"));
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
  });

  it("shows HistoryModal when Riwayat is clicked", async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText("Riwayat");
    await user.click(screen.getByText("Riwayat"));
    expect(screen.getByText("Riwayat Simulasi")).toBeDefined();
  });

  it("shows UsageModal when Usage Bulan Ini is clicked", async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText(/Pemakaian bulan ini/i);
    await user.click(screen.getByText(/Pemakaian bulan ini/i));
    expect(screen.getByText(/Estimasi biaya/)).toBeDefined();
  });

  it("starts simulation when Mulai Simulasi is clicked", async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText(/Mulai simulasi/i);
    await user.click(screen.getByText(/Mulai simulasi/i));

    // Should transition to chat view - check for elapsed timer display (0:00 at start)
    await screen.findByText(/0:00/);
  });

  it("opens settings and warns when no consumer types are available", async () => {
    const user = userEvent.setup();
    mockGetSettings.mockResolvedValueOnce({
      ...defaultSettings,
      consumerTypes: [],
    });
    render(<KetikLanding />);

    await screen.findByText(/Mulai simulasi/i);
    await user.click(screen.getByText(/Mulai simulasi/i));

    await waitFor(() => {
      expect(mockWarning).toHaveBeenCalledWith(
        "Tambahkan minimal satu karakter pelanggan di Pengaturan.",
      );
    });
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
    expect(screen.queryByText(/0:00/)).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
