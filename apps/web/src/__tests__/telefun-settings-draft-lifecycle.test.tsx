import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTelefunSettingsDraft } from "../routes/telefun/components/settings/useTelefunSettingsDraft";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";

describe("Telefun settings draft retirement normalization", () => {
  it("normalizes persisted OpenAI settings synchronously when the modal opens", async () => {
    const persisted = {
      ...DEFAULT_TELEFUN_SETTINGS,
      telefunModelId: "gpt-realtime-2.1",
      telefunTransport: "openai-webrtc" as const,
      identitySettings: {
        ...DEFAULT_TELEFUN_SETTINGS.identitySettings,
        gender: "female" as const,
        voiceName: "cedar",
      },
    };
    const { result } = renderHook(() =>
      useTelefunSettingsDraft({
        settings: persisted,
        isOpen: true,
        onSave: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedTelefunModel).toBe(
        DEFAULT_TELEFUN_SETTINGS.telefunModelId,
      );
      expect(result.current.selectedTelefunTransport).toBe("gemini-live");
      expect(result.current.localSettings.identitySettings.voiceName).toBe("");
    });
  });

  it("always emits Gemini model, transport, and voice in the save payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const persisted = {
      ...DEFAULT_TELEFUN_SETTINGS,
      telefunModelId: "gpt-realtime-2.1-mini",
      telefunTransport: "openai-audio" as const,
      identitySettings: {
        ...DEFAULT_TELEFUN_SETTINGS.identitySettings,
        voiceName: "marin",
      },
    };
    const { result } = renderHook(() =>
      useTelefunSettingsDraft({
        settings: persisted,
        isOpen: true,
        onSave,
        onClose: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        telefunModelId: DEFAULT_TELEFUN_SETTINGS.telefunModelId,
        telefunTransport: "gemini-live",
        identitySettings: expect.objectContaining({ voiceName: "" }),
      }),
    );
  });

});
