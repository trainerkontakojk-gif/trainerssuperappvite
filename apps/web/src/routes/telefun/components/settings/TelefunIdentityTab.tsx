import React from "react";
import { normalizeTelefunBrowserSelection } from "../../telefunSettings";
import {
  TelefunAppSettings as AppSettings,
  TelefunIdentitySettings as ConsumerIdentitySettings,
} from "../../telefunSettings";
import { getVoicesForModel } from "../../telefunVoiceRegistry";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from "../../../../components/settings/SettingsPrimitives";

interface TelefunIdentityTabProps {
  identitySettings: ConsumerIdentitySettings;
  telefunModelId: string;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TelefunIdentityTab: React.FC<TelefunIdentityTabProps> = ({
  identitySettings,
  telefunModelId,
  setLocalSettings,
}) => {
  const selectedModel = normalizeTelefunBrowserSelection(telefunModelId).model;
  const selectedGender = identitySettings?.gender || "random";
  const voiceSelectionDisabled = selectedGender === "random";
  const voiceOptions = voiceSelectionDisabled
    ? []
    : getVoicesForModel(selectedModel.id, selectedGender);

  const handleIdentityChange = <K extends keyof ConsumerIdentitySettings>(
    field: K,
    value: ConsumerIdentitySettings[K],
  ) => {
    setLocalSettings((prev: AppSettings) => {
      const updatedSettings = {
        ...prev.identitySettings,
        [field]: value,
      };
      if (field === "gender") updatedSettings.voiceName = "";
      return {
        ...prev,
        identitySettings: updatedSettings,
      };
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Atur Identitas Simulasi
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Konfigurasi identitas persona dan suara untuk model Telefun yang
            dipilih.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsField
            label="Nama Konsumen (Lengkap)"
            id="telefun-identity-display-name"
          >
            <SettingsInput
              id="telefun-identity-display-name"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings?.displayName || ""}
              onChange={(e) =>
                handleIdentityChange("displayName", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField label="Jenis Kelamin" id="telefun-identity-gender">
            <SettingsSelect
              id="telefun-identity-gender"
              value={selectedGender}
              onChange={(e) =>
                handleIdentityChange(
                  "gender",
                  e.target.value as ConsumerIdentitySettings["gender"],
                )
              }
            >
              <option value="random">Acak</option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
            </SettingsSelect>
          </SettingsField>

          <SettingsField
            label="Pilihan Suara"
            id="telefun-identity-voice"
            helperText={
              voiceSelectionDisabled
                ? "Suara akan diacak otomatis sesuai hasil penentuan gender saat simulasi."
                : undefined
            }
          >
            <SettingsSelect
              id="telefun-identity-voice"
              value={identitySettings?.voiceName || ""}
              onChange={(e) =>
                handleIdentityChange("voiceName", e.target.value)
              }
              disabled={voiceSelectionDisabled}
            >
              <option value="">Acak (Sesuai Gender)</option>
              {voiceOptions.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </SettingsSelect>
          </SettingsField>

          <SettingsField
            label="Nomor Telepon Konsumen"
            id="telefun-identity-phone"
          >
            <SettingsInput
              id="telefun-identity-phone"
              placeholder="Contoh: 0812..."
              value={identitySettings?.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField label="Kota Konsumen" id="telefun-identity-city">
            <SettingsInput
              id="telefun-identity-city"
              placeholder="Contoh: Jakarta"
              value={identitySettings?.city || ""}
              onChange={(e) => handleIdentityChange("city", e.target.value)}
            />
          </SettingsField>
        </div>
      </section>
    </div>
  );
};
