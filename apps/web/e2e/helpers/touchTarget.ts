import type { Locator, Page } from "@playwright/test";

/** Measure actual hit areas after finite entrance animations settle. */
export async function findTargetsBelow(
  page: Page,
  rootLocator: Locator,
  min = 44,
) {
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
  return rootLocator.evaluate((root, floor) => {
    const selector =
      'button,a[href],[role="button"],[role="tab"],[role="checkbox"],[role="menuitem"],input[type="checkbox"],input[type="radio"],select,[role="combobox"]';
    const findings: { name: string; width: number; height: number }[] = [];
    const measured = new Set<Element>();
    for (const control of root.querySelectorAll<HTMLElement>(selector)) {
      if (control.closest('[aria-hidden="true"],[hidden],[inert]')) continue;
      const style = getComputedStyle(control);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        !control.getClientRects().length
      )
        continue;
      // Inline sentence links are covered separately by the Telaah tests.
      if (control.matches("a") && control.closest("p")) continue;
      const label = control.matches(
        'input[type="checkbox"],input[type="radio"]',
      )
        ? (control as HTMLInputElement).labels?.[0]
        : null;
      const target = label ?? control;
      if (measured.has(target)) continue;
      measured.add(target);
      const rect = target.getBoundingClientRect();
      if (rect.width + 0.1 >= floor && rect.height + 0.1 >= floor) continue;
      findings.push({
        name:
          control.getAttribute("aria-label") ||
          target.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) ||
          control.getAttribute("title") ||
          control.tagName,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      });
    }
    return findings;
  }, min);
}
