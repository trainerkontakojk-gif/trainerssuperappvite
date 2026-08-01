import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentTemuanTab from "../components/sidak/AgentTemuanTab";

describe("AgentTemuanTab parity tests", () => {
  const mockItems = [
    {
      id: "temuan-1",
      month: 5,
      year: 2026,
      indicatorName: "Indicator A",
      category: "critical",
      nilai: 0,
      ketidaksesuaian: "Fatal issue",
      sebaiknya: "Fix it",
      no_tiket: "T-100",
    },
    {
      id: "temuan-2",
      month: 5,
      year: 2026,
      indicatorName: "Indicator B",
      category: "non_critical",
      nilai: 3,
      ketidaksesuaian: "Minor issue",
      sebaiknya: "Be careful",
      no_tiket: null,
    },
    {
      id: "temuan-3",
      month: 4,
      year: 2026,
      indicatorName: "Indicator C",
      category: "non_critical",
      nilai: 2,
      ketidaksesuaian: "Medium issue",
      sebaiknya: "Improve",
      no_tiket: "T-200",
    },
  ];

  it("renders empty state correctly with legacy copy when items list is empty", () => {
    render(<AgentTemuanTab items={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("Tidak ada data audit")).toBeInTheDocument();
    expect(
      screen.getByText(/Belum ditemukan data temuan untuk konteks layanan/),
    ).toBeInTheDocument();
  });

  it("groups findings by month, collapses/expands correctly, and displays month label", () => {
    render(
      <AgentTemuanTab items={mockItems} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByText("MEI 2026")).toBeInTheDocument();
    expect(screen.getByText("APRIL 2026")).toBeInTheDocument();

    // Accordions are collapsed initially (isOpen is false by default in state)
    expect(screen.queryByText("No Tiket")).not.toBeInTheDocument();

    // Click on MEI 2026 accordion to expand it
    fireEvent.click(screen.getByText("MEI 2026"));

    // Now ticket info and details for MEI 2026 should be visible
    expect(screen.getByText("T-100")).toBeInTheDocument();
    expect(screen.getByText("AUDIT INTERNAL")).toBeInTheDocument();
  });

  it("renders exact numeric score with Poin label and category (redesign: badge label diganti kategori)", () => {
    render(
      <AgentTemuanTab items={mockItems} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // Expand MEI 2026
    fireEvent.click(screen.getByText("MEI 2026"));

    // Untuk nilai 0: score '0' + label 'Poin' + kategori critical
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getAllByText("Poin").length).toBeGreaterThan(0);
    expect(screen.getByText("critical")).toBeInTheDocument();

    // Untuk nilai 3: score '3' + kategori non_critical
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("non_critical")).toBeInTheDocument();
  });

  it("enforces edit permission visibility based on canEdit prop", () => {
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();

    // With canEdit = false (leader read-only)
    const { rerender } = render(
      <AgentTemuanTab
        items={mockItems}
        canEdit={false}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />,
    );

    fireEvent.click(screen.getByText("MEI 2026"));

    // Edit/delete buttons should not be present in the container
    // Let's verify by finding elements that contain the edit/delete icon button classes
    const editButtons = screen
      .queryAllByRole("button")
      .filter((btn) => btn.querySelector(".w-3\\.5.h-3\\.5"));
    // Since canEdit is false, there shouldn't be any Pencil/Trash icons inside finding rows
    expect(editButtons.length).toBe(0);

    // With canEdit = true (trainer/admin can edit)
    rerender(
      <AgentTemuanTab
        items={mockItems}
        canEdit={true}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />,
    );

    // Now edit/delete actions should exist
    const editButtonsWithIcons = screen
      .getAllByRole("button")
      .filter((btn) => btn.querySelector("svg"));
    expect(editButtonsWithIcons.length).toBeGreaterThan(0);
  });
});
