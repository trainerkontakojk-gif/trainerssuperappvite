import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastActionButton } from "../components/sidak/ForecastActionButton";

describe("ForecastActionButton", () => {
  it("renders the stale call to action with a subtle accessible pulse", () => {
    render(
      <ForecastActionButton
        status="stale"
        loading={false}
        disabled={false}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Data baru — Perbarui Prediksi",
    });
    expect(button).toHaveClass("animate-pulse");
    expect(button).toHaveClass("motion-reduce:animate-none");
    expect(button.className).not.toMatch(/scale-/);
  });

  it("renders loading state correctly", () => {
    render(
      <ForecastActionButton
        status="stale"
        loading={true}
        disabled={false}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Sedang memproses...",
    });
    expect(button).toBeDisabled();
    expect(button).not.toHaveClass("animate-pulse");
  });

  it("renders disabled state correctly", () => {
    render(
      <ForecastActionButton
        status="fresh"
        loading={false}
        disabled={true}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("renders fresh status correctly", () => {
    render(
      <ForecastActionButton
        status="fresh"
        loading={false}
        disabled={false}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Perbarui Prediksi",
    });
    expect(button).not.toHaveClass("animate-pulse");
    expect(button).toHaveClass("bg-primary/10");
  });

  it("renders missing status correctly", () => {
    render(
      <ForecastActionButton
        status="missing"
        loading={false}
        disabled={false}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Update Prediksi",
    });
    expect(button).not.toHaveClass("animate-pulse");
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ForecastActionButton
        status="fresh"
        loading={false}
        disabled={false}
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button");
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
