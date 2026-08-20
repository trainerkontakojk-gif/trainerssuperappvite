import { describe, expect, it } from "vitest";
import {
  isTelefunOpenAiWebRtcAllowed,
  isTelefunOpenAiWebRtcModelAllowed,
} from "./rollout-gate.js";

describe("retired OpenAI WebRTC rollout gate", () => {
  it("never admits a start under any former flag, cohort, or model configuration", () => {
    expect(
      isTelefunOpenAiWebRtcAllowed({
        enabled: true,
        nodeEnv: "production",
        allowedUserIds: ["user-1"],
        allowedModelIds: ["gpt-realtime-2.1"],
        userId: "user-1",
      }),
    ).toBe(false);
  });

  it("does not treat a retired model allowlist as an admission signal", () => {
    expect(
      isTelefunOpenAiWebRtcModelAllowed("gpt-realtime-2.1", [
        "gpt-realtime-2.1",
      ]),
    ).toBe(false);
  });
});
