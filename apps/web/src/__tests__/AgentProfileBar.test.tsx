import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SidakAgentQuickviewResponse } from "@trainers/types";
import AgentProfileBar from "../components/sidak/AgentProfileBar";

const quickviewFixture: SidakAgentQuickviewResponse = {
  context: {
    agentId: "agent-1",
    year: 2026,
    serviceType: "call",
    periodMode: "ytd",
  },
  combinedTeam: {
    rank: 8,
    total: 64,
    scopeId: "folder-parent",
    scopeLabel: "Tim Call",
    basis: "least_findings_ytd",
  },
  leaderTeam: {
    rank: 2,
    total: 12,
    scopeId: "folder-child",
    scopeLabel: "Leader Dimas",
    basis: "least_findings_ytd",
  },
  forecast: {
    status: "improving",
    label: "Membaik",
    supportingText: "Temuan diproyeksikan turun",
    findingsSlope: -1.25,
    sourcePointCount: 5,
    confidence: "high",
    horizonMonths: 3,
  },
};

describe("AgentProfileBar export dropdown", () => {
  it("offers separate interactive and static HTML downloads", () => {
    const onExport = vi.fn();
    render(
      <AgentProfileBar
        nama="Mas Bayu Mardiaz"
        tim="Siti Nur Anisa"
        batchName="cca"
        jabatan="Telepon"
        bergabungDate={null}
        fotoUrl={null}
        role="leader"
        onExport={onExport}
        onInputAudit={vi.fn()}
        quickviewData={quickviewFixture}
        quickviewLoading={false}
        quickviewError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /unduh laporan/i }));

    const interactiveOption = screen.getByRole("menuitem", {
      name: /html interaktif/i,
    });
    expect(interactiveOption).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: /html statis/i }),
    ).toBeVisible();

    fireEvent.click(interactiveOption);
    expect(onExport).toHaveBeenLastCalledWith("html-interactive");
  });

  it("keeps the open menu outside the profile card clipping context", () => {
    render(
      <AgentProfileBar
        nama="Mas Bayu Mardiaz"
        tim="Siti Nur Anisa"
        batchName="cca"
        jabatan="Telepon"
        bergabungDate={null}
        fotoUrl={null}
        role="leader"
        onExport={vi.fn()}
        onInputAudit={vi.fn()}
        quickviewData={quickviewFixture}
        quickviewLoading={false}
        quickviewError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /unduh laporan/i }));

    const menu = screen.getByRole("menu");
    expect(menu).toBeVisible();
    expect(menu.closest(".overflow-hidden")).toBeNull();
    expect(menu.closest(".overflow-visible")).toHaveClass("z-50");
  });

  it("renders the quickview rail inside the profile surface", () => {
    render(
      <AgentProfileBar
        nama="Mas Bayu Mardiaz"
        tim="Siti Nur Anisa"
        batchName="cca"
        jabatan="Telepon"
        bergabungDate={null}
        fotoUrl={null}
        role="leader"
        onExport={vi.fn()}
        onInputAudit={vi.fn()}
        quickviewData={quickviewFixture}
        quickviewLoading={false}
        quickviewError={null}
      />,
    );

    const rail = screen.getByRole("region", {
      name: "Quickview performa agent",
    });
    expect(rail.closest(".rounded-2xl")).toBe(
      screen.getByText("Mas Bayu Mardiaz").closest(".rounded-2xl"),
    );
  });
});
