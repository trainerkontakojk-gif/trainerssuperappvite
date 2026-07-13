import { describe, expect, it, vi } from "vitest";
import type { KetikScenario } from "@trainers/types";
import { getKetikScenarioImages } from "../routes/ketik/components/chat/ketikScenarioImages";
import {
  NO_RESPONSE_PATTERN_GLOBAL,
  stripNarrationFromImagePart,
} from "../routes/ketik/lib/message-utils";

describe("KETIK NO_RESPONSE_PATTERN_GLOBAL", () => {
  it("strips [NO_RESPONSE] suffix from text", () => {
    expect(
      "Terima kasih [NO_RESPONSE]"
        .replace(NO_RESPONSE_PATTERN_GLOBAL, "")
        .trim(),
    ).toBe("Terima kasih");
  });

  it("strips [NO_RESPONSE] prefix from text", () => {
    expect(
      "[NO_RESPONSE] saya setuju"
        .replace(NO_RESPONSE_PATTERN_GLOBAL, "")
        .trim(),
    ).toBe("saya setuju");
  });

  it("strips [NO_RESPONSE] in middle of text", () => {
    expect(
      "oke [NO_RESPONSE] lanjut".replace(NO_RESPONSE_PATTERN_GLOBAL, ""),
    ).toBe("oke  lanjut");
  });

  it("returns empty when only [NO_RESPONSE]", () => {
    expect("[NO_RESPONSE]".replace(NO_RESPONSE_PATTERN_GLOBAL, "").trim()).toBe(
      "",
    );
  });

  it("strips case-insensitive variations", () => {
    expect("[no_response]".replace(NO_RESPONSE_PATTERN_GLOBAL, "").trim()).toBe(
      "",
    );
    expect("[No_Response]".replace(NO_RESPONSE_PATTERN_GLOBAL, "").trim()).toBe(
      "",
    );
    expect("[NO_response]".replace(NO_RESPONSE_PATTERN_GLOBAL, "").trim()).toBe(
      "",
    );
  });

  it("preserves other tags like [BREAK]", () => {
    expect(
      "oke [BREAK] [NO_RESPONSE]"
        .replace(NO_RESPONSE_PATTERN_GLOBAL, "")
        .trim(),
    ).toBe("oke [BREAK]");
  });
});

describe("KETIK chat structure helpers", () => {
  it("returns scenario images without requiring caller casts", () => {
    const scenario: KetikScenario = {
      id: "scenario-1",
      category: "Test",
      title: "Scenario",
      description: "Description",
      isActive: true,
      images: ["data:image/png;base64,one"],
    };

    expect(getKetikScenarioImages(scenario)).toEqual([
      "data:image/png;base64,one",
    ]);
  });

  it("returns an empty image list when scenario images are absent", () => {
    const scenario: KetikScenario = {
      id: "scenario-2",
      category: "Test",
      title: "Scenario",
      description: "Description",
      isActive: true,
    };

    expect(getKetikScenarioImages(scenario)).toEqual([]);
  });

  it("keeps only the image tag without logging discarded narration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      stripNarrationFromImagePart("[SYSTEM] Narasi internal [SEND_IMAGE: 2]"),
    ).toBe("[SEND_IMAGE: 2]");
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
