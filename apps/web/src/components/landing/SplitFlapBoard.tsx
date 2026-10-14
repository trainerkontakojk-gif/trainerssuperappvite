import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./reducedMotion";
import "./SplitFlapBoard.css";

/** One intermediate board state shown before the board lands on its text. */
export type FlapFrame = {
  name: string;
  lines: readonly string[];
  inks: readonly string[];
};

const FLAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const PARTS = ["top", "bottom", "leaf-top", "leaf-bottom"] as const;
const FLIP_MS = 140;
const COLUMN_STAGGER_MS = 32;
const FRAME_HOLD_MS = 520;

type Part = (typeof PARTS)[number];
type Cell = {
  flap: HTMLElement;
  parts: Record<Part, HTMLElement>;
  row: number;
  col: number;
};
type ShowOptions = { scramble?: number; stagger?: number };

const randomChar = () =>
  FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];

const centerIn = (text: string, cols: number) =>
  " ".repeat(Math.max(0, Math.floor((cols - text.length) / 2))) + text;

type BoardOptions = {
  lines: readonly string[];
  cols: number;
  ink: string;
  intro?: readonly FlapFrame[];
  finalFrame: string;
  delay: number;
  interactive: boolean;
};

/**
 * Drives one rendered board imperatively. Characters live in `data-ch` (drawn
 * by CSS `::before`), so flips never re-render React. Returns a disposer that
 * cancels timers and animations; StrictMode's double effect resets cleanly.
 */
function runBoard(element: HTMLElement, options: BoardOptions): () => void {
  const { lines, cols, ink, intro, finalFrame, delay, interactive } = options;
  const cells: Cell[] = [...element.querySelectorAll<HTMLElement>(".flap")].map(
    (flap, index) => ({
      flap,
      parts: Object.fromEntries(
        PARTS.map((part) => [
          part,
          flap.querySelector<HTMLElement>(`.${part}`)!,
        ]),
      ) as Record<Part, HTMLElement>,
      row: Math.floor(index / cols),
      col: index % cols,
    }),
  );
  let disposed = false;
  const timers = new Set<number>();
  const animations = new Set<Animation>();
  const cleanups: Array<() => void> = [];

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        resolve();
      }, ms);
      timers.add(id);
    });
  const setState = (state: string) => {
    element.dataset.state = state;
  };
  const targetOf = (frameLines: readonly string[], cell: Cell) =>
    (frameLines[cell.row] ?? "").padEnd(cols, " ")[cell.col];

  function paint(cell: Cell, ch: string, color: string) {
    cell.flap.dataset.ch = ch;
    for (const part of Object.values(cell.parts)) {
      part.dataset.ch = ch;
      part.style.color = color;
    }
  }

  async function flip(cell: Cell, next: string, color: string) {
    const { flap, parts } = cell;
    parts.top.dataset.ch = next;
    parts.top.style.color = color;
    parts["leaf-top"].dataset.ch = flap.dataset.ch ?? " ";
    parts["leaf-top"].style.color = parts.bottom.style.color;
    parts["leaf-bottom"].dataset.ch = next;
    parts["leaf-bottom"].style.color = color;
    flap.classList.add("flipping");
    const half = FLIP_MS / 2;
    const fallAnimation = parts["leaf-top"].animate(
      [{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }],
      { duration: half, easing: "ease-in", fill: "both" },
    );
    const dropAnimation = parts["leaf-bottom"].animate(
      [{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }],
      { duration: half, delay: half, easing: "ease-out", fill: "both" },
    );
    animations.add(fallAnimation);
    animations.add(dropAnimation);
    try {
      await dropAnimation.finished;
    } catch {
      return; // Cancelled by dispose.
    } finally {
      animations.delete(fallAnimation);
      animations.delete(dropAnimation);
    }
    paint(cell, next, color);
    flap.classList.remove("flipping");
    fallAnimation.cancel();
    dropAnimation.cancel();
  }

  // Each tile flips to its target, optionally through a few random characters
  // first; columns start a beat apart like a real departure board.
  function showFrame(
    frameLines: readonly string[],
    inks: readonly string[],
    { scramble = 0, stagger = COLUMN_STAGGER_MS }: ShowOptions = {},
  ) {
    return Promise.all(
      cells.map(async (cell) => {
        const target = targetOf(frameLines, cell);
        const color = inks[cell.row] ?? inks[0];
        const extra = scramble ? scramble + Math.floor(Math.random() * 3) : 0;
        const path = [...Array.from({ length: extra }, randomChar), target];
        await sleep((cell.col + cell.row * 2) * stagger);
        for (const ch of path) {
          if (disposed) return;
          if (ch !== cell.flap.dataset.ch) await flip(cell, ch, color);
        }
        if (!disposed) paint(cell, target, color);
      }),
    );
  }

  async function land(scramble: number, stagger?: number) {
    await showFrame(lines, [ink], { scramble, stagger });
    if (!disposed) setState("idle");
  }

  async function playIntro(frames: readonly FlapFrame[]) {
    setState("intro");
    await sleep(300);
    for (const frame of frames) {
      if (disposed) return;
      element.dataset.frame = frame.name;
      await showFrame(
        frame.lines.map((line) => centerIn(line, cols)),
        frame.inks,
      );
      await sleep(FRAME_HOLD_MS);
    }
    if (disposed) return;
    element.dataset.frame = finalFrame;
    await land(2);
  }

  // Reset first: a StrictMode re-run may find a half-flipped board.
  delete element.dataset.frame;
  for (const cell of cells) {
    paint(cell, " ", ink);
    cell.flap.classList.remove("flipping");
  }

  if (prefersReducedMotion()) {
    element.dataset.frame = finalFrame;
    for (const cell of cells) paint(cell, targetOf(lines, cell), ink);
    setState("idle");
  } else if (intro) {
    void playIntro(intro);
  } else {
    setState("waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setState("intro");
        element.dataset.frame = finalFrame;
        void sleep(delay).then(() => land(2));
      },
      { threshold: 0.25 },
    );
    observer.observe(element);
    cleanups.push(() => observer.disconnect());
  }

  if (interactive) {
    const reshuffle = () => {
      if (prefersReducedMotion() || element.dataset.state !== "idle") return;
      setState("shuffling");
      void land(2, 22);
    };
    element.addEventListener("pointerenter", reshuffle);
    element.addEventListener("click", reshuffle);
    cleanups.push(() => {
      element.removeEventListener("pointerenter", reshuffle);
      element.removeEventListener("click", reshuffle);
    });
  }

  return () => {
    disposed = true;
    for (const id of timers) window.clearTimeout(id);
    for (const animation of animations) animation.cancel();
    for (const cleanup of cleanups) cleanup();
  };
}

