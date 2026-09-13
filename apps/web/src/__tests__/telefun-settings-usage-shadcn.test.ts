// Guards the Telefun settings/live readability pass and the shared UsageModal
// shadcn alignment: no sub-12px arbitrary text sizes, and no decorative slop
// (Sparkles, oversized radius, hardcoded pastel module colors) in the modal.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) =>
  readFileSync(join(__dirname, relativePath), "utf8");

const SETTINGS_AND_LIVE_SOURCES = [
  "../routes/telefun/components/SettingsModal.tsx",
  "../routes/telefun/components/settings/TelefunScenariosTab.tsx",
  "../routes/telefun/components/settings/TelefunConsumersTab.tsx",
  "../routes/telefun/components/settings/TelefunIdentityTab.tsx",
  "../routes/telefun/components/settings/TelefunSystemTab.tsx",
  "../routes/telefun/components/PhoneInterface.tsx",
];

const USAGE_MODAL = "../components/UsageModal.tsx";

describe("Telefun settings and live readability", () => {
  it("does not use arbitrary text sizes below 12px", () => {
    const belowMinimum = /text-\[(?:[0-9]|1[0-3])px\]/;

    for (const source of SETTINGS_AND_LIVE_SOURCES) {
      expect(readSource(source)).not.toMatch(belowMinimum);
    }
  });

  it("removes the consumers side-stripe banner and decorative emoji", () => {
    const source = readSource(
      "../routes/telefun/components/settings/TelefunConsumersTab.tsx",
    );

    expect(source).not.toContain("border-l-2");
    expect(source).not.toMatch(/💡/u);
  });
});

describe("UsageModal shadcn alignment", () => {
  it("uses the shadcn Dialog primitive instead of a hand-rolled overlay", () => {
    const source = readSource(USAGE_MODAL);

    expect(source).toContain("DialogContent");
    expect(source).toContain("DialogTitle");
  });

  it("drops decorative and hardcoded slop", () => {
    const source = readSource(USAGE_MODAL);

    for (const banned of [
      "Sparkles",
      "rounded-[2rem]",
      "bg-emerald-50",
      "bg-purple-50",
      "bg-violet-50",
      "text-emerald-600",
      "text-purple-600",
      "text-violet-600",
      "text-[10px]",
    ]) {
      expect(source).not.toContain(banned);
    }
  });
});
