import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../routes/telefun/services/liveSession.ts",
  ),
  "utf8",
);

describe("LiveSession Gemini-only runtime", () => {
  it("contains no OpenAI Realtime data-plane branch", () => {
    expect(source).not.toContain("buildOpenAi");
    expect(source).not.toContain("parseOpenAiRealtimeEvent");
    expect(source).not.toContain("handleOpenAiMessage");
    expect(source).not.toContain("sendOpenAiEvent");
  });
});
