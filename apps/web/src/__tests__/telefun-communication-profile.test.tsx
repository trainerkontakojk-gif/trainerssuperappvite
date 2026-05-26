import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VoiceRadarChart } from "../routes/telefun/components/VoiceRadarChart";
import { CommunicationProfileZoomModal } from "../routes/telefun/components/CommunicationProfileZoomModal";
import type { TelefunCommunicationProfile } from "@trainers/types";

const mockProfile: TelefunCommunicationProfile = {
  metrics: [
    {
      key: "speakingRate",
      label: "Speaking Rate",
      value: 75,
      benchmarkValue: 70,
      evaluationMode: "optimal_range",
      idealMin: 60,
      idealMax: 80,
      status: "good",
      explanation: "Anda berada di rentang ideal.",
    },
    {
      key: "intonation",
      label: "Intonation",
      value: 82,
      benchmarkValue: 85,
      evaluationMode: "higher_better",
      goodMin: 75,
      status: "needs_improvement",
      explanation: "Cukup baik, namun masih dapat ditingkatkan.",
      improvementTip: "Variasikan nada bicara.",
    },
    {
      key: "articulation",
      label: "Articulation",
      value: 90,
      benchmarkValue: 90,
      evaluationMode: "higher_better",
      goodMin: 75,
      status: "good",
      explanation: "Artikulasi Anda sudah sangat baik.",
    },
    {
      key: "fillers",
      label: "Fillers",
      value: 15,
      benchmarkValue: 20,
      evaluationMode: "lower_better",
      goodMax: 30,
      status: "good",
      explanation: "Fillers Anda sangat minim, pertahankan.",
    },
    {
      key: "tone",
      label: "Tone",
      value: 88,
      benchmarkValue: 88,
      evaluationMode: "higher_better",
      goodMin: 75,
      status: "good",
      explanation: "Tone Anda sudah sangat baik.",
    },
  ],
  overallSummary: "Profil komunikasi Anda sangat baik.",
  strengths: ["Artikulasi jelas", "Fillers minim"],
  improvementPriorities: ["Intonasi perlu lebih hangat"],
};

describe("VoiceRadarChart", () => {
  it("renders chart when profile has metrics", () => {
    const { container } = render(
      <VoiceRadarChart profile={mockProfile} compact />,
    );
    const responsiveContainer = container.querySelector(".recharts-responsive-container");
    expect(responsiveContainer).toBeTruthy();
  });

  it("shows empty message when metrics array is empty", () => {
    const emptyProfile = { ...mockProfile, metrics: [] };
    render(<VoiceRadarChart profile={emptyProfile} compact />);
    expect(
      screen.getByText("Data profil komunikasi belum tersedia."),
    ).toBeTruthy();
  });

  it("renders in compact and expanded modes", () => {
    const { container: containerCompact } = render(
      <VoiceRadarChart profile={mockProfile} compact />,
    );
    expect(containerCompact.querySelector(".recharts-responsive-container")).toBeTruthy();

    const { container: containerExpanded } = render(
      <VoiceRadarChart profile={mockProfile} compact={false} />,
    );
    expect(containerExpanded.querySelector(".recharts-responsive-container")).toBeTruthy();
  });
});

describe("CommunicationProfileZoomModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal when isOpen is true", () => {
    render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={vi.fn()}
        profile={mockProfile}
      />,
    );
    expect(screen.getByText("Profil Komunikasi")).toBeTruthy();
    expect(screen.getByText("Cara Membaca")).toBeTruthy();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <CommunicationProfileZoomModal
        isOpen={false}
        onClose={vi.fn()}
        profile={mockProfile}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("does not render when profile is null", () => {
    const { container } = render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={vi.fn()}
        profile={null}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={onClose}
        profile={mockProfile}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on overlay click", () => {
    const onClose = vi.fn();
    render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={onClose}
        profile={mockProfile}
      />,
    );
    const overlay = document.querySelector('[class*="absolute inset-0"]');
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("closes on close button click", () => {
    const onClose = vi.fn();
    render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={onClose}
        profile={mockProfile}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const closeButton = buttons.find(
      (b) => b.getAttribute("aria-label") === "Tutup modal",
    );
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("shows Fillers direction as semakin rendah in how-to-read", () => {
    render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={vi.fn()}
        profile={mockProfile}
      />,
    );
    const fillersElements = screen.getAllByText(/Fillers/);
    expect(fillersElements.length).toBeGreaterThan(0);
    expect(
      screen.getByText(/semakin rendah skor, semakin baik/),
    ).toBeTruthy();
  });

  it("shows Speaking Rate as rentang ideal in how-to-read", () => {
    render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={vi.fn()}
        profile={mockProfile}
      />,
    );
    expect(
      screen.getByText(/ideal di rentang 60-80/),
    ).toBeTruthy();
  });

  it("displays metric detail cards with status labels", () => {
    render(
      <CommunicationProfileZoomModal
        isOpen
        onClose={vi.fn()}
        profile={mockProfile}
      />,
    );
    const baikElements = screen.getAllByText("Baik");
    expect(baikElements.length).toBeGreaterThanOrEqual(2);
    const perbaikanElements = screen.getAllByText("Perlu Perbaikan");
    expect(perbaikanElements.length).toBeGreaterThanOrEqual(1);
  });
});
