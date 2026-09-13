// Guards the /telefun shadcn-aligned surfaces against decorative "AI slop"
// (gradient/glow/glass hero, tiny uppercase tracked eyebrows) and against
// readable text dropping below the 12px design-system minimum.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) =>
  readFileSync(join(__dirname, relativePath), "utf8");

const PHONE_HERO = "../routes/telefun/components/TelefunMotionFrame.tsx";
const LANDING = "../routes/telefun/index.tsx";
const HOLD_DISPLAY = "../routes/telefun/components/HoldStatusDisplay.tsx";

describe("Telefun landing anti-slop and readability", () => {
  it("keeps the phone hero surface free of decorative gradient, glow, and glass", () => {
    const source = readSource(PHONE_HERO);

    // Page-level wrapper tokens only. Blurred wallpaper *inside* the device
    // screen is intentional illustration detail, not section decoration.
    for (const banned of [
      "from-violet-50",
      "from-violet-950",
      "via-indigo-50",
      "to-indigo-950",
      "backdrop-blur-xl",
      "bg-violet-100/50",
      "bg-violet-200/40",
      "bg-indigo-200/30",
    ]) {
      expect(source).not.toContain(banned);
    }
  });

  it("does not use a tiny uppercase tracked eyebrow in the landing actions", () => {
    expect(readSource(LANDING)).not.toMatch(/text-\[10px\][^"]*uppercase/);
  });

  it("keeps visible landing and hold text at or above the 12px minimum", () => {
    const belowMinimum = /text-\[(?:[0-9]|1[01])px\]/;

    expect(readSource(LANDING)).not.toMatch(belowMinimum);
    expect(readSource(HOLD_DISPLAY)).not.toMatch(belowMinimum);
  });
});
