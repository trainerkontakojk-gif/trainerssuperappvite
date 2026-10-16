import { useState, type ComponentProps } from "react";
import PdktSimulation from "../../routes/pdkt/simulation";
import {
  usePdktSettings,
  type PdktSettingsResource,
} from "../../routes/pdkt/utils/usePdktSettings";
import type { PdktAppSettings } from "../../routes/pdkt/pdktSettings";

type Props = Omit<
  ComponentProps<typeof PdktSimulation>,
  | "selectedId"
  | "onSelectedIdChange"
  | "canPickParticipant"
  | "settingsResource"
> & {
  canPickParticipant?: boolean;
  settingsResource?: PdktSettingsResource;
  initialSettings?: PdktAppSettings | null;
  initialSettingsVersion?: string;
  onSettingsChange?: (
    settings: PdktAppSettings,
    version: string | undefined,
  ) => void;
};

/** Legacy fixture adapter: production selection is owned by the URL. */
export default function PdktSimulationHarness({
  canPickParticipant = false,
  settingsResource,
  initialSettings,
  initialSettingsVersion,
  onSettingsChange,
  ...props
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loaded = usePdktSettings(
    "legacy-fixture",
    initialSettings,
    initialSettingsVersion,
  );
  const resource = settingsResource ?? {
    ...loaded,
    save: async (settings: PdktAppSettings) => {
      await loaded.save(settings);
      onSettingsChange?.(settings, loaded.version);
    },
  };
  return (
    <PdktSimulation
      {...props}
      settingsResource={resource}
      canPickParticipant={canPickParticipant}
      selectedId={selectedId}
      onSelectedIdChange={async (id) => {
        setSelectedId(id);
      }}
    />
  );
}
