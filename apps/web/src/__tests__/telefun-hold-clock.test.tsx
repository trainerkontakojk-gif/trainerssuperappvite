import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { HoldStatusDisplay } from "../routes/telefun/components/HoldStatusDisplay";
import { TELEFUN_FIRST_HOLD_LIMIT_MS } from "@trainers/types";

describe("HoldStatusDisplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing when inactive", () => {
    const { container } = render(
      <HoldStatusDisplay
        active={false}
        sequence={0}
        startedAtEpochMs={0}
        limitMs={TELEFUN_FIRST_HOLD_LIMIT_MS}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows 01:00 for the first hold", () => {
    const now = Date.now();
    render(
      <HoldStatusDisplay
        active={true}
        sequence={1}
        startedAtEpochMs={now}
        limitMs={TELEFUN_FIRST_HOLD_LIMIT_MS}
      />,
    );
    expect(screen.getByText("01:00")).toBeDefined();
  });

  it("shows warning text in last ten seconds", () => {
    const now = Date.now();
    render(
      <HoldStatusDisplay
        active={true}
        sequence={1}
        startedAtEpochMs={now - 50_000}
        limitMs={TELEFUN_FIRST_HOLD_LIMIT_MS}
      />,
    );
    expect(screen.getByText("00:10")).toBeDefined();
    expect(screen.getByText("Segera kembali ke konsumen")).toBeDefined();
  });

  it("switches to +00:01 after the first limit", () => {
    const now = Date.now();
    render(
      <HoldStatusDisplay
        active={true}
        sequence={1}
        startedAtEpochMs={now - 61_000}
        limitMs={TELEFUN_FIRST_HOLD_LIMIT_MS}
      />,
    );
    expect(screen.getByText("+00:01")).toBeDefined();
    expect(screen.getByText("Kembali ke konsumen sekarang")).toBeDefined();
  });

  it("shows HOLD MELEWATI BATAS when overtime", () => {
    const now = Date.now();
    render(
      <HoldStatusDisplay
        active={true}
        sequence={1}
        startedAtEpochMs={now - 65_000}
        limitMs={TELEFUN_FIRST_HOLD_LIMIT_MS}
      />,
    );
    expect(screen.getByText("HOLD MELEWATI BATAS")).toBeDefined();
  });

  it("continues increasing overtime until hold is released", () => {
    const startedAt = new Date("2026-06-05T00:00:00.000Z");
    vi.setSystemTime(startedAt);

    render(
      <HoldStatusDisplay
        active={true}
        sequence={1}
        startedAtEpochMs={startedAt.getTime()}
        limitMs={TELEFUN_FIRST_HOLD_LIMIT_MS}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText("+00:01")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(screen.getByText("+00:15")).toBeDefined();
  });
});
