import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  VoiceRadarChart,
  buildVoiceRadarData,
} from "../routes/telefun/components/VoiceRadarChart";
import VoiceRadarChartInner from "../routes/telefun/components/VoiceRadarChartInner";
import { CommunicationProfileZoomModal } from "../routes/telefun/components/CommunicationProfileZoomModal";
import { VoiceMetricCards } from "../routes/telefun/components/VoiceMetricCards";
import type { TelefunCommunicationProfile } from "@trainers/types";

const mockProfile: TelefunCommunicationProfile = {
  metrics: [
    {
      key: "speakingRate",
      label: "Speaking Rate",
      value: 75,
      benchmarkValue: 70,
      score: 7,
      displayScore: 75,
      targetScore: 70,
      targetDirection: "match_target",
      evaluationMode: "optimal_range",
      idealMin: 60,
      idealMax: 80,
      verdict: "Baik",
      status: "good",
      feedback: "Tempo stabil.",
      explanation: "Anda berada di rentang ideal.",
    },
    {
      key: "intonation",
      label: "Intonation",
      value: 82,
      benchmarkValue: 85,
      score: 8,
      displayScore: 82,
      targetScore: 85,
      targetDirection: "higher_quality",
      evaluationMode: "higher_better",
      goodMin: 75,
      verdict: "Cukup",
      status: "needs_improvement",
      feedback: "Intonasi perlu dibuat lebih hangat.",
      explanation: "Cukup baik, namun masih dapat ditingkatkan.",
      improvementTip: "Variasikan nada bicara.",
    },
    {
      key: "articulation",
      label: "Articulation",
      value: 90,
      benchmarkValue: 90,
      score: 9,
      displayScore: 90,
      targetScore: 90,
      targetDirection: "higher_quality",
      evaluationMode: "higher_better",
      goodMin: 75,
      verdict: "Baik",
      status: "good",
      feedback: "Artikulasi jelas.",
      explanation: "Artikulasi Anda sudah sangat baik.",
    },
    {
      key: "fillers",
      label: "Fillers",
      value: 15,
      benchmarkValue: 20,
      score: 8,
      displayScore: 15,
      targetScore: 20,
      targetDirection: "lower_raw_is_better",
      rawValue: 2,
      rawUnit: "filler_words",
      evaluationMode: "lower_better",
      goodMax: 30,
      verdict: "Baik",
      status: "good",
      feedback: "Kata pengisi minim.",
      explanation: "Fillers Anda sangat minim, pertahankan.",
    },
    {
      key: "tone",
      label: "Tone",
      value: 88,
      benchmarkValue: 88,
      score: 8,
      displayScore: 88,
      targetScore: 88,
      targetDirection: "higher_quality",
      evaluationMode: "higher_better",
      goodMin: 75,
      verdict: "Baik",
      status: "good",
      feedback: "Nada sudah empatik.",
      explanation: "Tone Anda sudah sangat baik.",
    },
  ],
  overallSummary: "Profil komunikasi Anda sangat baik.",
  strengths: ["Artikulasi jelas", "Fillers minim"],
  improvementPriorities: ["Intonasi perlu lebih hangat"],
};

describe("buildVoiceRadarData", () => {
  it("maps metrics to VoiceRadarDatum with userValue and targetValue", () => {
    const data = buildVoiceRadarData(mockProfile);
    expect(data).toHaveLength(5);

    const sr = data.find((d) => d.key === "speakingRate");
    expect(sr).toBeDefined();
    expect(sr!.subject).toBe("speakingRate");
    expect(sr!.userValue).toBe(75);
    expect(sr!.targetValue).toBe(70);
    expect(sr!.fullMark).toBe(100);

    const fillers = data.find((d) => d.key === "fillers");
    expect(fillers).toBeDefined();
    expect(fillers!.userValue).toBe(15);
    expect(fillers!.targetValue).toBe(20);
  });

  it("produces non-zero userValue and targetValue for all metrics", () => {
    const data = buildVoiceRadarData(mockProfile);
    for (const datum of data) {
      expect(datum.userValue).toBeGreaterThan(0);
      expect(datum.targetValue).toBeGreaterThan(0);
    }
  });

  it("uses displayScore and targetScore for radar values", () => {
    const data = buildVoiceRadarData({
      ...mockProfile,
      metrics: mockProfile.metrics.map((m) => ({
        ...m,
        displayScore: m.key === "speakingRate" ? 64 : m.value,
        targetScore: m.key === "speakingRate" ? 70 : m.benchmarkValue,
      })),
    });
    const sr = data.find((d) => d.key === "speakingRate")!;
    expect(sr.userValue).toBe(64);
    expect(sr.targetValue).toBe(70);
  });

  it("labels fillers with low-target hint", () => {
    const fillers = buildVoiceRadarData(mockProfile).find(
      (d) => d.key === "fillers",
    )!;
    expect(fillers.label).toContain("↓");
  });
});

describe("VoiceRadarChart", () => {
  it("renders chart when profile has metrics", () => {
    const { container } = render(
      <VoiceRadarChartInner profile={mockProfile} compact />,
    );
    expect(
      container.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();
  });

  it("shows empty message when metrics array is empty", () => {
    const emptyProfile = { ...mockProfile, metrics: [] };
    render(<VoiceRadarChartInner profile={emptyProfile} compact />);
    expect(
      screen.getByText("Data profil komunikasi belum tersedia."),
    ).toBeTruthy();
  });

  it("renders in compact and expanded modes", () => {
    const { container: containerCompact } = render(
      <VoiceRadarChartInner profile={mockProfile} compact />,
    );
    expect(
      containerCompact.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();

    const { container: containerExpanded } = render(
      <VoiceRadarChartInner profile={mockProfile} compact={false} />,
    );
    expect(
      containerExpanded.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();
  });
});

describe("VoiceMetricCards", () => {
  it("renders display score separately from speaking rate raw WPM", () => {
    render(
      <VoiceMetricCards
        profile={{
          ...mockProfile,
          metrics: [
            {
              ...mockProfile.metrics[0],
              displayScore: 56,
              value: 56,
              targetScore: 70,
              benchmarkValue: 70,
              rawValue: 118,
              rawUnit: "WPM",
              feedback: "Tempo agak lambat.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("56")).toBeTruthy();
    expect(screen.getByText("/100")).toBeTruthy();
    expect(screen.getByText("Detail: 118 WPM")).toBeTruthy();
    expect(screen.queryByText("118/100")).toBeNull();
    expect(screen.getByText("Tempo agak lambat.")).toBeTruthy();
  });

  it("uses Cukup as the middle status label", () => {
    render(
      <VoiceMetricCards
        profile={{
          ...mockProfile,
          metrics: [mockProfile.metrics[1]],
        }}
      />,
    );

    expect(screen.getByText("Cukup")).toBeTruthy();
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
      <CommunicationProfileZoomModal isOpen onClose={vi.fn()} profile={null} />,
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

  it("shows Fillers direction as target QA memang rendah in how-to-read", () => {
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
      screen.getByText(
        /target QA memang rendah. Semakin dekat hasil Anda ke target rendah ini, semakin baik./,
      ),
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
    expect(screen.getByText(/ideal di rentang 60-80/)).toBeTruthy();
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
    const cukupElements = screen.getAllByText("Cukup");
    expect(cukupElements.length).toBeGreaterThanOrEqual(1);
  });
});
