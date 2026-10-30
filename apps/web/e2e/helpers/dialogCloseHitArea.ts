import type { Locator, Page } from "@playwright/test";

/**
 * Measure the shared dialog close button's enlarged ::after hit area after
 * entrance animations settle, and list the dialog's other controls inside it.
 */
export async function measureDialogCloseHitArea(page: Page, dialog: Locator) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return timing && Number.isFinite(timing.endTime);
        })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  return dialog.evaluate((root) => {
    const close = root.querySelector<HTMLElement>('[data-slot="dialog-close"]');
    if (!close) throw new Error("dialog has no shared close button");
    const box = close.getBoundingClientRect();
    const style = getComputedStyle(close);
    const after = getComputedStyle(close, "::after");
    // ::after offsets resolve against the button's padding box; without an
    // absolutely positioned ::after the hit area is the button itself.
    const enlarged = after.position === "absolute";
    const offset = (value: string, border: string) =>
      enlarged ? parseFloat(value) + parseFloat(border) : 0;
    const hit = {
      left: box.left + offset(after.left, style.borderLeftWidth),
      right: box.right - offset(after.right, style.borderRightWidth),
      top: box.top + offset(after.top, style.borderTopWidth),
      bottom: box.bottom - offset(after.bottom, style.borderBottomWidth),
    };
    const selector =
      'button,a[href],input,select,textarea,[role="button"],[role="combobox"],[role="radio"],[role="checkbox"]';
    const overlaps: string[] = [];
    for (const control of root.querySelectorAll<HTMLElement>(selector)) {
      if (close.contains(control) || !control.getClientRects().length) continue;
      const rect = control.getBoundingClientRect();
      if (
        rect.left < hit.right &&
        rect.right > hit.left &&
        rect.top < hit.bottom &&
        rect.bottom > hit.top
      )
        overlaps.push(
          control.getAttribute("aria-label") ||
            control.textContent?.trim().slice(0, 60) ||
            control.id ||
            control.tagName,
        );
    }
    // A point in the enlarged band, outside the visible icon.
    const band = { x: hit.left + 2, y: hit.bottom - 2 };
    const probe = document.elementFromPoint(band.x, band.y);
    return {
      // The repo's min-h-11 touch target, in px at the current root size.
      touchTarget:
        2.75 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      width: hit.right - hit.left,
      height: hit.bottom - hit.top,
      band,
      bandHitsClose: Boolean(probe && close.contains(probe)),
      overlaps,
      scrollsSideways: root.scrollWidth > root.clientWidth,
    };
  });
}
