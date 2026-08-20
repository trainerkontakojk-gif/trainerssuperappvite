import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)), "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession.ts"),
  "utf8",
);

describe("retired OpenAI WebRTC recording compatibility", () => {
  it("retires the active browser recording/session seam while keeping only a fail-closed cached-module shell", () => {
    expect(source).toContain("permanently disabled for Telefun");
    expect(source).not.toContain("recordingGraph");
    expect(source).not.toContain("MediaRecorder");
    expect(source).not.toContain("createOffer");
  });
});
