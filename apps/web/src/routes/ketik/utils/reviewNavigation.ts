export interface KetikReviewTarget {
  section: "questions" | "notes" | "scores";
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
      const navigation = target
        .closest("#ketik-review-result")
        ?.querySelector<HTMLElement>('nav[aria-label="Lompat ke bagian"]');
      const inset = navigation
        ? navigation.getBoundingClientRect().height +
          parseFloat(getComputedStyle(pane).paddingTop) +
          12
        : 0;
      // Tall sections must start below the sticky nav, not above the viewport.
      const offset = Math.max(inset, (pane.clientHeight - rect.height) / 2);
      pane.scrollBy({
        top: rect.top - box.top - offset,
        behavior,
      });
    }
    if (pane === root) break;
  }
  target.focus({ preventScroll: true });
}
