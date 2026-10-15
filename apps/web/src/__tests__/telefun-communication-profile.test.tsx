import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
      value: 80,
      benchmarkValue: 80,
      score: 8,
      displayScore: 80,
      targetScore: 80,
      targetDirection: "lower_raw_is_better",
      rawValue: 2,
      rawUnit: "filler_words",
      evaluationMode: "higher_better",
      goodMin: 80,
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
