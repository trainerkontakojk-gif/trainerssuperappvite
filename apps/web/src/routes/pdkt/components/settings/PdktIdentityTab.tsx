import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from "@/components/settings/SettingsPrimitives";

type ConsumerNameMentionPattern =
  | "random"
  | "upfront"
  | "middle"
  | "late"
  | "none";

interface PdktIdentityTabProps {
  customSenderName: string;
  setCustomSenderName: (val: string) => void;
  customBodyName: string;
  setCustomBodyName: (val: string) => void;
  customEmail: string;
  setCustomEmail: (val: string) => void;
  customCity: string;
  setCustomCity: (val: string) => void;
  consumerNameMentionPattern: ConsumerNameMentionPattern;
  setConsumerNameMentionPattern: (val: ConsumerNameMentionPattern) => void;
}

export function PdktIdentityTab({
  customSenderName,
  setCustomSenderName,
  customBodyName,
  setCustomBodyName,
  customEmail,
  setCustomEmail,
  customCity,
  setCustomCity,
  consumerNameMentionPattern,
  setConsumerNameMentionPattern,
}: PdktIdentityTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            Identitas konsumen
          </h3>
          <p className="text-[13px] leading-5 text-fg2">
            Nama dan alamat konsumen yang mengirim email konsumen. Biarkan kosong
            agar sistem memakai identitas acak di setiap sesi.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsField
            label="Nama lengkap"
            id="custom-sender-name"
            helperText="Tampil sebagai nama pengirim email."
          >
            <SettingsInput
              id="custom-sender-name"
              type="text"
              placeholder="Contoh: Ahmad Fauzi"
              value={customSenderName}
              onChange={(e) => setCustomSenderName(e.target.value)}
            />
          </SettingsField>

          <SettingsField
            label="Nama panggilan"
            id="custom-body-name"
            helperText="Dipakai konsumen saat menyebut dirinya."
          >
            <SettingsInput
              id="custom-body-name"
              type="text"
              placeholder="Contoh: Fauzi"
              value={customBodyName}
              onChange={(e) => setCustomBodyName(e.target.value)}
            />
          </SettingsField>

          <SettingsField label="Alamat email" id="custom-email">
            <SettingsInput
              id="custom-email"
              type="email"
              placeholder="nama@email.com"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
            />
          </SettingsField>

          <SettingsField label="Kota" id="custom-city">
            <SettingsInput
              id="custom-city"
              type="text"
              placeholder="Contoh: Jakarta"
              value={customCity}
              onChange={(e) => setCustomCity(e.target.value)}
            />
          </SettingsField>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h4 className="text-[15px] font-semibold text-foreground">
            Penyebutan nama di email
          </h4>
          <p className="mt-1 text-[13px] leading-5 text-fg2">
            Di bagian mana konsumen menyebut namanya. Pilih "Tidak disebut" untuk
            melatih peserta mencari identitas dari konteks.
          </p>
        </div>

        <SettingsField
          label="Penyebutan nama"
          id="consumer-mention-pattern"
          className="md:max-w-md"
        >
          <SettingsSelect
            id="consumer-mention-pattern"
            value={consumerNameMentionPattern}
            onChange={(e) =>
              setConsumerNameMentionPattern(
                e.target.value as ConsumerNameMentionPattern,
              )
            }
          >
            <option value="random">Acak</option>
            <option value="upfront">Nama disebut di awal</option>
            <option value="middle">Nama disebut di tengah</option>
            <option value="late">Nama disebut di akhir</option>
            <option value="none">Tidak disebut</option>
          </SettingsSelect>
        </SettingsField>
      </section>
    </div>
  );
}
