import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfilerParticipantGrid } from "../routes/profiler/components/table/ProfilerParticipantGrid";

describe("ProfilerParticipantGrid", () => {
  it("renders a responsive grid of participant cards", () => {
    const participants = [
      {
        id: "p1",
        nama: "Budi",
        tim: "Tim BKO",
        jabatan: "agent",
      },
      {
        id: "p2",
        nama: "Sari",
        tim: "Tim BKO",
        jabatan: "team_lead",
      },
    ] as any[];

    const { container } = render(
      <ProfilerParticipantGrid
        displayList={participants}
        sortMode={false}
        selectMode={false}
        selectedIds={new Set()}
        toggleSelect={vi.fn()}
        density="comfortable"
        isReadOnly={false}
        hasActiveFilters={false}
        resetFilters={vi.fn()}
        setSelectedPeserta={vi.fn()}
        onViewAnalysis={vi.fn()}
        onAddPeserta={vi.fn()}
        dragIndex={null}
        dragOverIndex={null}
        handleDragStart={vi.fn()}
        handleDragOver={vi.fn()}
        handleDragLeave={vi.fn()}
        handleDragEnd={vi.fn()}
      />,
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-3");
    expect(grid.className).toContain("xl:grid-cols-4");
    expect(screen.getAllByText("Budi")).toHaveLength(1);
    expect(screen.getAllByText("Sari")).toHaveLength(1);
    expect(screen.getAllByTitle("Edit Data")).toHaveLength(2);
    expect(screen.getAllByTitle("Lihat Analisis QA")).toHaveLength(2);
  });
});
