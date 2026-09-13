import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelefunMotionFrame } from "../routes/telefun/components/TelefunMotionFrame";

describe("TelefunMotionFrame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays the 157 dial sequence before showing the conversation", async () => {
    render(<TelefunMotionFrame />);

    const frame = screen.getByTestId("telefun-motion-frame");
    expect(frame).toHaveAttribute("data-demo-step", "dial-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(frame).toHaveAttribute("data-demo-step", "dial-5");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(frame).toHaveAttribute("data-demo-step", "dial-7");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(frame).toHaveAttribute("data-demo-step", "dial");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(frame).toHaveAttribute("data-demo-step", "conversation");
    expect(screen.getByTestId("telefun-motion-phone")).toBeInTheDocument();
  });

  it("restores the dark in-call screen controls after dialing", async () => {
    render(<TelefunMotionFrame />);

    for (const stepDuration of [700, 700, 700, 1_100]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(stepDuration);
      });
    }

    expect(screen.getByTestId("telefun-motion-phone")).toHaveAttribute(
      "data-call-state",
      "connected",
    );
    for (const controlLabel of [
      "bisukan",
      "papan tombol",
      "speaker",
      "tambah",
      "FaceTime",
      "kontak",
      "akhiri",
    ]) {
      expect(screen.getByText(controlLabel)).toBeInTheDocument();
    }
  });
});
