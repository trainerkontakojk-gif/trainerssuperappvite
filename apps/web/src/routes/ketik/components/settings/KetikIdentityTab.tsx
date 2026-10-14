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
      <section className="flex flex-col gap-6">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            Identitas konsumen
          </h3>
          <p className="text-[13px] leading-5 text-fg2">
            Nama, nomor, dan kota konsumen di chat, serta nama agen di salam
            pembuka. Kosongkan nama, nomor, atau kota agar dibuat acak di setiap
            sesi.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsField label="Nama konsumen" id="ketik-identity-display-name">
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
            label="Nama agen di salam pembuka"
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

          <SettingsField label="Nomor telepon" id="ketik-identity-phone">
            <SettingsInput
              id="ketik-identity-phone"
              placeholder="Contoh: 0812..."
              value={identitySettings.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField label="Kota asal" id="ketik-identity-city">
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
