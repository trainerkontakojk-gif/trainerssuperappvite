import { describe, expect, it, vi } from "vitest";

const fetchApi = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useApi", () => ({ fetchApi }));

import {
  fetchTelefunWebRtcCapability,
  isAllowedTelefunWebRtc,
  isTelefunWebRtcModelAllowed,
} from "../routes/telefun/services/telefunWebRtcCapability";

describe("Telefun WebRTC capability retirement", () => {
  it("returns the static compatibility envelope without fetching", async () => {
    fetchApi.mockResolvedValueOnce({
      openaiWebRtc: {
        enabled: true,
        allowed: true,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
        modelIds: ["gpt-realtime-2.1"],
      },
    });

    const capability = await fetchTelefunWebRtcCapability();

    expect(fetchApi).not.toHaveBeenCalled();
    expect(capability).toMatchObject({
      enabled: false,
      allowed: false,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
      modelIds: [],
    });
    expect(isAllowedTelefunWebRtc(capability)).toBe(false);
  });

  it("fails closed for every model, including historical IDs", () => {
    expect(isAllowedTelefunWebRtc(null)).toBe(false);
    expect(isTelefunWebRtcModelAllowed(null, "gpt-realtime-2.1")).toBe(false);
    expect(
      isTelefunWebRtcModelAllowed(
        {
          enabled: false,
          allowed: false,
          modelId: "gpt-realtime-2.1",
          transport: "openai-webrtc",
          modelIds: [],
        },
        "gpt-realtime-2.1",
      ),
    ).toBe(false);
  });
});
