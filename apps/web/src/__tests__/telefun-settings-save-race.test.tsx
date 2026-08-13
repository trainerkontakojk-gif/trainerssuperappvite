// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTelefunSettingsDraft } from "../routes/telefun/components/settings/useTelefunSettingsDraft";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";
import {
  OPENAI_WEBRTC_MODEL_ID,
  OPENAI_WEBRTC_TRANSPORT,
} from "../routes/telefun/services/telefunWebRtcCapability";

describe("Telefun settings save sequencing", () => {
  it("keeps the modal open until selected WebRTC settings finish saving", async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useTelefunSettingsDraft({
        settings: DEFAULT_TELEFUN_SETTINGS,
        isOpen: true,
        onSave,
        onClose,
        providerReadiness: {
          status: "ready",
          openai: { enabled: true, configured: true, ready: true },
        },
        webRtcCapability: {
          enabled: true,
          allowed: true,
          modelId: OPENAI_WEBRTC_MODEL_ID,
          transport: OPENAI_WEBRTC_TRANSPORT,
        },
      }),
    );

    act(() => {
      result.current.setSelectedTelefunModel(OPENAI_WEBRTC_MODEL_ID);
    });
    act(() => {
      result.current.setSelectedTelefunTransport(OPENAI_WEBRTC_TRANSPORT);
    });
    act(() => {
      result.current.handleSave();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        telefunModelId: OPENAI_WEBRTC_MODEL_ID,
        telefunTransport: OPENAI_WEBRTC_TRANSPORT,
      }),
    );
    expect(onClose).not.toHaveBeenCalled();

    expect(result.current.isSaving).toBe(true);
    resolveSave();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(result.current.isSaving).toBe(false);
  });

  it("keeps a failed save open and allows one explicit retry", async () => {
    const onSave = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useTelefunSettingsDraft({
        settings: DEFAULT_TELEFUN_SETTINGS,
        isOpen: true,
        onSave,
        onClose,
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);

    await act(async () => {
      await result.current.handleSave();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("coalesces duplicate save clicks while persistence is in flight", async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useTelefunSettingsDraft({
        settings: DEFAULT_TELEFUN_SETTINGS,
        isOpen: true,
        onSave,
        onClose,
      }),
    );

    let firstSave!: Promise<void>;
    let duplicateSave!: Promise<void>;
    act(() => {
      firstSave = result.current.handleSave();
      duplicateSave = result.current.handleSave();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    resolveSave();
    await act(async () => {
      await Promise.all([firstSave, duplicateSave]);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
