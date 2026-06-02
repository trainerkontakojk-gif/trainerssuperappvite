import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TemuanGroupGrid from "../components/sidak/TemuanGroupGrid";

describe("TemuanGroupGrid", () => {
  it("renders temuan groups in a responsive grid", () => {
    render(
      <TemuanGroupGrid
        groups={[
          {
            key: "T-1",
            label: "T-1",
            items: [{ id: "1", indicator_id: "i1", nilai: 1, ketidaksesuaian: "Salah", sebaiknya: "Benar" }],
          },
        ]}
        indicatorLabelMap={new Map([["i1", "Greeting"]])}
        categoryMap={new Map([["i1", "critical"]])}
        editingId={null}
        editNilai={1}
        editKetidaksesuaian=""
        editSebaiknya=""
        deletingId={null}
        canEdit={true}
        onStartEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onSaveEdit={vi.fn()}
        onDelete={vi.fn()}
        setEditNilai={vi.fn()}
        setEditKetidaksesuaian={vi.fn()}
        setEditSebaiknya={vi.fn()}
      />,
    );

    const grid = screen.getByTestId("temuan-group-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-2");
    expect(grid.className).toContain("2xl:grid-cols-3");
    expect(screen.getByText("Greeting")).toBeInTheDocument();
  });
});
