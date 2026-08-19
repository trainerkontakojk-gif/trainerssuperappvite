import { describe, expect, it, vi } from "vitest";

const fetchApi = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useApi", () => ({ fetchApi }));

import {
  fetchTelefunWebRtcCapability,
  isAllowedTelefunWebRtc,
  isTelefunWebRtcModelAllowed,
  type TelefunWebRtcCapability,
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

  it("keeps the Full-only default when the server omits modelIds", async () => {
    fetchApi.mockResolvedValueOnce({
      openaiWebRtc: {
        enabled: true,
        allowed: true,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
      },
    });

    const capability = await fetchTelefunWebRtcCapability();

    expect(capability.modelIds).toEqual(["gpt-realtime-2.1"]);
    expect(isAllowedTelefunWebRtc(capability)).toBe(true);
    expect(isTelefunWebRtcModelAllowed(capability, "gpt-realtime-2.1")).toBe(
      true,
    );
    expect(
      isTelefunWebRtcModelAllowed(capability, "gpt-realtime-2.1-mini"),
    ).toBe(false);
  });

  it("lets the start-flow guard accept Mini+WebRTC when modelIds includes Mini", async () => {
    fetchApi.mockResolvedValueOnce({
      openaiWebRtc: {
        enabled: true,
        allowed: true,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
        modelIds: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"],
      },
    });

    const capability = await fetchTelefunWebRtcCapability();

    // The guard gates on the selected model's membership, not on Full equality,
    // so Mini+WebRTC passes without any force back to the Full model.
    expect(isAllowedTelefunWebRtc(capability)).toBe(true);
    expect(
      isTelefunWebRtcModelAllowed(capability, "gpt-realtime-2.1-mini"),
    ).toBe(true);
    expect(
      isAllowedTelefunWebRtc(capability) &&
        isTelefunWebRtcModelAllowed(capability, "gpt-realtime-2.1-mini"),
    ).toBe(true);
  });

  it("rejects a capability mismatch (selected model absent from modelIds)", async () => {
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

    expect(
      isTelefunWebRtcModelAllowed(capability, "gpt-realtime-2.1-mini"),
    ).toBe(false);
    expect(
      isTelefunWebRtcModelAllowed(capability, "gemini-3.1-flash-live-preview"),
    ).toBe(false);
  });

  it("fails closed when the capability or modelIds are missing or empty", () => {
    expect(isAllowedTelefunWebRtc(null)).toBe(false);
    expect(isTelefunWebRtcModelAllowed(null, "gpt-realtime-2.1")).toBe(false);
    expect(
      isTelefunWebRtcModelAllowed(
        {
          enabled: true,
          allowed: true,
          modelId: "gpt-realtime-2.1",
          transport: "openai-webrtc",
          modelIds: [],
        },
        "gpt-realtime-2.1",
      ),
    ).toBe(false);
    expect(
      isTelefunWebRtcModelAllowed(
        {} as TelefunWebRtcCapability,
        "gpt-realtime-2.1",
      ),
    ).toBe(true);
    expect(
      isTelefunWebRtcModelAllowed(
        {} as TelefunWebRtcCapability,
        "gpt-realtime-2.1-mini",
      ),
    ).toBe(false);
  });
});
