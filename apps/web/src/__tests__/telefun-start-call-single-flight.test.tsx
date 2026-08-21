import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";
import {
  OPENAI_WEBRTC_MODEL_ID,
  OPENAI_WEBRTC_TRANSPORT,
} from "../routes/telefun/services/telefunWebRtcCapability";

const apiMocks = vi.hoisted(() => ({
  getTelefunSettings: vi.fn(),
  saveTelefunSettings: vi.fn(),
  getTelefunSessions: vi.fn(),
  createTelefunSession: vi.fn(),
  deleteTelefunSession: vi.fn(),
  clearTelefunHistory: vi.fn(),
  mapTelefunSessionRow: vi.fn(),
  getTelefunWebRtcCapability: vi.fn(),
}));

const usageMocks = vi.hoisted(() => ({
  fetchUsageSummary: vi.fn(),
}));

vi.mock("../routes/telefun/telefunApi", () => apiMocks);
vi.mock("../routes/telefun/services/telefunWebRtcCapability", () => ({
  OPENAI_WEBRTC_MODEL_ID: "gpt-realtime-2.1",
  OPENAI_WEBRTC_TRANSPORT: "openai-webrtc",
  fetchTelefunWebRtcCapability: apiMocks.getTelefunWebRtcCapability,
  isTelefunWebRtcModelAllowed: () => false,
  isAllowedTelefunWebRtc: () => false,
}));
vi.mock("../lib/usage-summary", () => usageMocks);
vi.mock("../lib/toast", () => ({
  notify: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock("../routes/telefun/components/SettingsModal", () => ({
  SettingsModal: () => null,
}));
vi.mock("../routes/telefun/components/PhoneInterface", () => ({
  PhoneInterface: () => <div data-testid="phone-interface" />,
}));
vi.mock("../routes/telefun/components/HistoryModal", () => ({
  HistoryModal: () => null,
}));
vi.mock("../components/UsageModal", () => ({
  UsageModal: () => null,
}));
vi.mock("../components/ModuleWorkspaceIntro", () => ({
  default: ({ actions }: { actions: React.ReactNode }) => <div>{actions}</div>,
}));
vi.mock("../routes/telefun/services/telefun-recording-reconciliation", () => ({
  installTelefunRecordingReconciliation: vi.fn(),
  reconcileTelefunRecordingQueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../routes/telefun/services/openaiWebRtc/cleanup", () => ({
  createRetainedObjectUrlOwner: () => ({
    retain: vi.fn(() => true),
    release: vi.fn(),
    isRetained: vi.fn(() => false),
    releaseIfNotTransferredToReview: vi.fn(),
    markTransferredToReview: vi.fn(),
  }),
}));

import TelefunLanding from "../routes/telefun";

describe("Telefun start-call single-flight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("auth_token", "test-token");
    apiMocks.getTelefunSettings.mockResolvedValue({
      ...DEFAULT_TELEFUN_SETTINGS,
      selectedModel: OPENAI_WEBRTC_MODEL_ID,
      telefunModelId: OPENAI_WEBRTC_MODEL_ID,
      telefunTransport: OPENAI_WEBRTC_TRANSPORT,
    });
    apiMocks.getTelefunSessions.mockResolvedValue([]);
    apiMocks.getTelefunWebRtcCapability.mockResolvedValue({
      enabled: true,
      allowed: true,
      modelId: OPENAI_WEBRTC_MODEL_ID,
      transport: OPENAI_WEBRTC_TRANSPORT,
    });
    usageMocks.fetchUsageSummary.mockResolvedValue(null);
  });

  it("coalesces overlapping start clicks into one WebRTC session creation", async () => {
    let resolveSession!: (value: { id: string }) => void;
    apiMocks.createTelefunSession.mockImplementation(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveSession = resolve;
        }),
    );

    render(<TelefunLanding />);

    const startButton = await screen.findByRole("button", {
      name: /Mulai panggilan/i,
    });
    await waitFor(() => expect(startButton).not.toBeDisabled());

    fireEvent.click(startButton);
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(apiMocks.createTelefunSession).toHaveBeenCalled();
    });
    expect(apiMocks.createTelefunSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSession({ id: "session-1" });
      await Promise.resolve();
    });
  });
});
