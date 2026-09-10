import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PdktSessionHistory } from "@trainers/types";

const mockHistoryGet = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  pdktClient: { history: { $get: mockHistoryGet } },
  unwrapResponse: async (response: unknown) => response,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import PdktHistory from "../routes/pdkt/history";

const historyEntry: PdktSessionHistory = {
  id: "history-1",
  timestamp: "2026-09-09T00:00:00Z",
  user_id: "trainer-1",
  user_email: "trainer@example.com",
  user_role: "trainer",
  config: {
    scenarios: [
      {
        id: "scenario-1",
        category: "Pinjol",
        title: "Pinjol ilegal",
        description: "Keluhan pinjol",
        isActive: true,
      },
    ],
    consumerType: {
      id: "marah",
      name: "Marah",
      description: "Emosional",
    },
    identity: {
      name: "Budi",
      email: "budi@example.com",
      city: "Jakarta",
      bodyName: "Budi",
    },
    enableImageGeneration: true,
    selectedModel: "gemini-2.5-flash",
    resolvedConsumerNameMentionPattern: "none",
    writingStyleMode: "training",
  },
  emails: [
    {
      id: "email-1",
      from: "budi@example.com",
      to: "ojk@example.com",
      subject: "Pengaduan pinjol",
      body: "Isi email",
      timestamp: "2026-09-09T00:00:00Z",
      isAgent: false,
    },
  ],
  evaluation: null,
  evaluationStatus: "processing",
  timeTaken: 30,
  simulationSubject: {
    type: "participant",
    participantId: "123e4567-e89b-12d3-a456-426614174000",
    displayName: "Andi",
    batchName: "Batch 12",
    team: "Tim Alpha",
  },
};

describe("PDKT history projections", () => {
  beforeEach(() => {
    mockHistoryGet.mockReset();
    mockHistoryGet.mockResolvedValue([historyEntry]);
  });

  it("renders subject, batch/team, actor, status, and export affordance", async () => {
    render(<PdktHistory />);

    expect(await screen.findByText("Pengaduan pinjol")).toBeTruthy();
    expect(screen.getByText("Andi")).toBeTruthy();
    expect(screen.getByText("Batch 12")).toBeTruthy();
    expect(screen.getByText("Tim Alpha")).toBeTruthy();
    expect(screen.getByText("trainer@example.com")).toBeTruthy();
    expect(screen.getByText("trainer")).toBeTruthy();
    expect(screen.getByText("Memproses")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
  });

  it("maps database column names before rendering the dedicated history page", async () => {
    mockHistoryGet.mockResolvedValueOnce([
      {
        ...historyEntry,
        evaluationStatus: undefined,
        evaluationError: undefined,
        timeTaken: undefined,
        simulationSubject: undefined,
        evaluation_status: "processing",
        evaluation_error: null,
        time_taken: 30,
        simulation_subject_type: "participant",
        simulation_subject_peserta_id:
          historyEntry.simulationSubject?.participantId,
        simulation_subject_name: "Andi",
        simulation_subject_batch_name: "Batch 12",
        simulation_subject_team: "Tim Alpha",
      },
    ]);

    render(<PdktHistory />);

    expect(await screen.findByText("Pengaduan pinjol")).toBeTruthy();
    expect(screen.getByText("Memproses")).toBeTruthy();
    expect(screen.getByText("Andi")).toBeTruthy();
  });
});
