import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTelefunSettingsDraft } from "../routes/telefun/components/settings/useTelefunSettingsDraft";
import type { TelefunProviderReadinessState } from "../routes/telefun/hooks/useTelefunProviderReadiness";
import {
  DEFAULT_TELEFUN_SETTINGS,
  type TelefunAppSettings,
} from "../routes/telefun/telefunSettings";

describe("Telefun settings draft model/voice synchronization", () => {
  const ready: TelefunProviderReadinessState = {
    status: "ready",
    openai: { enabled: true, configured: true, ready: true },
  };
  const loading: TelefunProviderReadinessState = {
    status: "loading",
    openai: null,
  };
  const unavailable: TelefunProviderReadinessState = {
    status: "unavailable",
    openai: null,
  };

  it("preserves a compatible persisted OpenAI voice during async open and later coerces real model changes", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const persistedOpenAiSettings: TelefunAppSettings = {
      ...DEFAULT_TELEFUN_SETTINGS,
      telefunModelId: "gpt-realtime-2.1",
      telefunTransport: "openai-audio",
      identitySettings: {
        ...DEFAULT_TELEFUN_SETTINGS.identitySettings,
        gender: "random",
        voiceName: "cedar",
      },
    };

    const { result, rerender } = renderHook(
      ({ settings, isOpen }) =>
        useTelefunSettingsDraft({
          settings,
          isOpen,
          onSave,
          onClose,
          providerReadiness: ready,
        }),
      {
        initialProps: {
          settings: DEFAULT_TELEFUN_SETTINGS,
          isOpen: false,
        },
      },
    );

    rerender({ settings: persistedOpenAiSettings, isOpen: true });

    await waitFor(() => {
      expect(result.current.selectedTelefunModel).toBe("gpt-realtime-2.1");
      expect(result.current.localSettings.identitySettings.voiceName).toBe(
        "cedar",
      );
    });

    act(() => result.current.handleSave());
    const saved = onSave.mock.calls[0][0] as TelefunAppSettings;
    expect(saved.telefunModelId).toBe("gpt-realtime-2.1");
    expect(saved.telefunTransport).toBe("openai-audio");
    expect(saved.identitySettings.voiceName).toBe("cedar");

    act(() =>
      result.current.setSelectedTelefunModel(
        DEFAULT_TELEFUN_SETTINGS.telefunModelId,
      ),
    );
    expect(result.current.localSettings.identitySettings.voiceName).toBe("");

    act(() => result.current.setSelectedTelefunModel("gpt-realtime-2.1"));
    expect(result.current.localSettings.identitySettings.voiceName).toBe(
      "marin",
    );
  });

  it("preserves persisted OpenAI while checking, then atomically falls back when unavailable", async () => {
    const persistedOpenAiSettings: TelefunAppSettings = {
      ...DEFAULT_TELEFUN_SETTINGS,
      telefunModelId: "gpt-realtime-2.1-mini",
      telefunTransport: "openai-audio",
      identitySettings: {
        ...DEFAULT_TELEFUN_SETTINGS.identitySettings,
        voiceName: "cedar",
      },
    };
    const { result, rerender } = renderHook(
      ({
        providerReadiness,
      }: {
        providerReadiness: TelefunProviderReadinessState;
      }) =>
        useTelefunSettingsDraft({
          settings: persistedOpenAiSettings,
          isOpen: true,
          onSave: vi.fn(),
          onClose: vi.fn(),
          providerReadiness,
        }),
      {
        initialProps: {
          providerReadiness: loading,
        } as { providerReadiness: TelefunProviderReadinessState },
      },
    );

    await waitFor(() => {
      expect(result.current.selectedTelefunModel).toBe("gpt-realtime-2.1-mini");
      expect(result.current.localSettings.identitySettings.voiceName).toBe(
        "cedar",
      );
    });

    rerender({ providerReadiness: unavailable });

    await waitFor(() => {
      expect(result.current.selectedTelefunModel).toBe(
        DEFAULT_TELEFUN_SETTINGS.telefunModelId,
      );
      expect(result.current.localSettings.telefunModelId).toBe(
        DEFAULT_TELEFUN_SETTINGS.telefunModelId,
      );
      expect(result.current.localSettings.telefunTransport).toBe(
        DEFAULT_TELEFUN_SETTINGS.telefunTransport,
      );
      expect(result.current.localSettings.identitySettings.voiceName).toBe("");
      expect(result.current.localSettings.telefunModelWarningReason).toBe(
        "provider-unavailable",
      );
    });
  });

  it("blocks direct OpenAI selection while unavailable without affecting Gemini", () => {
    const { result } = renderHook(() =>
      useTelefunSettingsDraft({
        settings: DEFAULT_TELEFUN_SETTINGS,
        isOpen: true,
        onSave: vi.fn(),
        onClose: vi.fn(),
        providerReadiness: unavailable,
      }),
    );

    act(() => result.current.setSelectedTelefunModel("gpt-realtime-2.1"));
    expect(result.current.selectedTelefunModel).toBe(
      DEFAULT_TELEFUN_SETTINGS.telefunModelId,
    );

    act(() =>
      result.current.setSelectedTelefunModel("gemini-3.0-flash-live-preview"),
    );
    expect(result.current.selectedTelefunModel).toBe(
      "gemini-3.0-flash-live-preview",
    );
  });
});
