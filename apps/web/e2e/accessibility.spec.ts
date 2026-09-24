import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public landing page has no WCAG 2.1 A/AA accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Trainers SuperApp/i);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const summary = results.violations
    .map(
      (violation) =>
        `${violation.impact ?? "unknown"}: ${violation.id} — ${violation.help}\n${
          violation.nodes
            .map((node) => `  ${node.target.join(", ")}: ${node.failureSummary ?? ""}`)
            .join("\n")
        }`,
    )
    .join("\n\n");

  expect(results.violations, summary || "axe-core reported no violations").toEqual(
    [],
  );
});
