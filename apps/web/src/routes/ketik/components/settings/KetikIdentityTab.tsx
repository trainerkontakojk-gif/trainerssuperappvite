import {
  SettingsField,
  SettingsInput,
} from "../../../../components/settings/SettingsPrimitives";

interface KetikIdentityTabProps {
  identitySettings: {
    displayName: string;
    signatureName: string;
    phoneNumber: string;
    city: string;
  };
  handleIdentityChange: (field: string, value: string) => void;
}

export function KetikIdentityTab({
  identitySettings,
  handleIdentityChange,
}: KetikIdentityTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Identitas &amp; Greeting
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Konfigurasi profil konsumen dan identitas agen untuk salam pembuka
            yang lebih personal.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsField label="Nama Konsumen" id="ketik-identity-display-name">
            <SettingsInput
              id="ketik-identity-display-name"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings.displayName || ""}
              onChange={(e) =>
                handleIdentityChange("displayName", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField
            label="Nama Agen (Greeting)"
            id="ketik-identity-signature-name"
          >
            <SettingsInput
              id="ketik-identity-signature-name"
              placeholder="Contoh: Fajar"
              value={identitySettings.signatureName || ""}
              onChange={(e) =>
                handleIdentityChange("signatureName", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField label="Nomor Telepon" id="ketik-identity-phone">
            <SettingsInput
              id="ketik-identity-phone"
              placeholder="Contoh: 0812..."
              value={identitySettings.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField label="Kota Asal" id="ketik-identity-city">
            <SettingsInput
              id="ketik-identity-city"
              placeholder="Contoh: Jakarta"
              value={identitySettings.city || ""}
              onChange={(e) => handleIdentityChange("city", e.target.value)}
            />
          </SettingsField>
        </div>
      </section>
    </div>
  );
}
