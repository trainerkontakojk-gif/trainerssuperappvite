import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SidakReportsAi from "../routes/sidak/reports-ai";

// Mock @tanstack/react-router
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

// Mock useApi and hooks
vi.mock("../../hooks/useApi", () => ({
  useApi: (url: string) => {
    if (url === "/sidak/periods") {
      return { data: [{ year: 2026 }, { year: 2025 }] };
    }
    if (url === "/sidak/agents") {
      return { data: [{ id: "agent-1", nama: "Agent One" }] };
    }
    return { data: null };
  },
  postApi: vi.fn(),
}));

describe("SidakReportsAi Component", () => {
  it("renders model selection with text models and excludes image-only models", () => {
    render(<SidakReportsAi />);

    // Expect "Gemini 3.5 Flash" option to be in the document
    expect(screen.getByRole("option", { name: "Gemini 3.5 Flash" })).toBeDefined();
    
    // Expect "Gemini 3.1 Flash Lite" to be present
    expect(screen.getByRole("option", { name: "Gemini 3.1 Flash Lite" })).toBeDefined();

    // Expect "Gemini 3.1 Flash Image" (image-only) to NOT be present
    expect(screen.queryByRole("option", { name: /Flash Image/i })).toBeNull();
  });
});
