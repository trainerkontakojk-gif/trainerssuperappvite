import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import WorkspaceNavigator from "../routes/profiler/components/workspace/WorkspaceNavigator";
import type { ProfilerFolder, ProfilerYear } from "@trainers/types";

const years: ProfilerYear[] = [
  {
    id: "year-2026",
    year: 2026,
    label: "2026",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

const folders: ProfilerFolder[] = [
  {
    id: "team-call",
    name: "Tim Call",
    year_id: "year-2026",
    parent_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "team-whatsapp",
    name: "Tim Whatsapp",
    year_id: "year-2026",
    parent_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "batch-anis",
    name: "Siti Nur Anisa",
    year_id: "year-2026",
    parent_id: "team-call",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "batch-fahmi",
    name: "Muhammad Fahmi Nasrulloh",
    year_id: "year-2026",
    parent_id: "team-call",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "batch-dwiana",
    name: "Dwiana Amelia",
    year_id: "year-2026",
    parent_id: "team-whatsapp",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

function WorkspaceNavigatorHarness() {
  const [selectedYearId, setSelectedYearId] = useState<string | null>("year-2026");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  return (
    <WorkspaceNavigator
      years={years}
      folders={folders}
      selectedYearId={selectedYearId}
      onSelectYear={setSelectedYearId}
      selectedTeamId={selectedTeamId}
      onSelectTeam={setSelectedTeamId}
      onSelectBatch={vi.fn()}
      isReadOnly={false}
      onAddFolder={vi.fn()}
      counts={{}}
    />
  );
}

describe("WorkspaceNavigator profiler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows compact batch metadata without helper copy", () => {
    render(<WorkspaceNavigatorHarness />);

    expect(
      screen.getAllByText("2 batch"),
    ).toHaveLength(1);
    expect(screen.queryByText("Punya subfolder batch — klik untuk buka daftar di bawah.")).not.toBeInTheDocument();
    expect(screen.queryByText("Subfolder")).not.toBeInTheDocument();
  });

  it("auto-scrolls to the batch section and marks the active team as expanded", async () => {
    const user = userEvent.setup();
    const scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});

    render(<WorkspaceNavigatorHarness />);

    const teamCallButton = screen.getByRole("button", { name: /Tim Call/i });
    expect(teamCallButton).toHaveAttribute("aria-expanded", "false");

    await user.click(teamCallButton);

    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    });

    const batchSection = document.getElementById("profiler-batch-section");

    expect(teamCallButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getAllByText("2 batch"),
    ).toHaveLength(2);
    expect(batchSection).toHaveAttribute("data-focus-state", "highlighted");
    expect(screen.getByText("Siti Nur Anisa")).toBeInTheDocument();
    expect(screen.getByText("Muhammad Fahmi Nasrulloh")).toBeInTheDocument();
  });

  it("scrolls back to the batch section when the active team is clicked again", async () => {
    const user = userEvent.setup();
    const scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});

    render(<WorkspaceNavigatorHarness />);

    const teamCallButton = screen.getByRole("button", { name: /Tim Call/i });

    await user.click(teamCallButton);
    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledTimes(1);
    });

    await user.click(teamCallButton);
    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledTimes(2);
    });

    expect(screen.getAllByText("2 batch")).toHaveLength(2);
    expect(
      document.getElementById("profiler-batch-section"),
    ).toHaveAttribute("data-focus-state", "highlighted");
  });
});
