import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../components/LeaderAccessGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../store/authStore", () => ({
  useAuthStore: () => ({
    profile: { role: "admin" },
  }),
}));

import SidakLanding from "../routes/sidak";

describe("SidakLanding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Forecast module card on SIDAK landing", () => {
    render(<SidakLanding />);

    const forecastLink = screen.getByRole("link", { name: /forecast/i });
    expect(forecastLink).toHaveAttribute("href", "/sidak/forecast");
    expect(screen.getByText("Forecast")).toBeInTheDocument();
    expect(
      screen.getByText(/proyeksi tren temuan dan sinyal agent/i),
    ).toBeInTheDocument();
  });
});
