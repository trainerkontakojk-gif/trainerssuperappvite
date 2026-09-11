import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import SidakAgentDetailTabs from "../components/sidak/SidakAgentDetailTabs";
import type { SidakAgentDetailTab } from "../components/sidak/sidak-agent-detail-tabs.constants";

const panels: Record<SidakAgentDetailTab, ReactNode> = {
  summary: <p>Ringkasan panel</p>,
  trend: <p>Tren panel</p>,
  temuan: <p>Temuan panel</p>,
  simulations: <p>Simulasi panel</p>,
};

describe("SidakAgentDetailTabs", () => {
  it("starts on Ringkasan and mounts a panel only after it is opened", () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <SidakAgentDetailTabs
        activeTab="summary"
        mountedTabs={new Set(["summary"])}
        onTabChange={onTabChange}
        panels={panels}
      />,
    );

    expect(screen.getByRole("tab", { name: "Ringkasan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: "Ringkasan" })).toBeVisible();
    expect(screen.queryByRole("tabpanel", { name: "Tren" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Tren" }));
    expect(onTabChange).toHaveBeenCalledWith("trend");

    rerender(
      <SidakAgentDetailTabs
        activeTab="trend"
        mountedTabs={new Set(["summary", "trend"])}
        onTabChange={onTabChange}
        panels={panels}
      />,
    );

    expect(document.getElementById("sidak-agent-panel-summary")).not.toBeVisible();
    expect(screen.getByRole("tabpanel", { name: "Tren" })).toBeVisible();
  });

  it("supports arrow, Home, and End keyboard navigation", () => {
    const onTabChange = vi.fn();
    render(
      <SidakAgentDetailTabs
        activeTab="summary"
        mountedTabs={new Set(["summary"])}
        onTabChange={onTabChange}
        panels={panels}
      />,
    );

    const summaryTab = screen.getByRole("tab", { name: "Ringkasan" });
    fireEvent.keyDown(summaryTab, { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenCalledWith("trend");

    fireEvent.keyDown(summaryTab, { key: "End" });
    expect(onTabChange).toHaveBeenCalledWith("simulations");

    fireEvent.keyDown(summaryTab, { key: "Home" });
    expect(onTabChange).toHaveBeenCalledWith("summary");
  });
});
