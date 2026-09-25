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
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Identitas pengirim
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Dipakai AI untuk menyapa dan menandatangani balasan simulasi. Field
            kosong memakai identitas default sistem.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsField label="Nama Pengirim (Header)" id="custom-sender-name">
            <SettingsInput
              id="custom-sender-name"
              type="text"
              placeholder="Contoh: Ahmad Fauzi"
              value={customSenderName}
              onChange={(e) => setCustomSenderName(e.target.value)}
            />
          </SettingsField>

          <SettingsField label="Nama Panggilan (Body)" id="custom-body-name">
            <SettingsInput
              id="custom-body-name"
              type="text"
              placeholder="Contoh: Fauzi"
              value={customBodyName}
              onChange={(e) => setCustomBodyName(e.target.value)}
            />
          </SettingsField>

          <SettingsField label="Email Kantor" id="custom-email">
            <SettingsInput
              id="custom-email"
              type="email"
              placeholder="nama@ojk.go.id"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
            />
          </SettingsField>

          <SettingsField label="Kota Tugas" id="custom-city">
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
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Penyebutan nama konsumen
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Mengatur kapan nama konsumen boleh muncul pada email awal simulasi.
          </p>
        </div>

        <SettingsField
          label="Pola Penyebutan Nama Konsumen"
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
            <option value="none">Tidak menyebut nama</option>
          </SettingsSelect>
        </SettingsField>
      </section>
    </div>
  );
}
