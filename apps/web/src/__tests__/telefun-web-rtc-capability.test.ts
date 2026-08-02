import { describe, expect, it, vi } from "vitest";

const fetchApi = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useApi", () => ({ fetchApi }));

import {
  fetchTelefunWebRtcCapability,
  isAllowedTelefunWebRtc,
} from "../routes/telefun/services/telefunWebRtcCapability";

describe("Telefun WebRTC capability", () => {
  it("uses the authenticated API contract and validates the supported pair", async () => {
    fetchApi.mockResolvedValueOnce({
      openaiWebRtc: {
        enabled: true,
        allowed: true,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
      },
    });

    const capability = await fetchTelefunWebRtcCapability();

    expect(fetchApi).toHaveBeenCalledWith("/telefun/capabilities", {
      signal: undefined,
    });
    expect(isAllowedTelefunWebRtc(capability)).toBe(true);
  });

  it("fails closed when the rollout is denied", async () => {
    fetchApi.mockResolvedValueOnce({
      openaiWebRtc: {
        enabled: false,
        allowed: false,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
      },
    });

    const capability = await fetchTelefunWebRtcCapability();
    expect(isAllowedTelefunWebRtc(capability)).toBe(false);
  });
});
