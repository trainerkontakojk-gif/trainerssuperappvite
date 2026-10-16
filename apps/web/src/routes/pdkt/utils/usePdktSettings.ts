import { useCallback, useEffect, useRef, useState } from "react";
import { pdktClient, unwrapResponse } from "../../../lib/api";
import { createSettingsVersionStore } from "../../../lib/settings-contract";
import type { PdktAppSettings } from "../pdktSettings";

export type PdktSettingsState = "loading" | "ready" | "error";
export interface PdktSettingsResource {
  settings: PdktAppSettings | null;
  status: PdktSettingsState;
  readonly version?: string;
  reload: () => Promise<void>;
  save: (settings: PdktAppSettings) => Promise<void>;
}

/** One account-scoped settings resource for both landing and workspace. */
export function usePdktSettings(
  accountKey: string | null,
  initialSettings?: PdktAppSettings | null,
  initialVersion?: string,
): PdktSettingsResource {
  const [state, setState] = useState<{
    settings: PdktAppSettings | null;
    status: PdktSettingsState;
  }>({
    settings: initialSettings ?? null,
    status: initialSettings === undefined ? "loading" : "ready",
  });
  const generation = useRef(0);
  const version = useRef(createSettingsVersionStore());
  const initial = useRef({
    accountKey,
    settings: initialSettings,
    version: initialVersion,
  });
  const reload = useCallback(async () => {
    const request = ++generation.current;
    version.current.clear();
    setState({ settings: null, status: "loading" });
    if (!accountKey) return;
    try {
      const response = await pdktClient.settings.$get();
      const settings = (await unwrapResponse(
        response,
      )) as PdktAppSettings | null;
      if (request !== generation.current) return;
      version.current.capture(response);
      setState({ settings, status: "ready" });
    } catch (error) {
      if (request !== generation.current) return;
      console.error("[PDKT] Failed to load settings:", error);
      setState({ settings: null, status: "error" });
    }
  }, [accountKey]);
  useEffect(() => {
    if (
      initial.current.accountKey === accountKey &&
      initial.current.settings !== undefined
    ) {
      version.current.restore(initial.current.version);
    } else {
      void reload();
    }
    return () => {
      generation.current++;
    };
  }, [reload, accountKey]);
  const save = useCallback(
    async (settings: PdktAppSettings) => {
      if (state.status !== "ready")
        throw new Error("Muat ulang pengaturan sebelum menyimpan.");
      const request = generation.current;
      const response = await pdktClient.settings.$post(
        { json: { settings } },
        version.current.requiredRequestOptions(),
      );
      await unwrapResponse(response);
      if (request !== generation.current) return;
      version.current.capture(response);
      setState({ settings, status: "ready" });
    },
    [state.status],
  );
  return {
    ...state,
    get version() {
      return version.current.current();
    },
    reload,
    save,
  };
}
