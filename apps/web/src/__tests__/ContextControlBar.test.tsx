import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ContextControlBar from "../components/sidak/ContextControlBar";

function renderControls(activeTab: "summary" | "trend" | "temuan" | "simulations") {
  return render(
    <ContextControlBar
      activeTab={activeTab}
      selectedYear={2026}
      availableYears={[2025, 2026]}
      onYearChange={vi.fn()}
      selectedService="all"
      availableServices={["all", "call", "chat"]}
      onServiceChange={vi.fn()}
      trendStartMonth={1}
      trendEndMonth={12}
      onTrendRangeChange={vi.fn()}
      role="trainer"
      teams={[{ id: "team-1", name: "Folder dengan nama panjang" }]}
      selectedTeam="Folder dengan nama panjang"
      onTeamChange={vi.fn()}
      agentsInTeam={[{ id: "agent-1", nama: "Agen dengan nama panjang" }]}
      selectedAgentId="agent-1"
      onAgentChange={vi.fn()}
    />,
  );
}

describe("ContextControlBar", () => {
  it("keeps audit filters labelled and exposes the trend range only on Tren", () => {
    renderControls("summary");

    expect(screen.getByLabelText("Tahun audit")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Pilihan layanan audit" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Folder agen")).toBeInTheDocument();
    expect(screen.getByLabelText("Agen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bulan awal tren")).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Pilihan layanan audit" }),
    ).toHaveTextContent("Semua");
  });

  it("shows trend month controls without leaving audit filters behind", async () => {
    const user = userEvent.setup();
    const onTrendRangeChange = vi.fn();
    render(
      <ContextControlBar
        activeTab="trend"
        selectedYear={2026}
        availableYears={[2026]}
        onYearChange={vi.fn()}
        selectedService="call"
        availableServices={["call"]}
        onServiceChange={vi.fn()}
        trendStartMonth={2}
        trendEndMonth={8}
        onTrendRangeChange={onTrendRangeChange}
        role="trainer"
        teams={[]}
        selectedTeam=""
        onTeamChange={vi.fn()}
        agentsInTeam={[]}
        selectedAgentId="agent-1"
        onAgentChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Bulan awal tren")).toBeInTheDocument();
    expect(screen.getByLabelText("Bulan akhir tren")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Bulan awal tren" }));
    await user.click(await screen.findByRole("option", { name: "Maret" }));
    expect(onTrendRangeChange).toHaveBeenCalledWith(3, 8);
  });

  it("uses the simulation context without rendering audit controls", () => {
    renderControls("simulations");

    expect(screen.queryByLabelText("Tahun audit")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Pilihan layanan audit" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Bulan awal tren")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Folder agen")).toBeInTheDocument();
  });
});
