import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const targets = [
  "src/routes/pdkt/components/CreateEmailModal.tsx",
  "src/routes/pdkt/components/EmailComposer.tsx",
  "src/routes/pdkt/components/HistoryModal.tsx",
];

describe("PDKT theme contract", () => {
  it("does not use light-only neutral surfaces, borders, or text", () => {
    const lightOnlyNeutral =
      /\b(?:bg|border|text)-(?:white|gray-(?:50|100|200|300|400|500|800|900))\b/;

    for (const relativePath of targets) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toMatch(lightOnlyNeutral);
    }
  });

  it("uses the shared Dialog primitive for modal backdrops", () => {
    const createModal = readFileSync(
      resolve(process.cwd(), targets[0]),
      "utf8",
    );
    const historyModal = readFileSync(
      resolve(process.cwd(), targets[2]),
      "utf8",
    );

    expect(createModal).toContain("<DialogContent");
    expect(historyModal).toContain("<DialogContent");
  });

  it("uses readable light and dark text variants for semantic statuses", () => {
    const inaccessibleStatusText =
      /\btext-(?:amber|blue|emerald|red|rose|sky)-500\b/;

    for (const relativePath of targets) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toMatch(inaccessibleStatusText);
    }
  });

  it("uses semantic surface and border tokens in every target", () => {
    const requiredTokens = ["bg-card", "border-border"];

    for (const relativePath of targets) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      for (const token of requiredTokens) {
        expect(source, `${relativePath}: ${token}`).toContain(token);
      }
    }
  });
});
