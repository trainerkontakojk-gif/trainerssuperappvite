import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgentTemuanTab from "../components/sidak/AgentTemuanTab";

describe("AgentTemuanTab", () => {
  it("renders phantom data as a no-finding session", () => {
    render(
      <AgentTemuanTab
        items={[]}
        phantomSessions={[
          {
            id: "phantom-session-1",
            month: 8,
            year: 2026,
            no_tiket: "__PHANTOM__batch-1",
            parameterCount: 7,
            score: 100,
          },
        ]}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("Agustus 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Agustus 2026/ }));
    expect(screen.getByText("Sesi tanpa temuan")).toBeInTheDocument();
    expect(screen.getByText(/Skor audit 100/)).toBeInTheDocument();
  });
});
