import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProfilerFolder, ProfilerYear } from "@trainers/types";

import HierarchyPanel from "../routes/profiler/components/workspace/HierarchyPanel";

const years: ProfilerYear[] = [
  {
    id: "year-2026",
    year: 2026,
    label: "Tahun 2026",
  },
];

const folders: ProfilerFolder[] = [
  {
    id: "team-operasional",
    name: "Tim Operasional dan Layanan",
    year_id: "year-2026",
    parent_id: null,
  },
  {
    id: "batch-pagi",
    name: "Batch Pagi Gelombang Satu",
    year_id: "year-2026",
    parent_id: "team-operasional",
  },
];

describe("HierarchyPanel profiler", () => {
  it("keeps team and batch names visible when row actions are present", async () => {
    const user = userEvent.setup();

    render(
      <HierarchyPanel
        years={years}
        folders={folders}
        selectedYearId="year-2026"
        selectedFolderId={null}
        onSelectYear={vi.fn()}
        onSelectFolder={vi.fn()}
        onAddYear={vi.fn()}
        onAddFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        onDuplicateFolder={vi.fn()}
        counts={{}}
        role="trainer"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Tim Operasional dan Layanan")).toBeVisible();
    });

    await user.click(
      screen.getByRole("button", {
        name: "Tim Operasional dan Layanan",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Batch Pagi Gelombang Satu")).toBeVisible();
    });

    expect(
      screen.getByRole("button", {
        name: "Aksi Tim Operasional dan Layanan",
      }),
    ).toBeVisible();
  });
});
