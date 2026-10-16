export interface KetikReviewTarget {
  tab: "questions" | "notes" | "scores";
  key: string | number;
}

/** Scroll only the review's panes, never the application frame. */
export function focusReviewTarget(target: HTMLElement): void {
  const root = target.closest<HTMLElement>("[data-review-scroll]");
  if (!root) return;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  for (let pane = target.parentElement; pane; pane = pane.parentElement) {
    if (
      pane.scrollHeight > pane.clientHeight &&
      /auto|scroll/.test(getComputedStyle(pane).overflowY)
    ) {
      const rect = target.getBoundingClientRect();
      const box = pane.getBoundingClientRect();
      pane.scrollBy({
        top: rect.top - box.top - (pane.clientHeight - rect.height) / 2,
        behavior,
      });
    }
    if (pane === root) break;
  }
  target.focus({ preventScroll: true });
}