type SplitFlapBoardProps = {
  /** Resting text, one entry per row. */
  lines: readonly string[];
  cols: number;
  /** CSS colour for the resting text, e.g. `var(--fg)`. */
  ink: string;
  /** Frames played on mount; without them the board lands once visible. */
  intro?: readonly FlapFrame[];
  /** `data-frame` value once the board shows its resting text. */
  finalFrame?: string;
  /** Extra delay (ms) before a land-on-view board starts flipping. */
  delay?: number;
  /** Reshuffle on hover or tap. */
  interactive?: boolean;
};

/**
 * Decorative split-flap board. It is `aria-hidden`; callers provide the
 * readable text (e.g. an `sr-only` span) next to it.
 */
export function SplitFlapBoard({
  lines,
  cols,
  ink,
  intro,
  finalFrame = "final",
  delay = 0,
  interactive = false,
}: SplitFlapBoardProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const linesKey = lines.join("|");

  useEffect(() => {
    if (!ref.current) return;
    return runBoard(ref.current, {
      lines: linesKey.split("|"),
      cols,
      ink,
      intro,
      finalFrame,
      delay,
      interactive,
    });
  }, [linesKey, cols, ink, intro, finalFrame, delay, interactive]);

  return (
    <span ref={ref} className="flapboard" aria-hidden="true">
      {lines.map((_, row) => (
        <span key={row} className="flap-row">
          {Array.from({ length: cols }, (_, col) => (
            <span key={col} className="flap" data-ch=" ">
              {PARTS.map((part) => (
                <span key={part} className={part} data-ch=" " />
              ))}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
