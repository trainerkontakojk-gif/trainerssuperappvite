import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => {
  const stripMotionProps = ({
    animate: _animate,
    exit: _exit,
    initial: _initial,
    layout: _layout,
    transition: _transition,
    ...props
  }: Record<string, unknown>) => props;

  return {
    motion: {
      div: ({ children, ...props }: any) => (
        <div {...stripMotionProps(props)}>{children}</div>
      ),
      span: ({ children, ...props }: any) => (
        <span {...stripMotionProps(props)}>{children}</span>
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useReducedMotion: () => false,
  };
});

import { KetikMotionFrame } from "../routes/ketik/components/KetikMotionFrame";

const consumerMessage =
  "Pagi kak Rojak, saya butuh bantuan terkait pinjaman online saya. Saya tiba-tiba ditagih padahal sudah lunas.";
const agentReply =
  "Baik, saya bantu cek dulu status pelunasannya. Mohon kirim nama pinjaman online yang dimaksud.";

describe("KetikMotionFrame", () => {
  it("keeps the chat preview contained while moving through a natural reply", () => {
    vi.useFakeTimers();
    const { container } = render(<KetikMotionFrame />);
    const hasOpeningMessage = () =>
      Array.from(container.querySelectorAll("p")).some((paragraph) =>
        paragraph.textContent?.includes(
          "Anda telah terhubung dengan Layanan Kontak OJK 157",
        ),
      );

    expect(hasOpeningMessage()).toBe(true);

    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByText(consumerMessage)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2300));
    expect(screen.queryByText(agentReply)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByText(agentReply)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText(agentReply)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(550));
    expect(hasOpeningMessage()).toBe(true);
  });
});
